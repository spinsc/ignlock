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
    pinMode(PIN_EMERGENCY_BTN, INPUT_PULLUP); // opcional — sem botão instalado, fica sempre HIGH (solto)
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
    // Formato: CONFIG:HOURS:EMERGENCY_HOURS:PIN
    // (EMERGENCY_HOURS configura a duração do botão de emergência opcional
    // -- ver docs/12 -- dentro de um teto próprio, mais baixo que o da
    // tolerância normal, para que "configurável" não vire tolerância normal
    // disfarçada.)
    int sep1 = payload.indexOf(':');
    int sep2 = payload.indexOf(':', sep1 + 1);
    int sep3 = payload.indexOf(':', sep2 + 1);
    if (sep1 <= 0 || sep2 <= sep1 || sep3 <= sep2) return false;

    String tag = payload.substring(0, sep1);
    if (tag != "CONFIG") return false;

    String hoursStr    = payload.substring(sep1 + 1, sep2);
    String emgHoursStr = payload.substring(sep2 + 1, sep3);
    String pin         = payload.substring(sep3 + 1);

    if (pin != storage->loadAdminPin()) {
        Serial.println("[CONFIG] PIN administrativo incorreto.");
        return false;
    }

    long hoursLong = hoursStr.toInt();
    if (hoursLong < MIN_TOLERANCE_HOURS || hoursLong > MAX_TOLERANCE_HOURS) {
        Serial.println("[CONFIG] Faixa de horas (tolerancia normal) invalida.");
        return false;
    }

    long emgHoursLong = emgHoursStr.toInt();
    if (emgHoursLong < EMERGENCY_MIN_HOURS || emgHoursLong > EMERGENCY_MAX_HOURS) {
        Serial.println("[CONFIG] Faixa de horas (emergencia) invalida.");
        return false;
    }

    storage->saveDefaultToleranceHours((uint16_t)hoursLong);
    storage->saveEmergencyToleranceHours((uint16_t)emgHoursLong);
    Serial.printf("[CONFIG] Tolerancia padrao=%ldh, emergencia=%ldh\n", hoursLong, emgHoursLong);
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

// ---------------------------------------------------------------------------
// Botão de emergência (opcional) — ver docs/12-emergencia-e-parceiro.md
// ---------------------------------------------------------------------------
bool LockController::pollEmergencyButton() {
    // Normalmente aberto, para GND, com INPUT_PULLUP -- LOW = pressionado.
    bool pressed = (digitalRead(PIN_EMERGENCY_BTN) == LOW);
    uint32_t now = millis();

    if (!pressed) {
        emergencyPressStartMs_ = 0;
        emergencyHandled_ = false;
        return false;
    }
    if (emergencyPressStartMs_ == 0) {
        emergencyPressStartMs_ = now; // início de uma nova pressão
        return false;
    }
    if (emergencyHandled_) return false; // já disparou nesta pressão contínua

    if (now - emergencyPressStartMs_ >= EMERGENCY_HOLD_MS) {
        emergencyHandled_ = true;
        return triggerEmergencyRelease();
    }
    return false;
}

bool LockController::triggerEmergencyRelease() {
    uint32_t now = rtc_->nowEpoch();
    if (now == 0) {
        Serial.println("[EMERGENCY] RTC sem hora confiavel -- liberando mesmo assim, "
                        "instante sera 0 ate proxima sincronizacao via app.");
    }

    // Duracao configuravel pelo admin (característica CONFIG, ver
    // handleConfigPayload) -- cai no valor de fabrica se nunca configurada.
    uint16_t emgHours = storage_->loadEmergencyToleranceHours();

    // Libera por uma janela curta -- e' uma saida de emergencia, nao um
    // turno normal de uso. Assim que possivel, o motorista (ou o parceiro,
    // ver driver_partners) deve autenticar normalmente via NFC/BLE.
    state_.driverId       = "EMERGENCY";
    state_.releaseEpoch   = now;
    state_.expireEpoch    = now + (uint32_t)emgHours * 3600UL;
    state_.toleranceHours = emgHours;
    storage_->saveState(state_);
    storage_->saveEmergencyPendingEpoch(now); // fica pendente ate o app confirmar (ACK) a sincronizacao

    applyGpioState(true);
    Serial.printf("[EMERGENCY] Botao fisico segurado por >=%dms. Liberado por %uh. "
                  "Evento pendente de sincronizacao/justificativa.\n",
                  EMERGENCY_HOLD_MS, emgHours);
    return true;
}

uint32_t LockController::pendingEmergencyEpoch() const {
    return storage_->loadEmergencyPendingEpoch();
}

void LockController::ackEmergencySynced() {
    storage_->clearEmergencyPending();
    Serial.println("[EMERGENCY] App confirmou sincronizacao -- evento limpo da memoria local.");
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
