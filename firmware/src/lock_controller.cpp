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

    // O saldo de uso é contado por millis() (não depende do RTC), então a
    // restauração também não: chave desligada/ligada com saldo e sem pausa
    // do motorista = continua liberado, retomando a contagem de onde parou.
    if (state_.remainingSec > 0 && state_.driverId.length() > 0 && !state_.paused) {
        Serial.printf("[LOCK] Restaurando liberacao: saldo=%us (driver=%s)\n",
                      state_.remainingSec, state_.driverId.c_str());
        applyGpioState(true);
        startCounting();
    } else if (state_.paused && state_.remainingSec > 0) {
        Serial.printf("[LOCK] Partida desativada pelo motorista (saldo=%us) -- aguardando RESUME.\n",
                      state_.remainingSec);
        forceLockFailSafe("Partida desativada pelo motorista (PAUSED)");
    } else {
        forceLockFailSafe("Sem saldo de tempo de uso ou sem liberacao anterior");
    }
}

void LockController::startCounting() {
    countStartMs_ = millis();
    lastPersistMs_ = countStartMs_;
}

void LockController::accountElapsed() {
    if (!unlocked_) return;
    uint32_t nowMs = millis();
    uint32_t elapsedS = (nowMs - countStartMs_) / 1000UL; // aritmética sem sinal: segura no overflow
    if (elapsedS == 0) return;
    countStartMs_ += elapsedS * 1000UL; // preserva a fração de segundo
    state_.remainingSec = (elapsedS >= state_.remainingSec) ? 0 : state_.remainingSec - elapsedS;
}

uint32_t LockController::remainingSeconds() const {
    if (!unlocked_) return state_.remainingSec;
    uint32_t elapsedS = (millis() - countStartMs_) / 1000UL;
    return (elapsedS >= state_.remainingSec) ? 0 : state_.remainingSec - elapsedS;
}

void LockController::tick() {
    if (!unlocked_) return; // bloqueado/pausado: saldo congelado

    accountElapsed();

    if (state_.remainingSec == 0) {
        state_.paused = false;
        storage_->saveCounter(0, false);
        forceLockFailSafe("Saldo de tempo de uso esgotado");
        return;
    }

    if (millis() - lastPersistMs_ >= STATUS_COUNTER_PERSIST_MS) {
        lastPersistMs_ = millis();
        storage_->saveCounter(state_.remainingSec, false);
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

    // Se havia evento de emergência com hora desconhecida, agora o RTC está
    // certo: reconstrói o instante real (hora atual menos o tempo decorrido).
    if (emergencyTimeUnknown_ && storage_->loadEmergencyPendingEpoch() == EMERGENCY_TIME_UNKNOWN) {
        uint32_t elapsedS = (millis() - emergencyStartMs_) / 1000UL;
        storage_->saveEmergencyPendingEpoch(epoch > elapsedS ? epoch - elapsedS : epoch);
    }
    emergencyTimeUnknown_ = false;

    // Nova liberação (NFC + formulário): saldo cheio de `hours` horas de USO.
    state_.driverId       = driverId;
    state_.releaseEpoch   = epoch;
    state_.remainingSec   = (uint32_t)hours * 3600UL;
    state_.toleranceHours = hours;
    state_.paused         = false;
    storage_->saveState(state_);

    applyGpioState(true);
    startCounting();
    Serial.printf("[AUTH] Liberado para %s: saldo de uso=%uh\n", driverId.c_str(), hours);
    return true;
}

bool LockController::handleControlPayload(const String &payload) {
    // Formato: PAUSE:<driver_id> | RESUME:<driver_id>
    int sep = payload.indexOf(':');
    if (sep <= 0) {
        Serial.println("[CTRL] Payload malformado, ignorado.");
        return false;
    }
    String cmd = payload.substring(0, sep);
    String driverId = payload.substring(sep + 1);

    // Só o motorista da liberação em curso comanda (soft check -- o canal BLE
    // não é autenticado, igual ao AUTH). Liberação por emergência não tem
    // motorista: aceita qualquer um.
    if (state_.driverId != "EMERGENCY" && driverId != state_.driverId) {
        Serial.println("[CTRL] Motorista diferente do titular da liberacao, ignorado.");
        return false;
    }

    if (cmd == "PAUSE") {
        if (!unlocked_) return false;
        accountElapsed();
        state_.paused = true;
        storage_->saveCounter(state_.remainingSec, true);
        applyGpioState(false);
        Serial.printf("[CTRL] Partida DESATIVADA pelo motorista. Saldo preservado: %us\n", state_.remainingSec);
        return true;
    }
    if (cmd == "RESUME") {
        if (unlocked_ || !state_.paused || state_.remainingSec == 0) return false;
        state_.paused = false;
        storage_->saveCounter(state_.remainingSec, false);
        applyGpioState(true);
        startCounting();
        Serial.printf("[CTRL] Partida REATIVADA. Saldo: %us\n", state_.remainingSec);
        return true;
    }
    Serial.println("[CTRL] Comando desconhecido.");
    return false;
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
    // Formato leve para BLE: ESTADO|driver|saldo_seg|toleranciaH
    const char *st = unlocked_ ? "UNLOCKED" : (state_.paused && state_.remainingSec > 0 ? "PAUSED" : "LOCKED");
    char buf[128];
    snprintf(buf, sizeof(buf), "%s|%s|%u|%uh", st, state_.driverId.c_str(),
             remainingSeconds(), state_.toleranceHours);
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

    // Duracao configuravel pelo admin (característica CONFIG) -- é o saldo de
    // uso da emergência, contado por millis() como qualquer liberação.
    uint16_t emgHours = storage_->loadEmergencyToleranceHours();

    state_.driverId       = "EMERGENCY";
    state_.releaseEpoch   = now;
    state_.remainingSec   = (uint32_t)emgHours * 3600UL;
    state_.toleranceHours = emgHours;
    state_.paused         = false;
    storage_->saveState(state_);

    if (now == 0) {
        // RTC sem hora: grava o evento com instante desconhecido; o instante
        // real é reconstruído na próxima sincronização de hora via app.
        emergencyTimeUnknown_ = true;
        emergencyStartMs_ = millis();
        storage_->saveEmergencyPendingEpoch(EMERGENCY_TIME_UNKNOWN);
    } else {
        emergencyTimeUnknown_ = false;
        storage_->saveEmergencyPendingEpoch(now); // pendente ate o app confirmar (ACK)
    }

    applyGpioState(true);
    startCounting();
    Serial.printf("[EMERGENCY] Botao fisico segurado por >=%dms. Saldo de emergencia: %uh. "
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
