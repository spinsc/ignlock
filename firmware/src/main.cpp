#include <Arduino.h>
#include "config.h"
#include "storage.h"
#include "rtc_clock.h"
#include "lock_controller.h"
#include "ble_service.h"

// ============================================================================
// Sistema de Bloqueio e Liberação de Partida Veicular Inteligente
// Firmware principal — ESP32 (Arduino core)
//
// Fluxo:
//   1. setup() força bloqueio da bomba ANTES de qualquer outra inicialização
//      (fail-safe — ver LockController::begin).
//   2. Carrega hora absoluta do DS3231 e estado salvo em NVS; decide se
//      restaura uma liberação ainda dentro da janela de tolerância.
//   3. Sobe o servidor BLE GATT para aceitar novas autenticações do app.
//   4. loop() reavalia continuamente a expiração da tolerância.
// ============================================================================

static Storage storage;
static RtcClock rtcClock;
static LockController lockController;

void setup() {
    Serial.begin(115200);
    delay(200);
    Serial.println("\n[BOOT] Sistema de Bloqueio Veicular — iniciando...");
    Serial.printf("[BOOT] Firmware v%s\n", FIRMWARE_VERSION);

    storage.begin();

    if (!rtcClock.begin()) {
        Serial.println("[BOOT] AVISO CRITICO: DS3231 nao encontrado. "
                        "Sistema permanecera bloqueado ate reparo do RTC.");
    }

    // lockController.begin() já aplica o fail-safe de boot internamente.
    lockController.begin(&storage, &rtcClock);

    g_bleService.begin(&lockController, &storage);

    Serial.println("[BOOT] Inicializacao concluida.");
}

void loop() {
    static uint32_t lastTick = 0;
    uint32_t now = millis();

    // Reavalia expiração da tolerância a cada 5s (não precisa ser mais
    // frequente — a janela é medida em horas).
    if (now - lastTick >= 5000) {
        lastTick = now;
        bool wasUnlocked = lockController.isUnlocked();
        lockController.tick();
        if (wasUnlocked && !lockController.isUnlocked()) {
            g_bleService.notifyStatus(); // avisa o app que expirou
        }
    }

    g_bleService.loopHousekeeping();
    delay(10);
}
