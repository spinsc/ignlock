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
  static final Guid emergency = Guid('8f6a0001-b5a3-4393-e0a9-e50e24dc0005');
  static final Guid control = Guid('8f6a0001-b5a3-4393-e0a9-e50e24dc0006');
}

/// locked = bloqueado sem saldo (nova liberação NFC); paused = partida
/// desativada pelo motorista, com saldo (pode religar); unlocked = liberada.
enum LockStatus { unknown, locked, paused, unlocked }

class LockStatusUpdate {
  final LockStatus status;
  final String driverId;
  final int remainingSeconds;

  LockStatusUpdate({required this.status, required this.driverId, this.remainingSeconds = 0});

  /// Payload do firmware (v1.1): "ESTADO|driverId|saldo_seg|12h"
  factory LockStatusUpdate.parse(String raw) {
    final parts = raw.split('|');
    if (parts.length < 3) {
      return LockStatusUpdate(status: LockStatus.unknown, driverId: '');
    }
    final status = switch (parts[0]) {
      'UNLOCKED' => LockStatus.unlocked,
      'PAUSED' => LockStatus.paused,
      'LOCKED' => LockStatus.locked,
      _ => LockStatus.unknown,
    };
    return LockStatusUpdate(
      status: status,
      driverId: parts[1],
      remainingSeconds: int.tryParse(parts[2]) ?? 0,
    );
  }
}

/// Serviço responsável por escanear, conectar e trocar dados com o ESP32
/// via BLE. Toda a comunicação é local (sem internet) — ver escopo do projeto.
class BleService {
  BluetoothDevice? _device;
  BluetoothCharacteristic? _authChar;
  BluetoothCharacteristic? _statusChar;
  BluetoothCharacteristic? _configChar;
  BluetoothCharacteristic? _emergencyChar;
  BluetoothCharacteristic? _controlChar;

  bool get isConnected => _device != null && _device!.isConnected;

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
      if (c.uuid == GattUuids.emergency) _emergencyChar = c;
      if (c.uuid == GattUuids.control) _controlChar = c;
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

  /// Envia configuração administrativa (requer PIN): tolerância normal e
  /// tolerância do botão de emergência (ver docs/12), em uma única
  /// gravação. Formato esperado pelo firmware: CONFIG:HOURS:EMERGENCY_HOURS:PIN
  Future<void> sendConfig({
    required int hours,
    required int emergencyHours,
    required String adminPin,
  }) async {
    if (_configChar == null) throw Exception('Não conectado ao dispositivo.');
    final payload = 'CONFIG:$hours:$emergencyHours:$adminPin';
    await _configChar!.write(utf8.encode(payload), withoutResponse: false);
  }

  /// Desativa ("PAUSE") ou reativa ("RESUME") a partida preservando o saldo
  /// de tempo de uso. Exige firmware v1.1+ (característica CONTROL).
  Future<void> sendControl(String command, String driverId) async {
    if (_controlChar == null) {
      throw Exception('Este veículo está com firmware antigo (sem controle de partida). Atualize o ESP32.');
    }
    await _controlChar!.write(utf8.encode('$command:$driverId'), withoutResponse: false);
  }

  /// Lê o estado atual direto da característica STATUS.
  Future<LockStatusUpdate> readStatus() async {
    if (_statusChar == null) throw Exception('Não conectado ao dispositivo.');
    final bytes = await _statusChar!.read();
    return LockStatusUpdate.parse(utf8.decode(bytes));
  }

  /// Lê o instante (epoch, ou 0 se não houver) do último acionamento do
  /// botão físico de emergência ainda não confirmado (ver docs/12 e
  /// firmware/src/lock_controller.cpp). Retorna 0 em veículos com firmware
  /// anterior ao botão de emergência (característica ausente).
  Future<int> readPendingEmergencyEpoch() async {
    if (_emergencyChar == null) return 0;
    final bytes = await _emergencyChar!.read();
    final raw = utf8.decode(bytes); // formato: "EMG:<epoch>"
    final parts = raw.split(':');
    if (parts.length < 2) return 0;
    return int.tryParse(parts[1]) ?? 0;
  }

  /// Confirma ao ESP32 que o evento de emergência já foi sincronizado com o
  /// painel — o firmware limpa o registro pendente da memória local (NVS).
  Future<void> ackEmergency() async {
    if (_emergencyChar == null) return;
    await _emergencyChar!.write(utf8.encode('ACK'), withoutResponse: false);
  }

  Future<void> disconnect() async {
    await _device?.disconnect();
    _device = null;
    _authChar = null;
    _statusChar = null;
    _configChar = null;
    _emergencyChar = null;
    _controlChar = null;
  }

  void dispose() {
    _statusController?.close();
    _statusController = null;
  }
}
