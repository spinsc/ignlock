#include <Arduino.h>
#include "config.h"
#include "cellular_client.h"
#include "power_monitor.h"

// ============================================================================
// Módulo de Rastreamento IGNLOCK — firmware principal
//
// Controlador independente do firmware de bloqueio (ver ../firmware) —
// ligado direto na bateria, reporta posição via LTE em intervalo
// adaptativo (curto com o veículo ligado, longo desligado) e se protege
// contra drenar a bateria do veículo em corte de baixa tensão.
// Ver docs/08-modulo-rastreamento.md para a arquitetura completa.
// ============================================================================

static CellularClient cellular;
static PowerMonitor power;

static uint32_t lastReportMs = 0;
static bool cellularReady = false;

static void connectCellular() {
    cellularReady = cellular.begin() &&
                     cellular.waitForNetworkRegistration() &&
                     cellular.enableGnss();
    if (!cellularReady) {
        Serial.println("[BOOT] Falha ao inicializar o modulo celular/GNSS — tentando de novo no proximo ciclo.");
    }
}

static void reportPosition() {
    GnssFix fix = cellular.readGnssFix();
    if (!fix.valid) {
        Serial.println("[TRACK] Sem fix de GNSS ainda — pulando este ciclo.");
        return;
    }

    String timestamp = cellular.readNetworkTimeIso8601();
    if (timestamp.length() == 0) {
        Serial.println("[TRACK] Sem hora de rede — pulando este ciclo (evita gravar posicao sem timestamp confiavel).");
        return;
    }

    char body[256];
    snprintf(body, sizeof(body),
             "{\"vehicle_id\":\"%s\",\"latitude\":%.6f,\"longitude\":%.6f,"
             "\"speed_kmh\":%.1f,\"heading_deg\":%.1f,\"recorded_at\":\"%s\"}",
             VEHICLE_ID, fix.latitude, fix.longitude, fix.speedKmh, fix.headingDeg, timestamp.c_str());

    bool ok = cellular.httpPostJson(SUPABASE_REST_PATH, String(body));
    Serial.printf("[TRACK] Report %s: %s\n", VEHICLE_ID, ok ? "OK" : "FALHOU");
}

void setup() {
    Serial.begin(115200);
    delay(200);
    Serial.println("\n[BOOT] Modulo de Rastreamento IGNLOCK — iniciando...");

    power.begin();
    connectCellular();
}

void loop() {
    // Corte de baixa tensão tem prioridade sobre tudo — nunca transmite
    // nem consome corrente extra do modem enquanto a bateria estiver baixa.
    if (power.isInLowVoltageCutoff()) {
        delay(HIBERNATE_CHECK_INTERVAL_MS);
        return;
    }

    if (!cellularReady) {
        connectCellular();
        if (!cellularReady) {
            delay(30000);
            return;
        }
    }

    bool ignitionOn = power.isIgnitionOn();
    uint32_t interval = ignitionOn ? REPORT_INTERVAL_IGNITION_ON_MS : REPORT_INTERVAL_IGNITION_OFF_MS;

    if (millis() - lastReportMs >= interval) {
        reportPosition();
        lastReportMs = millis();
    }

    delay(1000);
}
