import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';
import '../models/trip_log.dart';
import '../models/emergency_event.dart';

/// Persistência local offline-first (SQLite via sqflite) dos logs de viagem
/// e dos eventos do botão de emergência (ver docs/12). Toda liberação bem-
/// sucedida é gravada aqui ANTES de qualquer tentativa de sincronização —
/// o app nunca depende de conectividade para operar.
class LocalDbService {
  static const _dbName = 'ignition_lock.db';
  static const _dbVersion = 2;
  Database? _db;

  Future<Database> get database async {
    _db ??= await _open();
    return _db!;
  }

  Future<Database> _open() async {
    final path = join(await getDatabasesPath(), _dbName);
    return openDatabase(
      path,
      version: _dbVersion,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE trip_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicle_id TEXT NOT NULL,
            driver_id TEXT NOT NULL,
            odometer_km INTEGER NOT NULL,
            destination TEXT NOT NULL,
            valid_hours INTEGER NOT NULL,
            released_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            synced INTEGER NOT NULL DEFAULT 0
          )
        ''');
        await db.execute('CREATE INDEX idx_trip_logs_synced ON trip_logs (synced)');
        await _createEmergencyTable(db);
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          await _createEmergencyTable(db);
        }
      },
    );
  }

  Future<void> _createEmergencyTable(Database db) async {
    await db.execute('''
      CREATE TABLE emergency_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id TEXT NOT NULL,
        triggered_at INTEGER NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0
      )
    ''');
    await db.execute('CREATE INDEX idx_emergency_events_synced ON emergency_events (synced)');
  }

  Future<int> insertTripLog(TripLog log) async {
    final db = await database;
    return db.insert('trip_logs', log.toMap()..remove('id'));
  }

  Future<List<TripLog>> getPendingSync() async {
    final db = await database;
    final rows = await db.query('trip_logs', where: 'synced = 0', orderBy: 'released_at ASC');
    return rows.map(TripLog.fromMap).toList();
  }

  Future<List<TripLog>> getAll({int limit = 100}) async {
    final db = await database;
    final rows = await db.query('trip_logs', orderBy: 'released_at DESC', limit: limit);
    return rows.map(TripLog.fromMap).toList();
  }

  Future<void> markSynced(int id) async {
    final db = await database;
    await db.update('trip_logs', {'synced': 1}, where: 'id = ?', whereArgs: [id]);
  }

  // ---- Eventos do botão de emergência (ver docs/12) ----

  /// Grava localmente um evento lido do ESP32. `null` se já existir um
  /// evento igual (mesmo veículo/instante) — evita duplicar caso o app
  /// leia a característica BLE mais de uma vez antes do firmware confirmar
  /// o ACK (ver BleService.ackEmergency).
  Future<int?> insertEmergencyEventIfNew(EmergencyEvent ev) async {
    final db = await database;
    final existing = await db.query(
      'emergency_events',
      where: 'vehicle_id = ? AND triggered_at = ?',
      whereArgs: [ev.vehicleId, ev.triggeredAt.millisecondsSinceEpoch],
      limit: 1,
    );
    if (existing.isNotEmpty) return null;
    return db.insert('emergency_events', ev.toMap()..remove('id'));
  }

  Future<List<EmergencyEvent>> getPendingEmergencySync() async {
    final db = await database;
    final rows = await db.query('emergency_events', where: 'synced = 0', orderBy: 'triggered_at ASC');
    return rows.map(EmergencyEvent.fromMap).toList();
  }

  Future<void> markEmergencySynced(int id) async {
    final db = await database;
    await db.update('emergency_events', {'synced': 1}, where: 'id = ?', whereArgs: [id]);
  }
}
