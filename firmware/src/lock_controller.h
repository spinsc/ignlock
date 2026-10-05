#pragma once
#include <Arduino.h>
#include "storage.h"
#include "rtc_clock.h"

// Núcleo da lógica de negócio: decide se a bomba deve ficar liberada ou
// bloqueada, controla o SALDO DE TEMPO DE USO e comanda o GPIO do
// optoacoplador. Todo acesso ao pino de potência passa por aqui — nenhuma
// outra classe escreve em PIN_PUMP_CTRL diretamente.
//
// Modelo de tempo (v1.1): a liberação concede um saldo de N horas de USO.
// O saldo só desconta enquanto a partida está liberada (UNLOCKED); o motorista
// pode desativar a partida pelo app (PAUSED) e religar depois — o tempo
// desligado, ou com a chave virada (ESP32 sem energia), não é descontado.
// Zerou o saldo → bloqueio (LOCKED) e nova liberação NFC/BLE.
class LockController {
public:
    void begin(Storage *storage, RtcClock *rtc);

    // Chamado periodicamente no loop() principal: desconta o saldo, grava
    // o contador a cada STATUS_COUNTER_PERSIST_MS e bloqueia ao zerar.
    void tick();

    // Processa um payload de autenticação vindo da característica AUTH.
    // Formato esperado: "DRIVER_ID:VALID_HOURS:EPOCH_TIMESTAMP"
    // Retorna true se autenticado e a bomba foi liberada.
    bool handleAuthPayload(const String &payload);

    // Comandos do motorista (característica CONTROL): "PAUSE:<driver>" desativa
    // a partida preservando o saldo; "RESUME:<driver>" religa se ainda há saldo.
    bool handleControlPayload(const String &payload);

    // Aplica nova tolerância padrão (característica CONFIG, autenticada por PIN).
    bool handleConfigPayload(const String &payload, Storage *storage);

    bool isUnlocked() const { return unlocked_; }
    uint32_t remainingSeconds() const; // saldo atual (já descontando o trecho em andamento)
    String statusPayload() const; // "LOCKED|PAUSED|UNLOCKED|driver|saldo_seg|Nh" p/ característica STATUS

    // Botão físico de emergência (opcional, ver docs/12). Chamar a CADA
    // iteração do loop() principal (não só no tick de 5s) — a detecção de
    // pressão longa depende de leitura frequente do GPIO. Retorna true só
    // na chamada em que um novo evento acabou de ser disparado (o chamador
    // usa isso para notificar o BLE, sem precisar reler o estado toda hora).
    bool pollEmergencyButton();
    uint32_t pendingEmergencyEpoch() const; // 0 = nenhum evento pendente
    void ackEmergencySynced(); // chamado pelo BLE ao receber "ACK" do app

private:
    void applyGpioState(bool unlock);
    void forceLockFailSafe(const char *reason);
    bool triggerEmergencyRelease();
    void accountElapsed();          // desconta do saldo o tempo corrido desde a última contagem
    void startCounting();           // marca o início de um trecho com a partida liberada

    Storage   *storage_ = nullptr;
    RtcClock  *rtc_     = nullptr;
    bool       unlocked_ = false;
    LockState  state_;

    uint32_t   countStartMs_ = 0;   // millis() do último desconto aplicado
    uint32_t   lastPersistMs_ = 0;  // millis() da última gravação do contador em NVS

    uint32_t   emergencyPressStartMs_ = 0; // 0 = botão solto
    bool       emergencyHandled_ = false;   // evita redisparo na mesma pressão

    // Emergência acionada com o RTC sem hora válida: o instante real do evento
    // é reconstruído na próxima sincronização de hora (ver handleAuthPayload).
    bool       emergencyTimeUnknown_ = false;
    uint32_t   emergencyStartMs_ = 0;
};
