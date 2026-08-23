import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/trip_log.dart';
import 'local_db_service.dart';

/// Sincronização em lote dos logs de viagem com o Supabase (projeto
/// "ignlock"), quando houver conectividade. Chamado oportunisticamente
/// (ex.: ao abrir o app, ou após cada liberação) — nunca bloqueia o fluxo
/// principal de liberação, que é 100% offline por design.
///
/// Importante: a chave usada pelo app é a chave anônima, que só tem
/// permissão de INSERT em `trip_logs` (ver política `anon_insert_trip_logs`
/// no schema). Por isso o insert abaixo NUNCA encadeia `.select()` — pedir
/// o registro de volta exigiria permissão de leitura que o app não tem, e
/// a chamada falharia com um erro de RLS mesmo o insert tendo sido válido.
class SyncService {
  final LocalDbService db;
  final SupabaseClient _client = Supabase.instance.client;

  SyncService(this.db);

  Future<int> syncPending() async {
    final pending = await db.getPendingSync();
    if (pending.isEmpty) return 0;

    var syncedCount = 0;
    for (final log in pending) {
      final ok = await _uploadOne(log);
      if (ok && log.id != null) {
        await db.markSynced(log.id!);
        syncedCount++;
      }
    }
    return syncedCount;
  }

  Future<bool> _uploadOne(TripLog log) async {
    try {
      await _client.from('trip_logs').insert({
        'vehicle_id': log.vehicleId,
        'driver_code': log.driverId,
        'odometer_km': log.odometerKm,
        'destination': log.destination,
        'valid_hours': log.validHours,
        'released_at': log.releasedAt.toUtc().toIso8601String(),
        'expires_at': log.expiresAt.toUtc().toIso8601String(),
      });
      return true;
    } on PostgrestException catch (e) {
      // Erro 23503 (FK violation) tipicamente significa que o VEHICLE_ID ou
      // DRIVER_ID ainda não foi cadastrado no painel — mantemos o log local
      // (synced=0) para nova tentativa após o cadastro ser feito.
      // ignore: avoid_print
      print('[SyncService] Falha ao sincronizar log ${log.id}: ${e.message}');
      return false;
    } catch (e) {
      // Sem conectividade ou erro de rede — tenta novamente na próxima chamada.
      return false;
    }
  }
}
