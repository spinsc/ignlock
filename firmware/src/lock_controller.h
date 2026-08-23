#pragma once
#include <Arduino.h>
#include "storage.h"
#include "rtc_clock.h"

// Núcleo da lógica de negócio: decide se a bomba deve ficar liberada ou
// bloqueada, aplica a regra de tolerância temporal e comanda o GPIO do
// optoacoplador. Todo acesso ao pino de potência passa por aqui — nenhuma
// outra classe escreve em PIN_PUMP_CTRL diretamente.
class LockController {
public:
    void begin(Storage *storage, RtcClock *rtc);

    // Chamado no loop() principal — reavalia expiração continuamente.
    void tick();

    // Processa um payload de autenticação vindo da característica AUTH.
    // Formato esperado: "DRIVER_ID:VALID_HOURS:EPOCH_TIMESTAMP"
    // Retorna true se autenticado e a bomba foi liberada.
    bool handleAuthPayload(const String &payload);

    // Aplica nova tolerância padrão (característica CONFIG, autenticada por PIN).
    bool handleConfigPayload(const String &payload, Storage *storage);

    bool isUnlocked() const { return unlocked_; }
    String statusPayload() const; // string p/ característica STATUS

private:
    void applyGpioState(bool unlock);
    void forceLockFailSafe(const char *reason);

    Storage   *storage_ = nullptr;
    RtcClock  *rtc_     = nullptr;
    bool       unlocked_ = false;
    LockState  state_;
};
