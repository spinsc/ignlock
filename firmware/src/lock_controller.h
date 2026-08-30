#pragma once
#include <Arduino.h>
#include "storage.h"
#include "rtc_clock.h"

// Núcleo da lógica de negócio: decide se a bomba deve ficar liberada ou
// bloqueada, aplica a regra de tolerância temporal e comanda o GPIO do
// optoacoplador. Todo acesso ao pino de potência passa por aqui — nenhuma
// outra classe escreve em PIN_PUMP_CTRL diretamente.
class LockController {
public:
    void begin(Storage *storage, RtcClock *rtc);

    // Chamado no loop() principal — reavalia expiração continuamente.
    void tick();

    // Processa um payload de autenticação vindo da característica AUTH.
    // Formato esperado: "DRIVER_ID:VALID_HOURS:EPOCH_TIMESTAMP"
    // Retorna true se autenticado e a bomba foi liberada.
    bool handleAuthPayload(const String &payload);

    // Aplica nova tolerância padrão (característica CONFIG, autenticada por PIN).
    bool handleConfigPayload(const String &payload, Storage *storage);

    bool isUnlocked() const { return unlocked_; }
    String statusPayload() const; // string p/ característica STATUS

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

    Storage   *storage_ = nullptr;
    RtcClock  *rtc_     = nullptr;
    bool       unlocked_ = false;
    LockState  state_;

    uint32_t   emergencyPressStartMs_ = 0; // 0 = botão solto
    bool       emergencyHandled_ = false;   // evita redisparo na mesma pressão
};
