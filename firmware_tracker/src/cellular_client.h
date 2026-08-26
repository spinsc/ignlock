#pragma once
#include <Arduino.h>

// Cliente AT para o módulo SIMCom SIM7600G-H — registro na rede LTE, GNSS
// integrado e HTTP(S) POST direto para o Supabase (usa os comandos AT+HTTP*
// embutidos do módulo, sem precisar de pilha TCP/IP própria no ESP32).
//
// NOTA: a sintaxe exata de alguns comandos AT pode variar por revisão de
// firmware do módulo — validar contra o "SIM7600 Series AT Command Manual"
// da revisão gravada na sua unidade antes do primeiro teste em campo.

struct GnssFix {
    bool valid = false;
    double latitude = 0;
    double longitude = 0;
    float speedKmh = 0;
    float headingDeg = 0;
};

class CellularClient {
public:
    bool begin();                              // inicializa UART e testa o módulo (AT)
    bool waitForNetworkRegistration(uint32_t timeoutMs = 60000);
    bool enableGnss();                         // liga o motor GNSS (AT+CGPS=1,1)
    GnssFix readGnssFix();                     // AT+CGPSINFO, parseado
    String  readNetworkTimeIso8601();          // AT+CCLK?, convertido para ISO8601 UTC

    // Faz POST do corpo JSON para SUPABASE_URL + path, com os headers do
    // Supabase (apikey/Authorization/Content-Type/Prefer). Retorna true em
    // 2xx. NUNCA usa Prefer: return=representation — a chave anônima só tem
    // INSERT, e pedir o registro de volta falharia por RLS mesmo com o
    // insert aceito (mesma lição aprendida no painel web, ver
    // web-dashboard/README.md, Seção "Arquitetura de dados e segurança").
    bool httpPostJson(const String &path, const String &jsonBody);

private:
    String sendAtCommand(const String &cmd, const String &expect = "OK", uint32_t timeoutMs = 5000);
    bool waitFor(const String &expect, uint32_t timeoutMs, String *outBuffer = nullptr);
};
