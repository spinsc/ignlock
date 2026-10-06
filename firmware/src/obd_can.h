#pragma once
#include <Arduino.h>

// Leitura do hodômetro pela porta OBD-II via CAN (controlador TWAI do ESP32),
// ver docs/14-obd-can.md. Usa o PID padrão 0x01/0xA6 (odômetro, resolução
// 0,1 km), que só alguns carros (em geral mais novos) respondem; os demais
// devolvem "sem dado" e o app cai para o KM digitado.
namespace ObdCan {
// Retorna true e preenche km10 (km x 10) se a ECU respondeu. O driver TWAI só
// fica instalado durante a leitura, para o ESP32 não participar do barramento
// (ACK/erros) o resto do tempo.
bool readOdometerKm10(uint32_t &km10);
}
