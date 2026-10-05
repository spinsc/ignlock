import 'package:shared_preferences/shared_preferences.dart';

/// Último veículo liberado por este motorista neste celular. Permite voltar
/// ao controle da partida (botão desligar/ligar) sem ler a tag NFC de novo.
class ActiveVehicle {
  final String vehicleId;
  final String bleMac;
  const ActiveVehicle(this.vehicleId, this.bleMac);
}

class ActiveVehicleStore {
  static const _kId = 'active_vehicle_id';
  static const _kMac = 'active_vehicle_mac';

  Future<ActiveVehicle?> load() async {
    final p = await SharedPreferences.getInstance();
    final id = p.getString(_kId);
    final mac = p.getString(_kMac);
    if (id == null || mac == null) return null;
    return ActiveVehicle(id, mac);
  }

  Future<void> save(ActiveVehicle v) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_kId, v.vehicleId);
    await p.setString(_kMac, v.bleMac);
  }

  Future<void> clear() async {
    final p = await SharedPreferences.getInstance();
    await p.remove(_kId);
    await p.remove(_kMac);
  }
}
