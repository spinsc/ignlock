#include "lock_controller.h"
#include "config.h"

void LockController::begin(Storage *storage, RtcClock *rtc) {
    storage_ = storage;
    rtc_ = rtc;

    // --- FAIL-SAFE DE BOOT ---
    // A PRIMEIRA ação sobre o pino de potência, sempre, é bloquear.
    // Só depois disso avaliamos se existe uma liberação válida a restaurar.
    pinMode(PIN_PUMP_CTRL, OUTPUT);
    pinMode(PIN_STATUS_LED_R, OUTPUT);
    pinMode(PIN_STATUS_LED_G, OUTPUT);
    applyGpioState(false);

    state_ = storage_->loadState();

    uint32_t now = rtc_->nowEpoch();
    if (now == 0) {
        forceLockFailSafe("RTC sem hora confiavel no boot (aguardando sync BLE)");
        return;
    }

    if (state_.expireEpoch > now && state_.driverId.length() > 0) {
        // Ainda dentro da janela de tolerância de uma liberação anterior
        // (o motorista desligou/ligou o veículo dentro das N horas).
        Serial.printf("[LOCK] Restaurando liberacao valida ate epoch=%u (driver=%s)\n",
                      state_.expireEpoch, state_.driverId.c_str());
        applyGpioState(true);
    } else {
        forceLockFailSafe("Janela de tolerancia expirada ou sem liberacao anterior");
    }
}

void LockController::tick() {
    if (!unlocked_) return; // já bloqueado, nada a reavaliar

    uint32_t now = rtc_->nowEpoch();
    if (now == 0 || now >= state_.expireEpoch) {
        forceLockFailSafe("Tolerancia expirou durante operacao");
    }
}

bool LockController::handleAuthPayload(const String &payload) {
    // Formato: DRIVER_ID:VALID_HOURS:EPOCH_TIMESTAMP
    int sep1 = payload.indexOf(':');
    int sep2 = payload.indexOf(':', sep1 + 1);
    if (sep1 <= 0 || sep2 <= sep1) {
        Serial.println("[AUTH] Payload malformado, ignorado.");
        return false;
    }

    String driverId   = payload.substring(0, sep1);
    String hoursStr    = payload.substring(sep1 + 1, sep2);
    String epochStr    = payload.substring(sep2 + 1);

    long hoursLong = hoursStr.toInt();
    long epochLong = epochStr.toInt();

    if (driverId.length() == 0 || driverId.length() > 64) {
        Serial.println("[AUTH] DRIVER_ID invalido.");
        return false;
    }
    if (hoursLong < MIN_TOLERANCE_HOURS || hoursLong > MAX_TOLERANCE_HOURS) {
        Serial.println("[AUTH] VALID_HOURS fora da faixa permitida.");
        return false;
    }
    if (epochLong <= 0) {
        Serial.println("[AUTH] EPOCH_TIMESTAMP invalido.");
        return false;
    }

    uint32_t epoch = (uint32_t)epochLong;
    uint16_t hours = (uint16_t)hoursLong;

    // Sincroniza o RTC com o timestamp do celular (única fonte de tempo
    // real em operação 100% offline).
    rtc_->setEpoch(epoch);

    state_.driverId       = driverId;
    state_.releaseEpoch   = epoch;
    state_.expireEpoch    = epoch + (uint32_t)hours * 3600UL;
    state_.toleranceHours = hours;
    storage_->saveState(state_);

    applyGpioState(true);
    Serial.printf("[AUTH] Liberado para %s ate epoch=%u (%uh)\n",
                  driverId.c_str(), state_.expireEpoch, hours);
    return true;
}

bool LockController::handleConfigPayload(const String &payload, Storage *storage) {
    // Formato: CONFIG:HOURS:ADMIN_PIN
    int sep1 = payload.indexOf(':');
    int sep2 = payload.indexOf(':', sep1 + 1);
    if (sep1 <= 0 || sep2 <= sep1) return false;

    String tag = payload.substring(0, sep1);
    if (tag != "CONFIG") return false;

    String hoursStr = payload.substring(sep1 + 1, sep2);
    String pin      = payload.substring(sep2 + 1);

    if (pin != storage->loadAdminPin()) {
        Serial.println("[CONFIG] PIN administrativo incorreto.");
        return false;
    }

    long hoursLong = hoursStr.toInt();
    if (hoursLong < MIN_TOLERANCE_HOURS || hoursLong > MAX_TOLERANCE_HOURS) {
        Serial.println("[CONFIG] Faixa de horas invalida.");
        return false;
    }

    storage->saveDefaultToleranceHours((uint16_t)hoursLong);
    Serial.printf("[CONFIG] Tolerancia padrao atualizada para %ldh\n", hoursLong);
    return true;
}

String LockController::statusPayload() const {
    // Formato simples e leve para BLE notify: LOCKED|UNLOCKED, driver, expiracao
    char buf[128];
    snprintf(buf, sizeof(buf), "%s|%s|%u|%uh",
             unlocked_ ? "UNLOCKED" : "LOCKED",
             state_.driverId.c_str(),
             state_.expireEpoch,
             state_.toleranceHours);
    return String(buf);
}

void LockController::applyGpioState(bool unlock) {
    unlocked_ = unlock;
    digitalWrite(PIN_PUMP_CTRL, unlock ? HIGH : LOW);
    digitalWrite(PIN_STATUS_LED_G, unlock ? HIGH : LOW);
    digitalWrite(PIN_STATUS_LED_R, unlock ? LOW : HIGH);
}

void LockController::forceLockFailSafe(const char *reason) {
    Serial.printf("[LOCK] Bloqueando (fail-safe): %s\n", reason);
    applyGpioState(false);
}
