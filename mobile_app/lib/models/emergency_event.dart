/// Evento do botão físico de emergência, sincronizado do ESP32 (via BLE, ver
/// BleService.readPendingEmergency) para a nuvem. Gravado localmente
/// (offline-first) igual a TripLog — ver services/local_db_service.dart.
class EmergencyEvent {
  final int? id;
  final String vehicleId;
  final DateTime triggeredAt;
  bool synced;

  EmergencyEvent({
    this.id,
    required this.vehicleId,
    required this.triggeredAt,
    this.synced = false,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'vehicle_id': vehicleId,
      'triggered_at': triggeredAt.millisecondsSinceEpoch,
      'synced': synced ? 1 : 0,
    };
  }

  factory EmergencyEvent.fromMap(Map<String, dynamic> map) {
    return EmergencyEvent(
      id: map['id'] as int?,
      vehicleId: map['vehicle_id'] as String,
      triggeredAt: DateTime.fromMillisecondsSinceEpoch(map['triggered_at'] as int),
      synced: (map['synced'] as int) == 1,
    );
  }
}
