import 'package:shared_preferences/shared_preferences.dart';

/// Último veículo liberado por este motorista neste celular. Permite voltar
/// ao controle da partida (botão desligar/ligar) sem ler a tag NFC de novo, e
/// identifica a liberação (releasedAt) para reportar o saldo ao painel.
class ActiveVehicle {
  final String vehicleId;
  final String bleMac;
  final int releasedAtMs; // epoch ms da liberação (mesmo valor gravado em trip_logs)
  final int validHours; // saldo inicial liberado
  const ActiveVehicle(this.vehicleId, this.bleMac, this.releasedAtMs, this.validHours);
}

class ActiveVehicleStore {
  static const _kId = 'active_vehicle_id';
  static const _kMac = 'active_vehicle_mac';
  static const _kAt = 'active_vehicle_released_ms';
  static const _kHours = 'active_vehicle_hours';

  Future<ActiveVehicle?> load() async {
    final p = await SharedPreferences.getInstance();
    final id = p.getString(_kId);
    final mac = p.getString(_kMac);
    final at = p.getInt(_kAt);
    if (id == null || mac == null || at == null) return null;
    return ActiveVehicle(id, mac, at, p.getInt(_kHours) ?? 0);
  }

  Future<void> save(ActiveVehicle v) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_kId, v.vehicleId);
    await p.setString(_kMac, v.bleMac);
    await p.setInt(_kAt, v.releasedAtMs);
    await p.setInt(_kHours, v.validHours);
  }

  Future<void> clear() async {
    final p = await SharedPreferences.getInstance();
    for (final k in [_kId, _kMac, _kAt, _kHours]) {
      await p.remove(k);
    }
  }
}
