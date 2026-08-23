import 'dart:async';
import 'dart:convert';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';

/// UUIDs do serviço GATT do ESP32 — devem bater exatamente com
/// firmware/include/config.h (SVC_UUID_IGNITION_LOCK, CHR_UUID_*).
class GattUuids {
  static final Guid service = Guid('8f6a0001-b5a3-4393-e0a9-e50e24dc0001');
  static final Guid auth = Guid('8f6a0001-b5a3-4393-e0a9-e50e24dc0002');
  static final Guid status = Guid('8f6a0001-b5a3-4393-e0a9-e50e24dc0003');
  static final Guid config = Guid('8f6a0001-b5a3-4393-e0a9-e50e24dc0004');
}

enum LockStatus { unknown, locked, unlocked }

class LockStatusUpdate {
  final LockStatus status;
  final String driverId;
  final DateTime? expiresAt;

  LockStatusUpdate({required this.status, required this.driverId, this.expiresAt});

  /// Payload do firmware: "UNLOCKED|driverId|expireEpoch|12h"
  factory LockStatusUpdate.parse(String raw) {
    final parts = raw.split('|');
    if (parts.length < 3) {
      return LockStatusUpdate(status: LockStatus.unknown, driverId: '');
    }
    final status = parts[0] == 'UNLOCKED' ? LockStatus.unlocked : LockStatus.locked;
    final driverId = parts[1];
    final epoch = int.tryParse(parts[2]) ?? 0;
    final expiresAt = epoch > 0 ? DateTime.fromMillisecondsSinceEpoch(epoch * 1000) : null;
    return LockStatusUpdate(status: status, driverId: driverId, expiresAt: expiresAt);
  }
}

/// Serviço responsável por escanear, conectar e trocar dados com o ESP32
/// via BLE. Toda a comunicação é local (sem internet) — ver escopo do projeto.
class BleService {
  BluetoothDevice? _device;
  BluetoothCharacteristic? _authChar;
  BluetoothCharacteristic? _statusChar;
  BluetoothCharacteristic? _configChar;

  StreamController<LockStatusUpdate>? _statusController;
  Stream<LockStatusUpdate> get statusStream =>
      (_statusController ??= StreamController<LockStatusUpdate>.broadcast()).stream;

  /// Escaneia por MAC específico (lido da tag NFC) e conecta.
  /// Timeout padrão de 15s é suficiente para o veículo estar "por perto".
  Future<void> connectByMac(String macAddress, {Duration timeout = const Duration(seconds: 15)}) async {
    final completer = Completer<BluetoothDevice>();
    late StreamSubscription sub;

    await FlutterBluePlus.startScan(timeout: timeout);
    sub = FlutterBluePlus.scanResults.listen((results) {
      for (final r in results) {
        if (r.device.remoteId.str.toUpperCase() == macAddress.toUpperCase()) {
          if (!completer.isCompleted) completer.complete(r.device);
        }
      }
    });

    final device = await completer.future.timeout(timeout, onTimeout: () {
      throw Exception('Dispositivo BLE $macAddress não encontrado. Verifique se está por perto.');
    });

    await FlutterBluePlus.stopScan();
    await sub.cancel();

    await device.connect(timeout: const Duration(seconds: 10));
    _device = device;

    final services = await device.discoverServices();
    final svc = services.firstWhere(
      (s) => s.uuid == GattUuids.service,
      orElse: () => throw Exception('Serviço GATT esperado não encontrado neste dispositivo.'),
    );

    for (final c in svc.characteristics) {
      if (c.uuid == GattUuids.auth) _authChar = c;
      if (c.uuid == GattUuids.status) _statusChar = c;
      if (c.uuid == GattUuids.config) _configChar = c;
    }

    if (_authChar == null || _statusChar == null) {
      throw Exception('Características GATT obrigatórias ausentes.');
    }

    await _statusChar!.setNotifyValue(true);
    _statusChar!.lastValueStream.listen((bytes) {
      final raw = utf8.decode(bytes);
      _statusController?.add(LockStatusUpdate.parse(raw));
    });
  }

  /// Envia o payload de autenticação: DRIVER_ID:VALID_HOURS:EPOCH_TIMESTAMP
  /// EPOCH_TIMESTAMP é gerado localmente pelo celular (fonte de tempo real
  /// para operação 100% offline — sincroniza o RTC do ESP32).
  Future<void> sendAuth({
    required String driverId,
    required int validHours,
  }) async {
    if (_authChar == null) throw Exception('Não conectado ao dispositivo.');
    final epoch = DateTime.now().toUtc().millisecondsSinceEpoch ~/ 1000;
    final payload = '$driverId:$validHours:$epoch';
    await _authChar!.write(utf8.encode(payload), withoutResponse: false);
  }

  /// Envia configuração administrativa de tolerância (requer PIN).
  Future<void> sendConfig({required int hours, required String adminPin}) async {
    if (_configChar == null) throw Exception('Não conectado ao dispositivo.');
    final payload = 'CONFIG:$hours:$adminPin';
    await _configChar!.write(utf8.encode(payload), withoutResponse: false);
  }

  Future<void> disconnect() async {
    await _device?.disconnect();
    _device = null;
    _authChar = null;
    _statusChar = null;
    _configChar = null;
  }

  void dispose() {
    _statusController?.close();
    _statusController = null;
  }
}
