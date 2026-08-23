/// Registro de viagem gravado localmente (offline-first) antes de ser
/// sincronizado em lote com a nuvem. Ver services/local_db_service.dart.
class TripLog {
  final int? id;
  final String vehicleId;
  final String driverId;
  final int odometerKm;
  final String destination;
  final int validHours;
  final DateTime releasedAt;
  final DateTime expiresAt;
  bool synced;

  TripLog({
    this.id,
    required this.vehicleId,
    required this.driverId,
    required this.odometerKm,
    required this.destination,
    required this.validHours,
    required this.releasedAt,
    required this.expiresAt,
    this.synced = false,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'vehicle_id': vehicleId,
      'driver_id': driverId,
      'odometer_km': odometerKm,
      'destination': destination,
      'valid_hours': validHours,
      'released_at': releasedAt.millisecondsSinceEpoch,
      'expires_at': expiresAt.millisecondsSinceEpoch,
      'synced': synced ? 1 : 0,
    };
  }

  factory TripLog.fromMap(Map<String, dynamic> map) {
    return TripLog(
      id: map['id'] as int?,
      vehicleId: map['vehicle_id'] as String,
      driverId: map['driver_id'] as String,
      odometerKm: map['odometer_km'] as int,
      destination: map['destination'] as String,
      validHours: map['valid_hours'] as int,
      releasedAt: DateTime.fromMillisecondsSinceEpoch(map['released_at'] as int),
      expiresAt: DateTime.fromMillisecondsSinceEpoch(map['expires_at'] as int),
      synced: (map['synced'] as int) == 1,
    );
  }
}
