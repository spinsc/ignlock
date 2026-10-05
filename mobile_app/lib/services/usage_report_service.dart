import 'package:supabase_flutter/supabase_flutter.dart';
import 'ble_service.dart';

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
    if (state == null) return;

    final now = DateTime.now();
    final changed = status.status != _lastState;
    if (!force && !changed && now.difference(_lastSent).inSeconds < 60) return;
    _lastSent = now;
    _lastState = status.status;

    try {
      await _client.from('usage_snapshots').insert({
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
}
