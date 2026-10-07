import 'dart:async';
import 'package:flutter/material.dart';
import '../models/emergency_event.dart';
import '../models/trip_log.dart';
import '../models/vehicle_tag.dart';
import '../services/active_vehicle_store.dart';
import '../services/ble_service.dart';
import '../services/driver_session_service.dart';
import '../services/local_db_service.dart';
import '../services/nfc_service.dart';
import '../services/sync_service.dart';
import '../services/tenant_context.dart';
import '../services/usage_report_service.dart';
import '../widgets/ads_stack.dart';
import 'admin_config_screen.dart';
import 'vehicle_control_screen.dart';

enum _FlowStep { idle, scanningNfc, connectingBle, form, sending, done, error }

/// Fluxo completo do motorista: aproximar do NFC -> conectar BLE -> (veículo
/// livre?) -> KM (OBD-II ou digitado)/Destino/tempo -> liberar -> controle da
/// partida. Ver docs/04-manual.md, Seção D.4 (Manual do Motorista).
class AuthFlowScreen extends StatefulWidget {
  final DriverSession session;
  final VoidCallback onLogout;

  const AuthFlowScreen({super.key, required this.session, required this.onLogout});

  @override
  State<AuthFlowScreen> createState() => _AuthFlowScreenState();
}

class _AuthFlowScreenState extends State<AuthFlowScreen> {
  final _formKey = GlobalKey<FormState>();
  final _kmController = TextEditingController();
  final _destinationController = TextEditingController();
  late int _validHours = AppTenant.settings.defaultValidityHours;

  final _nfcService = NfcService();
  final _bleService = BleService();
  final _dbService = LocalDbService();
  late final _syncService = SyncService(_dbService);
  final _usage = UsageReportService();

  _FlowStep _step = _FlowStep.idle;
  String? _errorMessage;
  VehicleTag? _vehicleTag;
  bool _emergencyPendingWasSynced = false;
  final _activeStore = ActiveVehicleStore();
  ActiveVehicle? _active; // último veículo liberado: atalho para o controle da partida

  int _creditSeconds = 0; // crédito de tempo deste motorista (saldo de viagens anteriores)
  bool _useCredit = false;
  bool _kmFromObd = false;

  @override
  void initState() {
    super.initState();
    _activeStore.load().then((v) {
      if (mounted) setState(() => _active = v);
    });
  }

  @override
  void dispose() {
    _kmController.dispose();
    _destinationController.dispose();
    _bleService.disconnect();
    _bleService.dispose();
    super.dispose();
  }

  String _fmt(int secs) {
    final h = secs ~/ 3600, m = (secs % 3600) ~/ 60;
    return '${h}h ${m.toString().padLeft(2, '0')}min';
  }

  Future<void> _startFlow() async {
    await _bleService.disconnect(); // o ESP32 aceita pouca conexão simultânea: nunca deixar uma pendurada
    setState(() {
      _step = _FlowStep.scanningNfc;
      _errorMessage = null;
    });

    try {
      final tag = await _nfcService.readVehicleTag();
      _vehicleTag = tag;

      setState(() => _step = _FlowStep.connectingBle);
      await _bleService.connectByMac(tag.bleMac);

      // Evento de emergência pendente no ESP32: sincroniza agora (melhor esforço).
      await _checkPendingEmergency(tag.vehicleId);

      // Exclusividade: enquanto outro motorista está vinculado e tem saldo, o
      // veículo não pode ser liberado — exceto pelo motorista PARCEIRO dele.
      final me = widget.session.driverCode;
      final st = await _bleService.readStatus();
      final holder = st.driverId;
      final occupied = (st.status == LockStatus.unlocked || st.status == LockStatus.paused) &&
          holder.isNotEmpty &&
          holder != 'EMERGENCY' &&
          st.remainingSeconds > 0;
      if (occupied && holder != me) {
        if (AppTenant.isPartnerOf(tag.vehicleId, holder)) {
          await _openControl(ActiveVehicle(tag.vehicleId, tag.bleMac, 0, 0), holder);
          return;
        }
        throw Exception('Veículo em uso por $holder (restam ${_fmt(st.remainingSeconds)}). '
            'Só o motorista parceiro dele, ou o próprio motorista ao desvincular, libera o veículo.');
      }
      if (occupied && holder == me) {
        // Posse já é sua: volta direto ao controle da partida.
        final known = _active?.vehicleId == tag.vehicleId ? _active! : ActiveVehicle(tag.vehicleId, tag.bleMac, DateTime.now().millisecondsSinceEpoch, 0);
        await _openControl(known);
        return;
      }

      // Novo vínculo: crédito de tempo e KM inicial (OBD-II quando disponível).
      _creditSeconds = await _usage.creditGet(me);
      _useCredit = false;
      final odo = await _bleService.readOdometerKm();
      _kmFromObd = odo != null;
      if (odo != null) _kmController.text = odo.toString();

      setState(() => _step = _FlowStep.form);
    } catch (e) {
      setState(() {
        _step = _FlowStep.error;
        _errorMessage = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _checkPendingEmergency(String vehicleId) async {
    try {
      final epoch = await _bleService.readPendingEmergencyEpoch();
      if (epoch <= 0) return;

      // epoch == 1: acionado com o RTC do ESP32 sem hora válida (firmware:
      // EMERGENCY_TIME_UNKNOWN). Usa a hora desta leitura e evita duplicar.
      final unknownTime = epoch == 1;
      if (unknownTime) {
        final pending = await _dbService.getPendingEmergencySync();
        if (pending.any((e) => e.vehicleId == vehicleId)) {
          await _syncService.syncPendingEmergency().then((n) async {
            if (n > 0) await _bleService.ackEmergency();
          });
          return;
        }
      }
      final ev = EmergencyEvent(
        vehicleId: vehicleId,
        triggeredAt: unknownTime ? DateTime.now() : DateTime.fromMillisecondsSinceEpoch(epoch * 1000, isUtc: true),
      );
      final id = await _dbService.insertEmergencyEventIfNew(ev);
      if (id != null) {
        final synced = await _syncService.syncPendingEmergency();
        if (synced > 0) await _bleService.ackEmergency();
      } else {
        await _syncService.syncPendingEmergency();
      }
      if (mounted) setState(() => _emergencyPendingWasSynced = true);
    } catch (_) {
      // Sem conectividade, veículo sem essa característica, etc. — ignora.
    }
  }

  Future<void> _submitForm() async {
    if (!_formKey.currentState!.validate()) return;
    if (_vehicleTag == null) return;

    setState(() => _step = _FlowStep.sending);

    try {
      final me = widget.session.driverCode;
      final useCredit = _useCredit && _creditSeconds >= 60;
      final hours = useCredit ? (_creditSeconds / 3600).ceil().clamp(1, 48) : _validHours;
      final budget = useCredit ? _creditSeconds.clamp(60, 48 * 3600) : null;
      final grantedSeconds = budget ?? hours * 3600;

      await _bleService.sendAuth(driverId: me, validHours: hours, budgetSeconds: budget);

      // O BLE aceita a escrita mesmo quando o firmware recusa a regra
      // (ex.: veículo vinculado a outro motorista): confere o resultado.
      final st = await _bleService.readStatus();
      if (st.status != LockStatus.unlocked || st.driverId != me) {
        throw Exception(st.driverId.isNotEmpty && st.driverId != me
            ? 'O veículo está vinculado a ${st.driverId} e recusou a liberação.'
            : 'O veículo não confirmou a liberação. Tente de novo.');
      }

      final now = DateTime.now();
      final log = TripLog(
        vehicleId: _vehicleTag!.vehicleId,
        driverId: me,
        odometerKm: int.parse(_kmController.text.trim()),
        destination: _destinationController.text.trim(),
        validHours: hours,
        releasedAt: now,
        expiresAt: now.add(Duration(seconds: grantedSeconds)),
        odometerSource: _kmFromObd ? 'obd' : 'manual',
      );
      await _dbService.insertTripLog(log);
      final active = ActiveVehicle(_vehicleTag!.vehicleId, _vehicleTag!.bleMac, now.millisecondsSinceEpoch, hours);
      await _activeStore.save(active);
      _active = active;
      unawaited(_usage.report(
        vehicleId: active.vehicleId,
        driverCode: me,
        releasedAtMs: active.releasedAtMs,
        status: LockStatusUpdate(status: LockStatus.unlocked, driverId: me, remainingSeconds: grantedSeconds),
        force: true,
      ));
      if (useCredit) unawaited(_usage.creditSet(me, 0)); // crédito consumido

      unawaited(_syncService.syncPending());
      setState(() => _step = _FlowStep.done);
    } catch (e) {
      setState(() {
        _step = _FlowStep.error;
        _errorMessage = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  /// Abre o controle da partida (botão ligar/desligar). O ESP32 aceita pouca
  /// conexão BLE simultânea, então solta a desta tela antes de abrir a outra.
  Future<void> _openControl([ActiveVehicle? vehicle, String? actingFor]) async {
    final v = vehicle ?? _active;
    if (v == null) return;
    await _bleService.disconnect();
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => VehicleControlScreen(session: widget.session, vehicle: v, actingFor: actingFor),
      ),
    );
    final still = await _activeStore.load(); // pode ter sido desvinculado
    if (mounted) {
      setState(() => _active = still);
      _reset();
    }
  }

  void _reset() {
    _kmController.clear();
    _destinationController.clear();
    _bleService.disconnect();
    setState(() {
      _step = _FlowStep.idle;
      _errorMessage = null;
      _vehicleTag = null;
      _emergencyPendingWasSynced = false;
      _kmFromObd = false;
      _useCredit = false;
    });
  }

  Future<void> _openAdminConfig() async {
    if (_vehicleTag == null) return;
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => AdminConfigScreen(bleService: _bleService, vehicleId: _vehicleTag!.vehicleId),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(children: [
          if (AppTenant.settings.logoUrl != null) ...[
            Image.network(AppTenant.settings.logoUrl!, height: 28, errorBuilder: (_, __, ___) => const SizedBox.shrink()),
            const SizedBox(width: 10),
          ],
          Flexible(child: Text(AppTenant.name ?? 'Liberação de Partida', overflow: TextOverflow.ellipsis)),
        ]),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sair (${widget.session.fullName})',
            onPressed: widget.onLogout,
          ),
          if (_step == _FlowStep.form)
            IconButton(
              icon: const Icon(Icons.settings),
              tooltip: 'Configuração administrativa',
              onPressed: _openAdminConfig,
            ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    switch (_step) {
      case _FlowStep.idle:
        return _buildIdle();
      case _FlowStep.scanningNfc:
        return _buildLoading('Aproxime o celular da tag NFC no painel...');
      case _FlowStep.connectingBle:
        return _buildLoading('Conectando ao veículo ${_vehicleTag?.vehicleId ?? ''}...');
      case _FlowStep.form:
        return _buildForm();
      case _FlowStep.sending:
        return _buildLoading('Enviando liberação...');
      case _FlowStep.done:
        return _buildDone();
      case _FlowStep.error:
        return _buildError();
    }
  }

  Widget _buildIdle() {
    return Column(
      children: [
        const AdsStack(), // anúncios dos apoiadores, empilhados no topo
        Expanded(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.nfc, size: 96),
                const SizedBox(height: 16),
                Text('Olá, ${widget.session.fullName}', textAlign: TextAlign.center),
                const SizedBox(height: 4),
                const Text('Toque para iniciar a liberação', textAlign: TextAlign.center),
                const SizedBox(height: 24),
                FilledButton(onPressed: _startFlow, child: const Text('Aproximar do veículo')),
                if (_active != null) ...[
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () => _openControl(),
                    icon: const Icon(Icons.power_settings_new),
                    label: Text('Ligar/desligar partida — ${_active!.vehicleId}'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildLoading(String message) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 16),
          Text(message, textAlign: TextAlign.center),
        ],
      ),
    );
  }

  Widget _buildForm() {
    final options = AppTenant.settings.validityOptions;
    return Form(
      key: _formKey,
      child: ListView(
        children: [
          Text('Veículo: ${_vehicleTag!.vehicleId}', style: Theme.of(context).textTheme.titleMedium),
          if (_emergencyPendingWasSynced) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.amber.withOpacity(0.15),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: Colors.amber),
              ),
              child: const Text(
                'Este veículo teve o botão de emergência acionado recentemente. '
                'O evento foi enviado ao painel — a justificativa pode ser preenchida '
                'lá ou administrativamente.',
                style: TextStyle(fontSize: 12.5),
              ),
            ),
          ],
          const SizedBox(height: 16),
          Text('Condutor: ${widget.session.fullName} (${widget.session.driverCode})',
              style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 12),
          TextFormField(
            controller: _kmController,
            readOnly: _kmFromObd,
            decoration: InputDecoration(
              labelText: 'KM atual do odômetro',
              helperText: _kmFromObd ? 'Lido da porta OBD-II do veículo' : 'Digite o KM do painel',
              suffixIcon: _kmFromObd ? const Icon(Icons.settings_input_component, size: 18) : null,
            ),
            keyboardType: TextInputType.number,
            validator: (v) {
              if (v == null || v.trim().isEmpty) return 'Obrigatório';
              final n = int.tryParse(v.trim());
              if (n == null || n < 0) return 'KM inválido';
              return null;
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _destinationController,
            decoration: const InputDecoration(labelText: 'Destino'),
            validator: (v) => (v == null || v.trim().isEmpty) ? 'Obrigatório' : null,
          ),
          const SizedBox(height: 12),
          if (_creditSeconds >= 60)
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: _useCredit,
              onChanged: (v) => setState(() => _useCredit = v ?? false),
              title: Text('Usar meu crédito de ${_fmt(_creditSeconds)}'),
              subtitle: const Text('Tempo que sobrou de uma viagem anterior (em vez de um novo saldo).'),
            ),
          if (!(_useCredit && _creditSeconds >= 60))
            DropdownButtonFormField<int>(
              value: options.contains(_validHours) ? _validHours : options.first,
              decoration: const InputDecoration(labelText: 'Tempo de uso liberado (horas)'),
              items: options.map((h) => DropdownMenuItem(value: h, child: Text('$h horas'))).toList(),
              onChanged: (v) => setState(() => _validHours = v ?? options.first),
            ),
          const SizedBox(height: 24),
          FilledButton(onPressed: _submitForm, child: const Text('Liberar partida')),
        ],
      ),
    );
  }

  Widget _buildDone() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.check_circle, size: 96, color: Colors.green),
          const SizedBox(height: 16),
          const Text('Veículo liberado.', textAlign: TextAlign.center),
          const SizedBox(height: 4),
          const Text('O tempo só desconta com a partida ligada.', textAlign: TextAlign.center),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: () => _openControl(),
            icon: const Icon(Icons.power_settings_new),
            label: const Text('Abrir controle da partida'),
          ),
          const SizedBox(height: 8),
          TextButton(onPressed: _reset, child: const Text('Concluir')),
        ],
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error, size: 96, color: Colors.red),
          const SizedBox(height: 16),
          Text(_errorMessage ?? 'Erro desconhecido', textAlign: TextAlign.center),
          const SizedBox(height: 24),
          FilledButton(onPressed: _reset, child: const Text('Tentar novamente')),
        ],
      ),
    );
  }
}
