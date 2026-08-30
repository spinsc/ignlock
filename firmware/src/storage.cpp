#include "storage.h"
#include <Preferences.h>
#include "config.h"

static Preferences prefs;

void Storage::begin() {
    // namespace aberto/fechado por chamada para minimizar risco de corrupção
    // em caso de queda de energia abrupta (comum: motorista desliga o carro
    // no meio de uma escrita). Preferences faz commit atômico por chave.
}

LockState Storage::loadState() {
    LockState s;
    prefs.begin(NVS_NAMESPACE, /*readOnly=*/true);
    s.driverId       = prefs.getString(NVS_KEY_DRIVER_ID, "");
    s.releaseEpoch   = prefs.getUInt(NVS_KEY_RELEASE_EPOCH, 0);
    s.expireEpoch    = prefs.getUInt(NVS_KEY_EXPIRE_EPOCH, 0);
    s.toleranceHours = prefs.getUShort(NVS_KEY_TOLERANCE_HOURS, DEFAULT_TOLERANCE_HOURS);
    prefs.end();
    return s;
}

void Storage::saveState(const LockState &state) {
    prefs.begin(NVS_NAMESPACE, /*readOnly=*/false);
    prefs.putString(NVS_KEY_DRIVER_ID, state.driverId);
    prefs.putUInt(NVS_KEY_RELEASE_EPOCH, state.releaseEpoch);
    prefs.putUInt(NVS_KEY_EXPIRE_EPOCH, state.expireEpoch);
    prefs.putUShort(NVS_KEY_TOLERANCE_HOURS, state.toleranceHours);
    prefs.end();
}

void Storage::clearState() {
    prefs.begin(NVS_NAMESPACE, /*readOnly=*/false);
    prefs.putString(NVS_KEY_DRIVER_ID, "");
    prefs.putUInt(NVS_KEY_RELEASE_EPOCH, 0);
    prefs.putUInt(NVS_KEY_EXPIRE_EPOCH, 0);
    prefs.end();
}

uint16_t Storage::loadDefaultToleranceHours() {
    prefs.begin(NVS_NAMESPACE, true);
    uint16_t h = prefs.getUShort(NVS_KEY_TOLERANCE_HOURS, DEFAULT_TOLERANCE_HOURS);
    prefs.end();
    return h;
}

void Storage::saveDefaultToleranceHours(uint16_t hours) {
    prefs.begin(NVS_NAMESPACE, false);
    prefs.putUShort(NVS_KEY_TOLERANCE_HOURS, hours);
    prefs.end();
}

String Storage::loadAdminPin() {
    prefs.begin(NVS_NAMESPACE, true);
    String pin = prefs.getString(NVS_KEY_ADMIN_PIN, DEFAULT_ADMIN_PIN);
    prefs.end();
    return pin;
}

void Storage::saveAdminPin(const String &pin) {
    prefs.begin(NVS_NAMESPACE, false);
    prefs.putString(NVS_KEY_ADMIN_PIN, pin);
    prefs.end();
}

uint32_t Storage::loadEmergencyPendingEpoch() {
    prefs.begin(NVS_NAMESPACE, true);
    uint32_t epoch = prefs.getUInt(NVS_KEY_EMERGENCY_EPOCH, 0);
    prefs.end();
    return epoch;
}

void Storage::saveEmergencyPendingEpoch(uint32_t epoch) {
    prefs.begin(NVS_NAMESPACE, false);
    prefs.putUInt(NVS_KEY_EMERGENCY_EPOCH, epoch);
    prefs.end();
}

void Storage::clearEmergencyPending() {
    prefs.begin(NVS_NAMESPACE, false);
    prefs.putUInt(NVS_KEY_EMERGENCY_EPOCH, 0);
    prefs.end();
}
