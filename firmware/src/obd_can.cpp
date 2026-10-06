#include "obd_can.h"
#include <driver/twai.h>
#include "config.h"

namespace ObdCan {

static bool installDriver() {
    twai_general_config_t g = TWAI_GENERAL_CONFIG_DEFAULT(PIN_CAN_TX, PIN_CAN_RX, TWAI_MODE_NORMAL);
    g.tx_queue_len = 4;
    g.rx_queue_len = 16;
#if OBD_CAN_BITRATE_KBPS == 250
    twai_timing_config_t t = TWAI_TIMING_CONFIG_250KBITS();
#else
    twai_timing_config_t t = TWAI_TIMING_CONFIG_500KBITS();
#endif
    twai_filter_config_t f = TWAI_FILTER_CONFIG_ACCEPT_ALL();
    if (twai_driver_install(&g, &t, &f) != ESP_OK) return false;
    if (twai_start() != ESP_OK) {
        twai_driver_uninstall();
        return false;
    }
    return true;
}

bool readOdometerKm10(uint32_t &km10) {
    if (!installDriver()) return false;

    // Requisição funcional (0x7DF): [len=2, modo 0x01, PID 0xA6]
    twai_message_t req = {};
    req.identifier = 0x7DF;
    req.data_length_code = 8;
    req.data[0] = 0x02; req.data[1] = 0x01; req.data[2] = 0xA6;
    bool ok = false;

    if (twai_transmit(&req, pdMS_TO_TICKS(100)) == ESP_OK) {
        uint32_t deadline = millis() + OBD_REPLY_TIMEOUT_MS;
        while (millis() < deadline) {
            twai_message_t rx;
            if (twai_receive(&rx, pdMS_TO_TICKS(50)) != ESP_OK) continue;
            // Respostas das ECUs: 0x7E8..0x7EF; quadro único: [len, 0x41, 0xA6, A, B, C, D]
            if (rx.identifier < 0x7E8 || rx.identifier > 0x7EF) continue;
            if (rx.data_length_code < 7) continue;
            if (rx.data[1] != 0x41 || rx.data[2] != 0xA6) continue;
            km10 = ((uint32_t)rx.data[3] << 24) | ((uint32_t)rx.data[4] << 16) |
                   ((uint32_t)rx.data[5] << 8) | rx.data[6];
            ok = true;
            break;
        }
    }

    twai_stop();
    twai_driver_uninstall();
    return ok;
}

}  // namespace ObdCan
