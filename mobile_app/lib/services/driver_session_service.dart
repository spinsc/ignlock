import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'tenant_context.dart';

class DriverSession {
  final String tenantId;
  final String tenantName;
  final String driverCode;
  final String fullName;
  const DriverSession(this.tenantId, this.tenantName, this.driverCode, this.fullName);
}

enum LoginResult { ok, invalid, locked, offline, tenantNotFound }

/// Login do motorista: no PRIMEIRO acesso informa o nome da empresa (resolvido
/// no servidor), e-mail e senha; depois só e-mail e senha — a empresa fica
/// lembrada neste celular. A senha é conferida no servidor (`driver_login`);
/// o hash nunca chega ao celular. Depois do login a liberação do veículo
/// continua 100% offline.
class DriverSessionService {
  static const _kTenantId = 'tenant_id';
  static const _kTenantName = 'tenant_name';
  static const _kCode = 'driver_code';
  static const _kName = 'driver_name';
  static const _kSettings = 'tenant_settings_json';
  static const _kPartners = 'partner_links_json';

  SupabaseClient get _db => Supabase.instance.client;

  Future<String?> savedTenantName() async => (await SharedPreferences.getInstance()).getString(_kTenantName);

  Future<void> forgetTenant() async {
    final p = await SharedPreferences.getInstance();
    for (final k in [_kTenantId, _kTenantName, _kSettings, _kPartners]) {
      await p.remove(k);
    }
  }

  Future<DriverSession?> load() async {
    final p = await SharedPreferences.getInstance();
    final tid = p.getString(_kTenantId);
    final tname = p.getString(_kTenantName);
    final code = p.getString(_kCode);
    final name = p.getString(_kName);
    if (tid == null || tname == null || code == null || name == null) return null;
    final s = DriverSession(tid, tname, code, name);
    _applyCache(p, s);
    return s;
  }

  void _applyCache(SharedPreferences p, DriverSession s) {
    AppTenant.id = s.tenantId;
    AppTenant.name = s.tenantName;
    final st = p.getString(_kSettings);
    AppTenant.settings = TenantSettings.fromJson(st == null ? null : jsonDecode(st) as Map<String, dynamic>);
    final pl = p.getString(_kPartners);
    AppTenant.partnerLinks = pl == null
        ? const []
        : (jsonDecode(pl) as List)
            .map((e) => PartnerLink(e['vehicle_id'] as String, e['official_driver_code'] as String))
            .toList();
  }

  Future<(LoginResult, DriverSession?)> login({String? company, required String email, required String password}) async {
    try {
      final p = await SharedPreferences.getInstance();
      var tid = p.getString(_kTenantId);
      var tname = p.getString(_kTenantName);

      if (tid == null) {
        final rows = await _db.rpc('resolve_tenant', params: {'p_name': (company ?? '').trim()}) as List;
        if (rows.isEmpty) return (LoginResult.tenantNotFound, null);
        final r = rows.first as Map<String, dynamic>;
        tid = r['id'] as String;
        tname = r['name'] as String;
      }

      final rows = await _db.rpc('driver_login', params: {
        'p_tenant': tid,
        'p_email': email.trim(),
        'p_password': password,
      }) as List;
      if (rows.isEmpty) return (LoginResult.invalid, null);
      final r = rows.first as Map<String, dynamic>;
      switch (r['status']) {
        case 'ok':
          await p.setString(_kTenantId, tid);
          await p.setString(_kTenantName, tname!);
          await p.setString(_kCode, r['driver_code'] as String);
          await p.setString(_kName, r['full_name'] as String);
          final s = DriverSession(tid, tname, r['driver_code'] as String, r['full_name'] as String);
          await refreshTenantData(s);
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

  /// Atualiza (com internet) os parâmetros da empresa e os vínculos de parceiro,
  /// guardando em cache para uso offline. Falhas são silenciosas.
  Future<void> refreshTenantData(DriverSession s) async {
    final p = await SharedPreferences.getInstance();
    try {
      final info = await _db.rpc('tenant_info', params: {'p_tenant': s.tenantId});
      if (info is Map<String, dynamic>) {
        await p.setString(_kSettings, jsonEncode(info['settings']));
      }
      final links = await _db.rpc('driver_partner_links', params: {'p_tenant': s.tenantId, 'p_code': s.driverCode});
      await p.setString(_kPartners, jsonEncode(links));
    } catch (_) {}
    _applyCache(p, s);
  }

  /// Com internet, confere se o motorista continua ativo (o admin pode
  /// desativá-lo). Sem internet, mantém a sessão — o app é offline-first.
  Future<bool> stillActive(DriverSession s) async {
    try {
      final r = await _db.rpc('driver_is_active', params: {'p_tenant': s.tenantId, 'p_code': s.driverCode});
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
