# Sistema de Bloqueio e Liberação de Partida Veicular Inteligente

Sistema embarcado (ESP32) + aplicativo mobile (Flutter) para liberação
temporizada e 100% offline da bomba de combustível de veículos de frota,
via autenticação NFC + Bluetooth Low Energy (BLE).

## Estrutura do repositório

```
vehicle-ignition-lock-system/
├── docs/
│   ├── 01-hardware-schematic.md     # Seção A.1 — esquemático, netlist, pinagem
│   ├── 02-bom.md                    # Seção A.2 — Bill of Materials
│   ├── 03-protecao-automotiva.md    # Seção A.3 — térmico, ISO 7637-2, isolamento
│   └── 04-manual.md                 # Seção D — montagem, NFC, instalação, uso, troubleshooting
├── firmware/                        # Seção B — ESP32 (Arduino core / PlatformIO)
│   ├── platformio.ini
│   ├── include/config.h             # pinagem, UUIDs BLE, constantes de negócio
│   └── src/
│       ├── main.cpp
│       ├── storage.{h,cpp}          # NVS/Preferences
│       ├── rtc_clock.{h,cpp}        # driver DS3231 (hora absoluta offline)
│       ├── lock_controller.{h,cpp}  # regra de tolerância + fail-safe
│       └── ble_service.{h,cpp}      # servidor GATT (NimBLE)
└── mobile_app/                      # Seção C — Flutter
    ├── pubspec.yaml
    └── lib/
        ├── main.dart
        ├── models/{trip_log,vehicle_tag}.dart
        ├── services/{nfc_service,ble_service,local_db_service,sync_service}.dart
        └── screens/auth_flow_screen.dart
```

## Como compilar o firmware

```bash
cd firmware
pio run              # compila
pio run -t upload    # grava no ESP32
pio device monitor    # log serial (115200 baud)
```

## Como rodar o app

```bash
cd mobile_app
flutter pub get
flutter run
```

### Permissões obrigatórias (adicionar antes de compilar para produção)

**Android** (`android/app/src/main/AndroidManifest.xml`):
```xml
<uses-permission android:name="android.permission.NFC" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-feature android:name="android.hardware.nfc" android:required="true" />
```
> `ACCESS_FINE_LOCATION` é exigida pelo Android para scan BLE em versões anteriores ao Android 12 (API 31); em API 31+, usar `neverForLocation` na flag do `BLUETOOTH_SCAN` dispensa a permissão de localização, desde que o app não infira posição via BLE (não é o caso aqui).

**iOS** (`ios/Runner/Info.plist`):
```xml
<key>NFCReaderUsageDescription</key>
<string>Necessário para ler a tag do veículo e liberar a partida.</string>
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Necessário para conectar ao módulo do veículo e liberar a partida.</string>
```
No `Info.plist` também é preciso declarar o formato NDEF em `com.apple.developer.nfc.readersession.formats` (entitlement `Near Field Communication Tag Reading`), habilitado no Apple Developer Portal.

## Ordem de leitura recomendada

1. [docs/01-hardware-schematic.md](docs/01-hardware-schematic.md) — entender a arquitetura elétrica e o motivo do RTC externo (Seção A.1.3.1).
2. [docs/02-bom.md](docs/02-bom.md) — lista de compras.
3. [docs/03-protecao-automotiva.md](docs/03-protecao-automotiva.md) — validar dissipador e proteções antes de instalar em veículo real.
4. `firmware/` — revisar `include/config.h` (pinos e UUIDs devem bater com o hardware montado).
5. `mobile_app/` — revisar `lib/services/ble_service.dart` (mesmos UUIDs do firmware).
6. [docs/04-manual.md](docs/04-manual.md) — montagem física, gravação de tags, instalação no veículo, manual do motorista e troubleshooting.

## Considerações de segurança para produção

- O PIN administrativo padrão (`000000`, ver `config.h`) **deve ser alterado** na característica CONFIG antes do sistema entrar em operação — está em texto plano no protocolo atual; para uma frota real, evoluir para autenticação por token assinado (ex. HMAC com chave por veículo) em vez de PIN fixo.
- Habilitar **bonding/pairing BLE** (não implementado no exemplo mínimo) para impedir que qualquer app genérico de BLE escreva na característica AUTH — hoje qualquer dispositivo dentro do alcance pode tentar autenticar se souber o formato do payload.
- O `DRIVER_ID` enviado pelo app não é validado contra uma lista de condutores autorizados no firmware (o ESP32 aceita qualquer string) — a validação de "este condutor pode dirigir este veículo" deve ocorrer no app/backend antes de permitir o preenchimento do formulário.
