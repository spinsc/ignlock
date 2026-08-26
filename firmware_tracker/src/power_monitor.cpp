#include "power_monitor.h"
#include "config.h"

void PowerMonitor::begin() {
    pinMode(PIN_IGNITION_SENSE, INPUT);
    analogReadResolution(12);
}

float PowerMonitor::readBatteryVoltage() {
    int raw = analogRead(PIN_BATTERY_ADC);
    float vAdc = (raw / ADC_MAX_COUNTS) * ADC_REF_VOLTAGE;
    return vAdc / BATTERY_DIVIDER_RATIO;
}

bool PowerMonitor::isIgnitionOn() {
    return digitalRead(PIN_IGNITION_SENSE) == HIGH;
}

bool PowerMonitor::isInLowVoltageCutoff() {
    float v = readBatteryVoltage();

    if (!cutoffActive_ && v < BATTERY_CUTOFF_VOLTAGE) {
        cutoffActive_ = true;
        Serial.printf("[POWER] Tensao da bateria caiu para %.2fV — entrando em corte de baixa tensao.\n", v);
    } else if (cutoffActive_ && v > BATTERY_RESUME_VOLTAGE) {
        cutoffActive_ = false;
        Serial.printf("[POWER] Tensao da bateria recuperada para %.2fV — retomando operacao.\n", v);
    }

    return cutoffActive_;
}
