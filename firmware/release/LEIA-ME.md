# Firmware IGNLOCK v1.0.1 — pronto para gravar no ESP32

Compilado de `firmware/` com PlatformIO (esp32dev, Arduino core). Inclui botão de
emergência (GPIO32) e tolerância de emergência configurável (docs/12).

## Arquivo para gravar (recomendado)

`IGNLOCK-firmware-merged.bin` — imagem única (bootloader + partições + app), gravar no
endereço **0x0**. Serve para ESP32 DevKit (WROOM-32) novo ou já usado.

### Opção A — navegador (mais simples, Chrome/Edge)
1. Abra https://espressif.github.io/esptool-js/ (ou https://web.esphome.io).
2. Conecte o ESP32 por USB, clique em Connect e escolha a porta COM.
3. Endereço `0x0`, selecione o arquivo `IGNLOCK-firmware-merged.bin`, Program.
4. Se não conectar: segure o botão BOOT do DevKit ao clicar em Connect.

### Opção B — esptool (linha de comando)
```
python -m esptool --chip esp32 --port COMx --baud 460800 write_flash 0x0 IGNLOCK-firmware-merged.bin
```

## `IGNLOCK-firmware-app.bin`
Só a aplicação (endereço 0x10000) — para regravar sem apagar bootloader/partições.
Só use em placa que já recebeu a imagem merged antes.

## Depois de gravar
- Monitor serial a 115200: deve aparecer `[BOOT] Firmware v1.0.1` e `[BLE] Servico iniciado. Nome: IGNLOCK-XXXX`.
- O MAC BLE aparece no log serial — cadastre no painel (Veículos → Editar) e grave a tag NFC.
- PIN administrativo de fábrica: `000000` (trocar na primeira configuração).
- Sem DS3231 ligado o sistema permanece bloqueado (fail-safe) — comportamento esperado.
- Código ainda não validado em bancada: teste primeiro sem ligar na bomba (docs/04, D.1.4).
