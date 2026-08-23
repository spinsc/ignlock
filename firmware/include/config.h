#pragma once
#include <Arduino.h>

// ============================================================================
// Sistema de Bloqueio e Liberação de Partida Veicular Inteligente
// config.h — Mapeamento de pinos, UUIDs BLE e constantes globais
// ============================================================================

// ---- Pinagem (ver docs/01-hardware-schematic.md, Seção A.1) ----
static const gpio_num_t PIN_PUMP_CTRL   = GPIO_NUM_25; // -> R1 -> PC817 (libera/bloqueia bomba)
static const gpio_num_t PIN_STATUS_LED_R = GPIO_NUM_26; // LED status vermelho (bloqueado)
static const gpio_num_t PIN_STATUS_LED_G = GPIO_NUM_27; // LED status verde (liberado)
static const int PIN_I2C_SDA = 21; // DS3231
static const int PIN_I2C_SCL = 22; // DS3231

// ---- Identidade do dispositivo ----
// Cada veículo tem um VEHICLE_ID único gravado na tag NFC do painel
// (ver docs/04-manual.md, Seção D.2). O app usa este ID para exibir/confirmar
// o veículo antes de conectar via BLE (o MAC BLE também é gravado na tag).
#define FIRMWARE_VERSION "1.0.0"

// ---- BLE GATT — UUIDs customizados (128-bit) ----
// Gerados uma única vez para este projeto — não reutilizar em outros produtos.
#define SVC_UUID_IGNITION_LOCK   "8f6a0001-b5a3-4393-e0a9-e50e24dc0001"
#define CHR_UUID_AUTH            "8f6a0001-b5a3-4393-e0a9-e50e24dc0002" // Write: DRIVER_ID:VALID_HOURS:EPOCH
#define CHR_UUID_STATUS          "8f6a0001-b5a3-4393-e0a9-e50e24dc0003" // Read/Notify: status atual
#define CHR_UUID_CONFIG          "8f6a0001-b5a3-4393-e0a9-e50e24dc0004" // Write (admin): CONFIG:HOURS:PIN

// ---- Regras de negócio ----
#define DEFAULT_TOLERANCE_HOURS   12      // Janela padrão de tolerância (administrável)
#define MAX_TOLERANCE_HOURS       48      // Limite superior aceito para VALID_HOURS
#define MIN_TOLERANCE_HOURS       1
#define DEFAULT_ADMIN_PIN         "000000" // DEVE ser alterado na primeira configuração (ver manual)

// ---- Persistência NVS (Preferences) ----
#define NVS_NAMESPACE             "ignlock"
#define NVS_KEY_DRIVER_ID         "driver_id"
#define NVS_KEY_EXPIRE_EPOCH      "expire_ts"
#define NVS_KEY_RELEASE_EPOCH     "release_ts"
#define NVS_KEY_TOLERANCE_HOURS   "tol_hours"
#define NVS_KEY_ADMIN_PIN         "admin_pin"

// ---- BLE advertising ----
#define BLE_DEVICE_NAME_PREFIX    "IGNLOCK-" // + últimos 4 bytes do MAC, ver ble_service.cpp
