# Seção A.7 — Hodômetro pela porta OBD-II (CAN no ESP32)

O ESP32 lê o KM do veículo direto da porta OBD-II, **antes da liberação** (KM inicial) e **ao desvincular** (KM final). O app pede o valor pela característica BLE `ODO`; se a leitura não for possível, cai para o KM digitado — o log marca a fonte (`OBD-II` ou `manual`).

## Hardware (opcional, sem refazer a placa)

Transceptor CAN de **3,3 V** (ex.: módulo SN65HVD230) ligado ao controlador CAN (TWAI) do ESP32:

| Transceptor | ESP32 DevKit | OBD-II (veículo) |
|---|---|---|
| CTX / TXD | **GPIO17** | — |
| CRX / RXD | **GPIO16** | — |
| 3V3 | 3V3 | — |
| GND | GND | pinos **4/5** (GND) |
| CANH | — | pino **6** (CAN-H) |
| CANL | — | pino **14** (CAN-L) |

- Fios diretos do header do DevKit (GPIO16/17 não têm cobre na placa roteada nem outro uso no firmware) — mesma abordagem do botão de emergência.
- **Não use o pino 16 da OBD (+12 V permanente) para alimentar o ESP32**: ele segue na Linha 15 (pós-chave). Com a chave desligada o ESP32 fica sem energia e **não lê o KM** — por isso desvincule com a chave ligada.
- Desabilite o resistor de terminação de 120 Ω do módulo (o barramento do carro já tem).
- Barramento padrão: ISO 15765-4, 11 bits, 500 kbit/s (`OBD_CAN_BITRATE_KBPS` em `config.h`; 250 kbit/s também suportado).

## O que é lido e a limitação importante

O firmware envia a requisição OBD-II padrão **modo 01, PID A6 (odômetro, 0,1 km)** em `0x7DF` e aceita a resposta de `0x7E8..0x7EF`. **Nem todo carro responde esse PID** — ele é relativamente novo na norma. Em muitos modelos o hodômetro só existe por comando específico do fabricante (UDS/DID próprio), diferente em cada marca. Nesses casos a leitura devolve `NA` e o app usa o KM digitado.

**Antes de instalar em toda a frota**, teste um veículo de cada modelo (Onix, Doblò, Captur…) e confira no log serial (`[OBD] ODO:...`). Se algum modelo não responder o PID A6, o próximo passo é levantar o comando proprietário dele e adicioná-lo em `firmware/src/obd_can.cpp` (um perfil por marca).

O driver CAN só fica instalado durante a leitura (~0,4 s), para o ESP32 não ocupar o barramento do carro o resto do tempo; a leitura sai em cache por 3 s.

## No app e no painel

- Liberação: o KM já vem preenchido e travado ("Lido da porta OBD-II"); sem OBD, o motorista digita.
- Desvincular: lê o KM final; sem OBD, pede para digitar (obrigatório se o parâmetro "Exigir KM final" da empresa estiver ligado).
- Painel → Logs de Viagem: colunas *KM inicial* e *KM final*, cada uma com a fonte.
