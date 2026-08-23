#pragma once
#include <Arduino.h>

// Persistência não-volátil (NVS/Preferences) do estado de liberação.
// Sobrevive a reboots do ESP32 (desligar/ligar o veículo). A hora absoluta
// usada para calcular expiração vem do DS3231 (ver rtc_clock.h), não do NVS.
struct LockState {
    String   driverId;
    uint32_t releaseEpoch;   // epoch (s) da última liberação bem-sucedida
    uint32_t expireEpoch;    // epoch (s) em que a tolerância expira
    uint16_t toleranceHours; // janela configurada pelo admin
};

class Storage {
public:
    void begin();

    LockState loadState();
    void saveState(const LockState &state);
    void clearState(); // força bloqueio (usado em logout/reset administrativo)

    uint16_t loadDefaultToleranceHours();
    void saveDefaultToleranceHours(uint16_t hours);

    String loadAdminPin();
    void saveAdminPin(const String &pin);
};
