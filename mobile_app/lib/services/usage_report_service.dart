import 'package:supabase_flutter/supabase_flutter.dart';
import 'ble_service.dart';
import 'tenant_context.dart';

/// Reporta ao painel o saldo de tempo de uso lido do veículo (tabela
/// usage_snapshots). Melhor esforço: cada foto é o estado completo, então
/// uma perdida offline é superada pela próxima — não há fila. Insert SEM
/// .select() (a chave anônima não tem leitura; ver sync_service.dart).
class UsageReportService {
  final SupabaseClient _client = Supabase.instance.client;
  DateTime _lastSent = DateTime.fromMillisecondsSinceEpoch(0);
  LockStatus? _lastState;

  Future<void> report({
    required String vehicleId,
    required String driverCode,
    required int releasedAtMs,
    required LockStatusUpdate status,
    bool force = false,
  }) async {
    final state = switch (status.status) {
      LockStatus.unlocked => 'UNLOCKED',
      LockStatus.paused => 'PAUSED',
      LockStatus.locked => 'LOCKED',
      LockStatus.unknown => null,
    };
    if (state == null || AppTenant.id == null) return;

    final now = DateTime.now();
    final changed = status.status != _lastState;
    if (!force && !changed && now.difference(_lastSent).inSeconds < 60) return;
    _lastSent = now;
    _lastState = status.status;

    try {
      await _client.from('usage_snapshots').insert({
        'tenant_id': AppTenant.id,
        'vehicle_id': vehicleId,
        'driver_code': driverCode,
        'released_at': DateTime.fromMillisecondsSinceEpoch(releasedAtMs, isUtc: true).toIso8601String(),
        'state': state,
        'remaining_seconds': status.remainingSeconds,
      });
    } catch (_) {
      // Sem internet ou veículo/condutor ainda não cadastrado: ignora.
    }
  }

  /// Encerramento da viagem (desvincular): KM final, fonte e saldo que sobrou.
  /// Retorna false se não conseguiu gravar (sem internet) — o chamador avisa.
  Future<bool> reportTripEnd({
    required String vehicleId,
    required String driverCode,
    required int releasedAtMs,
    required int? endKm,
    required String kmSource,
    required int remainingSeconds,
  }) async {
    if (AppTenant.id == null) return false;
    try {
      await _client.from('trip_ends').insert({
        'tenant_id': AppTenant.id,
        'vehicle_id': vehicleId,
        'driver_code': driverCode,
        'released_at': DateTime.fromMillisecondsSinceEpoch(releasedAtMs, isUtc: true).toIso8601String(),
        'end_odometer_km': endKm,
        'odometer_source': kmSource,
        'remaining_seconds': remainingSeconds,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Crédito de tempo do motorista (saldo não usado, guardado ao desvincular).
  Future<int> creditGet(String driverCode) async {
    if (AppTenant.id == null) return 0;
    try {
      final r = await _client.rpc('driver_credit_get', params: {'p_tenant': AppTenant.id, 'p_code': driverCode});
      return (r as num?)?.toInt() ?? 0;
    } catch (_) {
      return 0;
    }
  }

  Future<bool> creditSet(String driverCode, int seconds) async {
    if (AppTenant.id == null) return false;
    try {
      await _client.rpc('driver_credit_set', params: {'p_tenant': AppTenant.id, 'p_code': driverCode, 'p_seconds': seconds});
      return true;
    } catch (_) {
      return false;
    }
  }
}
