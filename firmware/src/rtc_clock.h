#pragma once
#include <Arduino.h>

// Wrapper fino sobre o DS3231 (via RTClib) — fonte de hora absoluta que
// sobrevive à perda de energia do ESP32 (ver docs/01-hardware-schematic.md,
// Seção A.1.3.1). Essencial para a regra de tolerância funcionar offline.
class RtcClock {
public:
    bool begin();                    // retorna false se DS3231 não responder no I2C
    uint32_t nowEpoch();             // hora absoluta atual (segundos desde 1970)
    void setEpoch(uint32_t epoch);   // sincroniza o DS3231 (chamado a cada auth BLE)
    bool isHealthy() const { return healthy_; }

private:
    bool healthy_ = false;
};
