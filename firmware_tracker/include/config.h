#pragma once
#include <Arduino.h>

// ============================================================================
// Módulo de Rastreamento IGNLOCK — config.h
// Ver docs/08-modulo-rastreamento.md para o esquemático e a justificativa
// de cada decisão de projeto (intervalo adaptativo, corte de baixa tensão).
// ============================================================================

// ---- Identidade do veículo ----
// Cada placa gravada recebe o VEHICLE_ID do veículo em que for instalada
// (mesmo identificador usado no cadastro do painel — tabela `vehicles`).
// Definir aqui antes de gravar cada unidade, ou mover para NVS/Preferences
// se preferir gravar o binário genérico e configurar por serial no campo.
#define VEHICLE_ID "TRUCK-042"

// ---- UART para o módulo SIM7600G-H ----
static const int PIN_MODEM_RX = 16; // ESP32 RX <- SIM7600 TX
static const int PIN_MODEM_TX = 17; // ESP32 TX -> SIM7600 RX
#define MODEM_BAUD 115200

// ---- Sensoriamento (ver A.4.5) ----
static const gpio_num_t PIN_IGNITION_SENSE = GPIO_NUM_25; // via opto, Linha 15
static const int PIN_BATTERY_ADC = 34;                    // divisor resistivo

// Divisor de tensão da bateria: Vadc = Vbat * (R8 / (R7 + R8))
// Com R7=100k, R8=22k: fator ~0.180. Ajustar conforme os resistores reais.
#define BATTERY_DIVIDER_RATIO 0.180f
#define ADC_REF_VOLTAGE 3.3f
#define ADC_MAX_COUNTS 4095.0f

// ---- Corte de baixa tensão (protege a bateria do veículo) ----
#define BATTERY_CUTOFF_VOLTAGE   11.8f // abaixo disso, para de transmitir e hiberna
#define BATTERY_RESUME_VOLTAGE   12.4f // só volta a operar acima disso

// ---- Intervalos de report (adaptativo, ver A.4.4) ----
#define REPORT_INTERVAL_IGNITION_ON_MS   (60UL * 1000UL)        // 60s com o veículo ligado
#define REPORT_INTERVAL_IGNITION_OFF_MS  (15UL * 60UL * 1000UL) // 15min com o veículo desligado
#define HIBERNATE_CHECK_INTERVAL_MS      (5UL * 60UL * 1000UL)  // reavalia tensão a cada 5min em corte

// ---- APN da operadora M2M (ajustar conforme a operadora do SIM) ----
#define CELLULAR_APN "m2m.vivo.com.br"

// ---- Backend Supabase (mesmo projeto do app/painel) ----
// Chave publicável (anon) — só tem permissão de INSERT em vehicle_positions,
// nunca leitura (ver migração add_vehicle_positions). Segura para embutir
// no firmware pelo mesmo motivo documentado em mobile_app/lib/config/supabase_config.dart.
#define SUPABASE_URL "https://proidvvzhzegvlohmguf.supabase.co"
#define SUPABASE_ANON_KEY "sb_publishable_M_HFYVOWgQSO9HWXCpZvPg_wPpi2ym5"
#define SUPABASE_REST_PATH "/rest/v1/vehicle_positions"
