#include "rtc_clock.h"
#include <Wire.h>
#include <RTClib.h>
#include "config.h"

static RTC_DS3231 ds3231;

bool RtcClock::begin() {
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    healthy_ = ds3231.begin();
    if (!healthy_) {
        Serial.println("[RTC] FALHA: DS3231 nao respondeu no barramento I2C.");
        return false;
    }
    if (ds3231.lostPower()) {
        // Bateria CR2032 do modulo descarregada ou primeira energizacao.
        // Nao arriscar um "now" incorreto: mantem epoch em 0 ate o app
        // sincronizar via BLE. O lock_controller trata epoch==0 como
        // "sem hora confiavel" -> permanece bloqueado (fail-safe).
        Serial.println("[RTC] AVISO: DS3231 perdeu energia (bateria fraca?). Aguardando sync via BLE.");
    }
    return true;
}

uint32_t RtcClock::nowEpoch() {
    if (!healthy_) return 0;
    return ds3231.now().unixtime();
}

void RtcClock::setEpoch(uint32_t epoch) {
    if (!healthy_) return;
    ds3231.adjust(DateTime(epoch));
}
