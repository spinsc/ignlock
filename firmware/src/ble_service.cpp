#include "ble_service.h"
#include <NimBLEDevice.h>
#include "config.h"

BleService g_bleService;

static NimBLEServer *s_server = nullptr;
static NimBLECharacteristic *s_statusChar = nullptr;
static bool s_deviceConnected = false;

// ---------------------------------------------------------------------------
// Callbacks de conexão
// ---------------------------------------------------------------------------
class ServerCallbacks : public NimBLEServerCallbacks {
    void onConnect(NimBLEServer *server, ble_gap_conn_desc *desc) override {
        s_deviceConnected = true;
        Serial.println("[BLE] Cliente conectado.");
    }
    void onDisconnect(NimBLEServer *server) override {
        s_deviceConnected = false;
        Serial.println("[BLE] Cliente desconectado. Reiniciando advertising.");
        NimBLEDevice::startAdvertising();
    }
};

// ---------------------------------------------------------------------------
// Característica AUTH (write) — recebe DRIVER_ID:VALID_HOURS:EPOCH_TIMESTAMP
// ---------------------------------------------------------------------------
class AuthCallbacks : public NimBLECharacteristicCallbacks {
public:
    explicit AuthCallbacks(LockController *lc) : lockController_(lc) {}

    void onWrite(NimBLECharacteristic *chr) override {
        std::string value = chr->getValue();
        String payload = String(value.c_str());
        Serial.printf("[BLE][AUTH] Payload recebido: %s\n", payload.c_str());

        bool ok = lockController_->handleAuthPayload(payload);
        if (ok) {
            g_bleService.notifyStatus();
        }
    }

private:
    LockController *lockController_;
};

// ---------------------------------------------------------------------------
// Característica CONFIG (write, admin) — CONFIG:HOURS:ADMIN_PIN
// ---------------------------------------------------------------------------
class ConfigCallbacks : public NimBLECharacteristicCallbacks {
public:
    ConfigCallbacks(LockController *lc, Storage *st) : lockController_(lc), storage_(st) {}

    void onWrite(NimBLECharacteristic *chr) override {
        std::string value = chr->getValue();
        String payload = String(value.c_str());
        bool ok = lockController_->handleConfigPayload(payload, storage_);
        Serial.printf("[BLE][CONFIG] %s\n", ok ? "Aceito" : "Rejeitado");
    }

private:
    LockController *lockController_;
    Storage *storage_;
};

// ---------------------------------------------------------------------------
void BleService::begin(LockController *lockController, Storage *storage) {
    lockController_ = lockController;
    storage_ = storage;

    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_BT);
    char devName[32];
    snprintf(devName, sizeof(devName), "%s%02X%02X", BLE_DEVICE_NAME_PREFIX, mac[4], mac[5]);

    NimBLEDevice::init(devName);
    // Potência de transmissão moderada — suficiente para uso "aproxime o celular"
    // dentro do veículo, sem alcance excessivo fora dele.
    NimBLEDevice::setPower(ESP_PWR_LVL_N0);

    s_server = NimBLEDevice::createServer();
    s_server->setCallbacks(new ServerCallbacks());

    NimBLEService *svc = s_server->createService(SVC_UUID_IGNITION_LOCK);

    NimBLECharacteristic *authChar = svc->createCharacteristic(
        CHR_UUID_AUTH,
        NIMBLE_PROPERTY::WRITE);
    authChar->setCallbacks(new AuthCallbacks(lockController_));

    s_statusChar = svc->createCharacteristic(
        CHR_UUID_STATUS,
        NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
    s_statusChar->setValue(lockController_->statusPayload().c_str());

    NimBLECharacteristic *configChar = svc->createCharacteristic(
        CHR_UUID_CONFIG,
        NIMBLE_PROPERTY::WRITE);
    configChar->setCallbacks(new ConfigCallbacks(lockController_, storage_));

    svc->start();

    NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();
    adv->addServiceUUID(SVC_UUID_IGNITION_LOCK);
    adv->setScanResponse(true);
    NimBLEDevice::startAdvertising();

    Serial.printf("[BLE] Servico iniciado. Nome: %s\n", devName);
}

void BleService::notifyStatus() {
    if (!s_statusChar) return;
    String payload = lockController_->statusPayload();
    s_statusChar->setValue(payload.c_str());
    if (s_deviceConnected) {
        s_statusChar->notify();
    }
}

void BleService::loopHousekeeping() {
    // Reservado para futura lógica de watchdog de conexão (ex.: forçar
    // re-advertising se ficar sem clientes por período anormalmente longo).
}
