import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class DriverSession {
  final String driverCode;
  final String fullName;
  const DriverSession(this.driverCode, this.fullName);
}

enum LoginResult { ok, invalid, locked, offline }

/// Login do motorista: matrícula + PIN pessoal, validados no servidor pela
/// função `driver_login` (o hash do PIN nunca chega ao celular). Depois do 1º
/// login a sessão fica salva e a liberação do veículo continua 100% offline.
class DriverSessionService {
  static const _kCode = 'driver_code';
  static const _kName = 'driver_name';

  Future<DriverSession?> load() async {
    final p = await SharedPreferences.getInstance();
    final code = p.getString(_kCode);
    final name = p.getString(_kName);
    if (code == null || name == null) return null;
    return DriverSession(code, name);
  }

  Future<(LoginResult, DriverSession?)> login(String code, String pin) async {
    try {
      final rows = await Supabase.instance.client
          .rpc('driver_login', params: {'p_code': code.trim(), 'p_pin': pin.trim()}) as List;
      if (rows.isEmpty) return (LoginResult.invalid, null);
      final r = rows.first as Map<String, dynamic>;
      switch (r['status']) {
        case 'ok':
          final s = DriverSession(r['driver_code'] as String, r['full_name'] as String);
          final p = await SharedPreferences.getInstance();
          await p.setString(_kCode, s.driverCode);
          await p.setString(_kName, s.fullName);
          return (LoginResult.ok, s);
        case 'locked':
          return (LoginResult.locked, null);
        default:
          return (LoginResult.invalid, null);
      }
    } catch (_) {
      return (LoginResult.offline, null);
    }
  }

  /// Com internet, confere se o motorista continua ativo (o admin pode
  /// desativá-lo). Sem internet, mantém a sessão — o app é offline-first.
  Future<bool> stillActive(String code) async {
    try {
      final r = await Supabase.instance.client.rpc('driver_is_active', params: {'p_code': code});
      return r == true;
    } catch (_) {
      return true;
    }
  }

  Future<void> logout() async {
    final p = await SharedPreferences.getInstance();
    await p.remove(_kCode);
    await p.remove(_kName);
  }
}
