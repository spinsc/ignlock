/// Dados decodificados de uma tag NFC fixada no painel do veículo.
/// Formato NDEF gravado na tag (registro de texto): "VEHICLE_ID;BLE_MAC"
/// Ex.: "TRUCK-042;AA:BB:CC:DD:EE:FF"
/// Ver docs/04-manual.md, Seção D.2 (procedimento de gravação das tags).
class VehicleTag {
  final String vehicleId;
  final String bleMac;

  VehicleTag({required this.vehicleId, required this.bleMac});

  static VehicleTag? parse(String ndefText) {
    final parts = ndefText.trim().split(';');
    if (parts.length != 2) return null;
    final vehicleId = parts[0].trim();
    final bleMac = parts[1].trim().toUpperCase();
    final macPattern = RegExp(r'^([0-9A-F]{2}:){5}[0-9A-F]{2}$');
    if (vehicleId.isEmpty || !macPattern.hasMatch(bleMac)) return null;
    return VehicleTag(vehicleId: vehicleId, bleMac: bleMac);
  }
}
