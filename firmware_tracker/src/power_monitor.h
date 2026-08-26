#pragma once
#include <Arduino.h>

// Leitura de tensão da bateria (via divisor resistivo) e sense de ignição
// (via opto na Linha 15) — ver docs/08-modulo-rastreamento.md, A.4.5.
class PowerMonitor {
public:
    void begin();

    float readBatteryVoltage();
    bool isIgnitionOn();

    // true quando a tensão caiu abaixo do corte e ainda não voltou a subir
    // acima do limiar de retomada — histerese evita oscilar liga/desliga
    // perto do limite (ver A.4.4).
    bool isInLowVoltageCutoff();

private:
    bool cutoffActive_ = false;
};
