import 'dart:async';
import 'package:flutter/material.dart';
import '../models/trip_log.dart';
import '../models/vehicle_tag.dart';
import '../models/emergency_event.dart';
import '../services/ble_service.dart';
import '../services/local_db_service.dart';
import '../services/nfc_service.dart';
import '../services/sync_service.dart';
import 'admin_config_screen.dart';

enum _FlowStep { idle, scanningNfc, connectingBle, form, sending, done, error }

/// Fluxo completo do motorista: aproximar do NFC -> conectar BLE -> preencher
/// Condutor/KM/Destino -> enviar autenticação -> confirmar liberação.
/// Ver docs/04-manual.md, Seção D.4 (Manual do Motorista).
class AuthFlowScreen extends StatefulWidget {
  const AuthFlowScreen({super.key});

  @override
  State<AuthFlowScreen> createState() => _AuthFlowScreenState();
}

class _AuthFlowScreenState extends State<AuthFlowScreen> {
  final _formKey = GlobalKey<FormState>();
  final _driverController = TextEditingController();
  final _kmController = TextEditingController();
  final _destinationController = TextEditingController();
  int _validHours = 12; // seletor de validade (admin) — padrão da regra de negócio

  final _nfcService = NfcService();
  final _bleService = BleService();
  final _dbService = LocalDbService();
  late final _syncService = SyncService(_dbService);

  _FlowStep _step = _FlowStep.idle;
  String? _errorMessage;
  VehicleTag? _vehicleTag;
  bool _emergencyPendingWasSynced = false; // mostra aviso não-bloqueante no formulário

  @override
  void dispose() {
    _driverController.dispose();
    _kmController.dispose();
    _destinationController.dispose();
    _bleService.disconnect();
    _bleService.dispose();
    super.dispose();
  }

  Future<void> _startFlow() async {
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

      final ev = EmergencyEvent(
        vehicleId: vehicleId,
        triggeredAt: DateTime.fromMillisecondsSinceEpoch(epoch * 1000, isUtc: true),
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
        driverId: _driverController.text.trim(),
        validHours: _validHours,
      );

      final now = DateTime.now();
      final log = TripLog(
        vehicleId: _vehicleTag!.vehicleId,
        driverId: _driverController.text.trim(),
        odometerKm: int.parse(_kmController.text.trim()),
        destination: _destinationController.text.trim(),
        validHours: _validHours,
        releasedAt: now,
        expiresAt: now.add(Duration(hours: _validHours)),
      );
      await _dbService.insertTripLog(log);

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

  void _reset() {
    _driverController.clear();
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
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.nfc, size: 96),
          const SizedBox(height: 16),
          const Text('Toque para iniciar a liberação', textAlign: TextAlign.center),
          const SizedBox(height: 24),
          FilledButton(onPressed: _startFlow, child: const Text('Aproximar do veículo')),
        ],
      ),
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
          TextFormField(
            controller: _driverController,
            decoration: const InputDecoration(labelText: 'Condutor (ID/Matrícula)'),
            validator: (v) => (v == null || v.trim().isEmpty) ? 'Obrigatório' : null,
          ),
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
            decoration: const InputDecoration(labelText: 'Validade da liberação (tolerância)'),
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
          Text('Liberado por $_validHours horas.', textAlign: TextAlign.center),
          const SizedBox(height: 24),
          FilledButton(onPressed: _reset, child: const Text('Concluir')),
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
