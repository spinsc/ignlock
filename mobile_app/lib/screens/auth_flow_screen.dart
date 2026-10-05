import 'dart:async';
import 'package:flutter/material.dart';
import '../models/trip_log.dart';
import '../models/vehicle_tag.dart';
import '../models/emergency_event.dart';
import '../models/sponsor_ad.dart';
import '../services/ble_service.dart';
import '../services/local_db_service.dart';
import '../services/nfc_service.dart';
import '../services/sponsor_ads_service.dart';
import '../services/sync_service.dart';
import '../widgets/sponsor_ad_banner.dart';
import '../services/driver_session_service.dart';
import '../services/active_vehicle_store.dart';
import '../services/usage_report_service.dart';
import 'admin_config_screen.dart';
import 'vehicle_control_screen.dart';

enum _FlowStep { idle, scanningNfc, connectingBle, form, sending, done, error }

/// Fluxo completo do motorista: aproximar do NFC -> conectar BLE -> preencher
/// Condutor/KM/Destino -> enviar autenticação -> confirmar liberação.
/// Ver docs/04-manual.md, Seção D.4 (Manual do Motorista).
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
  int _validHours = 12; // seletor de validade (admin) — padrão da regra de negócio

  final _nfcService = NfcService();
  final _bleService = BleService();
  final _dbService = LocalDbService();
  late final _syncService = SyncService(_dbService);
  final _sponsorAdsService = SponsorAdsService();

  _FlowStep _step = _FlowStep.idle;
  String? _errorMessage;
  VehicleTag? _vehicleTag;
  bool _emergencyPendingWasSynced = false; // mostra aviso não-bloqueante no formulário
  SponsorAd? _sponsorAd; // exibido de forma discreta só na tela inicial (idle)
  final _activeStore = ActiveVehicleStore();
  ActiveVehicle? _active; // último veículo liberado: atalho para o controle da partida

  @override
  void initState() {
    super.initState();
    _activeStore.load().then((v) {
      if (mounted) setState(() => _active = v);
    });
    // Melhor esforço, nunca bloqueia nem falha a tela — é conteúdo
    // secundário (ver SponsorAdsService.fetchOne).
    _sponsorAdsService.fetchOne().then((ad) {
      if (mounted) setState(() => _sponsorAd = ad);
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

      // Se o veículo tem firmware com botão de emergência (ver docs/12) e
      // houve um acionamento ainda não confirmado, sincroniza com o painel
      // agora — é a primeira oportunidade de conectividade desde o evento.
      // Não bloqueia nem falha o fluxo normal de liberação por conta disso.
      await _checkPendingEmergency(tag.vehicleId);

      setState(() => _step = _FlowStep.form);
    } catch (e) {
      setState(() {
        _step = _FlowStep.error;
        _errorMessage = e.toString();
      });
    }
  }

  /// Lê a característica de emergência do ESP32; se houver um evento
  /// pendente, grava localmente, tenta sincronizar com o Supabase e, se
  /// deu certo, confirma (ACK) ao firmware para não reenviar depois.
  /// Qualquer falha aqui é silenciosa — nunca deve impedir a liberação
  /// normal, que é o fluxo principal desta tela.
  Future<void> _checkPendingEmergency(String vehicleId) async {
    try {
      final epoch = await _bleService.readPendingEmergencyEpoch();
      if (epoch <= 0) return;

      // epoch == 1: acionado com o RTC do ESP32 sem hora válida e ainda não
      // corrigido (firmware: EMERGENCY_TIME_UNKNOWN). Usa a hora desta leitura
      // — aproximada, mas melhor que 1970 — e evita duplicar se uma tentativa
      // anterior de sincronizar ficou pendente.
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
        triggeredAt: unknownTime
            ? DateTime.now()
            : DateTime.fromMillisecondsSinceEpoch(epoch * 1000, isUtc: true),
      );
      final id = await _dbService.insertEmergencyEventIfNew(ev);
      if (id != null) {
        final synced = await _syncService.syncPendingEmergency();
        if (synced > 0) await _bleService.ackEmergency();
      } else {
        // Já registrado localmente em uma leitura anterior — ainda assim
        // tenta sincronizar (pode ter falhado por falta de rede na vez passada).
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
      await _bleService.sendAuth(
        driverId: widget.session.driverCode,
        validHours: _validHours,
      );

      final now = DateTime.now();
      final log = TripLog(
        vehicleId: _vehicleTag!.vehicleId,
        driverId: widget.session.driverCode,
        odometerKm: int.parse(_kmController.text.trim()),
        destination: _destinationController.text.trim(),
        validHours: _validHours,
        releasedAt: now,
        expiresAt: now.add(Duration(hours: _validHours)),
      );
      await _dbService.insertTripLog(log);
      final active = ActiveVehicle(
          _vehicleTag!.vehicleId, _vehicleTag!.bleMac, now.millisecondsSinceEpoch, _validHours);
      await _activeStore.save(active);
      _active = active;
      unawaited(UsageReportService().report(
        vehicleId: active.vehicleId,
        driverCode: widget.session.driverCode,
        releasedAtMs: active.releasedAtMs,
        status: LockStatusUpdate(
            status: LockStatus.unlocked, driverId: widget.session.driverCode, remainingSeconds: _validHours * 3600),
        force: true,
      ));

      // Sincroniza em segundo plano — não bloqueia a confirmação ao
      // motorista, que já pode dar partida (fluxo é offline-first).
      unawaited(_syncService.syncPending());

      setState(() => _step = _FlowStep.done);
    } catch (e) {
      setState(() {
        _step = _FlowStep.error;
        _errorMessage = e.toString();
      });
    }
  }

  /// Abre o controle da partida (botão ligar/desligar). O ESP32 aceita uma
  /// conexão BLE por vez, então solta a desta tela antes de abrir a outra.
  Future<void> _openControl() async {
    final v = _active;
    if (v == null) return;
    await _bleService.disconnect();
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => VehicleControlScreen(session: widget.session, vehicle: v)),
    );
    if (mounted) _reset();
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
        title: const Text('Liberação de Partida'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sair (${widget.session.fullName})',
            onPressed: widget.onLogout,
          ),
          // Só disponível com o veículo já conectado via BLE — a
          // configuração é protegida pelo PIN administrativo do próprio
          // ESP32 (ver AdminConfigScreen), não pelo login do app.
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
        Expanded(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.nfc, size: 96),
                const SizedBox(height: 16),
                const Text('Toque para iniciar a liberação', textAlign: TextAlign.center),
                const SizedBox(height: 24),
                FilledButton(onPressed: _startFlow, child: const Text('Aproximar do veículo')),
                if (_active != null) ...[
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: _openControl,
                    icon: const Icon(Icons.power_settings_new),
                    label: Text('Ligar/desligar partida — ${_active!.vehicleId}'),
                  ),
                ],
              ],
            ),
          ),
        ),
        // Espaço discreto de patrocinador — só na tela inicial, nunca
        // durante o fluxo de liberação em si (ver docs/13-patrocinadores.md).
        if (_sponsorAd != null) ...[
          SponsorAdBanner(ad: _sponsorAd!),
          const SizedBox(height: 8),
        ],
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
            decoration: const InputDecoration(labelText: 'KM atual do odômetro'),
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
          DropdownButtonFormField<int>(
            value: _validHours,
            decoration: const InputDecoration(labelText: 'Tempo de uso liberado (horas)'),
            items: const [4, 8, 12, 24, 48]
                .map((h) => DropdownMenuItem(value: h, child: Text('$h horas')))
                .toList(),
            onChanged: (v) => setState(() => _validHours = v ?? 12),
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
          Text('Liberado: $_validHours horas de uso.', textAlign: TextAlign.center),
          const SizedBox(height: 4),
          const Text('O tempo só desconta com a partida ligada.', textAlign: TextAlign.center),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: _openControl,
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
