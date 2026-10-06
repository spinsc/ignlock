import 'package:flutter/material.dart';
import '../services/ble_service.dart';
import '../services/tenant_context.dart';

/// Configuração administrativa do veículo já conectado por BLE: tolerância
/// padrão (janela normal de liberação) e tolerância do botão de emergência
/// (ver docs/12-emergencia-e-parceiro.md), ambas protegidas pelo PIN
/// administrativo do próprio ESP32 (não é a senha do painel web — cada
/// veículo tem o seu, ver docs/04-manual.md).
class AdminConfigScreen extends StatefulWidget {
  final BleService bleService;
  final String vehicleId;

  const AdminConfigScreen({super.key, required this.bleService, required this.vehicleId});

  @override
  State<AdminConfigScreen> createState() => _AdminConfigScreenState();
}

class _AdminConfigScreenState extends State<AdminConfigScreen> {
  final _formKey = GlobalKey<FormState>();
  final _pinController = TextEditingController();
  late int _hours = AppTenant.settings.defaultValidityHours.clamp(1, 48);
  // Opções de emergência respeitam o teto definido pela empresa no painel (Parâmetros).
  late final List<int> _emergencyOptions =
      [1, 2, 4, 6].where((h) => h <= AppTenant.settings.emergencyMaxHours).toList().isEmpty
          ? [1]
          : [1, 2, 4, 6].where((h) => h <= AppTenant.settings.emergencyMaxHours).toList();
  late int _emergencyHours =
      _emergencyOptions.contains(AppTenant.settings.emergencyDefaultHours) ? AppTenant.settings.emergencyDefaultHours : _emergencyOptions.first;

  bool _saving = false;
  String? _message;
  bool _messageIsError = false;

  @override
  void dispose() {
    _pinController.dispose();
    super.dispose();
  }

  /// Libera o veículo à força (motorista esqueceu de desvincular ou perdeu o
  /// celular). Protegido pelo PIN administrativo do próprio ESP32.
  Future<void> _forceUnbind() async {
    if (_pinController.text.trim().isEmpty) {
      setState(() {
        _message = 'Informe o PIN administrativo do veículo.';
        _messageIsError = true;
      });
      return;
    }
    setState(() {
      _saving = true;
      _message = null;
    });
    try {
      await widget.bleService.sendAdminUnbind(_pinController.text.trim());
      await Future.delayed(const Duration(milliseconds: 400));
      final st = await widget.bleService.readStatus();
      final ok = st.driverId.isEmpty;
      setState(() {
        _message = ok
            ? 'Veículo liberado: nenhum motorista vinculado.'
            : 'O veículo recusou (PIN incorreto?). Vinculado a ${st.driverId}.';
        _messageIsError = !ok;
      });
    } catch (e) {
      setState(() {
        _message = 'Falha ao enviar: $e';
        _messageIsError = true;
      });
    } finally {
      setState(() => _saving = false);
    }
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _message = null;
    });
    try {
      await widget.bleService.sendConfig(
        hours: _hours,
        emergencyHours: _emergencyHours,
        adminPin: _pinController.text.trim(),
      );
      setState(() {
        _message = 'Configuração enviada. Confirme no painel do veículo que o LED voltou ao normal.';
        _messageIsError = false;
      });
    } catch (e) {
      setState(() {
        _message = 'Falha ao enviar: $e';
        _messageIsError = true;
      });
    } finally {
      setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Configuração — ${widget.vehicleId}')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: ListView(
            children: [
              Text(
                'Alterações aqui valem só para este veículo (${widget.vehicleId}) — '
                'o PIN administrativo é gravado no próprio ESP32, não no painel web.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 20),
              DropdownButtonFormField<int>(
                initialValue: _hours,
                decoration: const InputDecoration(labelText: 'Tolerância padrão (uso normal)'),
                items: const [4, 8, 12, 24, 48]
                    .map((h) => DropdownMenuItem(value: h, child: Text('$h horas')))
                    .toList(),
                onChanged: (v) => setState(() => _hours = v ?? _hours),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<int>(
                initialValue: _emergencyHours,
                decoration: const InputDecoration(
                  labelText: 'Tolerância do botão de emergência',
                  helperText: 'Janela curta de propósito — não é para uso diário.',
                  helperMaxLines: 2,
                ),
                items: _emergencyOptions
                    .map((h) => DropdownMenuItem(value: h, child: Text('$h hora${h == 1 ? '' : 's'}')))
                    .toList(),
                onChanged: (v) => setState(() => _emergencyHours = v ?? _emergencyHours),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _pinController,
                decoration: const InputDecoration(labelText: 'PIN administrativo do veículo'),
                keyboardType: TextInputType.number,
                obscureText: true,
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Obrigatório' : null,
              ),
              const SizedBox(height: 24),
              if (_message != null) ...[
                Text(
                  _message!,
                  style: TextStyle(color: _messageIsError ? Colors.red : Colors.green),
                ),
                const SizedBox(height: 12),
              ],
              FilledButton(
                onPressed: _saving ? null : _save,
                child: _saving ? const CircularProgressIndicator() : const Text('Salvar configuração'),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _saving ? null : _forceUnbind,
                icon: const Icon(Icons.link_off),
                label: const Text('Liberar veículo (desvincular motorista)'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
