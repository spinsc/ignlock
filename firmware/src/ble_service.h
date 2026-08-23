#pragma once
#include <Arduino.h>
#include "lock_controller.h"
#include "storage.h"

// Servidor GATT BLE (NimBLE) — expõe as características AUTH, STATUS e CONFIG
// descritas em config.h. Mantém o app sempre atualizado via notify em STATUS.
class BleService {
public:
    void begin(LockController *lockController, Storage *storage);
    void notifyStatus(); // chamar após qualquer mudança de estado
    void loopHousekeeping(); // reinicia advertising após desconexão

private:
    LockController *lockController_ = nullptr;
    Storage *storage_ = nullptr;
};

extern BleService g_bleService; // usado pelos callbacks internos (ble_service.cpp)
