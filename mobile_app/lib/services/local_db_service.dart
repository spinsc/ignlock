import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';
import '../models/trip_log.dart';

/// Persistência local offline-first (SQLite via sqflite) dos logs de viagem.
/// Toda liberação bem-sucedida é gravada aqui ANTES de qualquer tentativa de
/// sincronização — o app nunca depende de conectividade para operar.
class LocalDbService {
  static const _dbName = 'ignition_lock.db';
  static const _dbVersion = 1;
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
      },
    );
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
}
