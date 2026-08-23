import 'dart:async';
import 'dart:convert';
import 'package:nfc_manager/nfc_manager.dart';
import '../models/vehicle_tag.dart';

/// Encapsula a leitura de tags NFC (NDEF) fixadas no painel do veículo.
/// A tag contém o VEHICLE_ID e o MAC BLE do ESP32, evitando que o motorista
/// precise escanear/selecionar manualmente o dispositivo BLE correto.
class NfcService {
  /// Faz uma leitura única de tag NFC e resolve com o [VehicleTag] decodificado,
  /// ou lança [Exception] em caso de tag inválida/incompatível.
  Future<VehicleTag> readVehicleTag() async {
    final isAvailable = await NfcManager.instance.isAvailable();
    if (!isAvailable) {
      throw Exception('NFC indisponível ou desabilitado neste aparelho.');
    }

    final completer = Completer<VehicleTag>();

    await NfcManager.instance.startSession(
      pollingOptions: {NfcPollingOption.iso14443, NfcPollingOption.iso15693},
      onDiscovered: (NfcTag tag) async {
        try {
          final ndef = Ndef.from(tag);
          if (ndef == null || ndef.cachedMessage == null) {
            throw Exception('Tag sem dados NDEF válidos.');
          }

          final record = ndef.cachedMessage!.records.first;
          final text = _decodeTextRecord(record.payload);
          final vehicleTag = VehicleTag.parse(text);

          if (vehicleTag == null) {
            throw Exception('Formato de tag inesperado: "$text"');
          }

          if (!completer.isCompleted) completer.complete(vehicleTag);
        } catch (e) {
          if (!completer.isCompleted) completer.completeError(e);
        } finally {
          await NfcManager.instance.stopSession();
        }
      },
    );

    return completer.future.timeout(
      const Duration(seconds: 20),
      onTimeout: () async {
        await NfcManager.instance.stopSession();
        throw Exception('Tempo esgotado aproximando o celular da tag NFC.');
      },
    );
  }

  /// Decodifica um registro de texto NDEF (RTD Text), pulando o cabeçalho
  /// de status/código de idioma conforme o padrão NFC Forum.
  String _decodeTextRecord(List<int> payload) {
    final statusByte = payload[0];
    final languageCodeLength = statusByte & 0x3F;
    final textBytes = payload.sublist(1 + languageCodeLength);
    return utf8.decode(textBytes);
  }
}
