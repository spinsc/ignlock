# Seção A.2.2 — Lista de Componentes para Montagem da Placa (PCB)

Recorte da [BOM completa](02-bom.md) contendo **só o que vai soldado na
placa**, conforme o [esquemático elétrico](01-hardware-schematic.md) /
[desenho técnico](05-technical-drawing.html) — Folha 02. Cabos, conectores
de campo, gabinete e tags NFC (materiais de instalação, não de placa) ficam
na Seção A.2.3 ao final.

## A.2.2.1 Lista de Compra Consolidada (por valor)

Quantidades já somadas entre designadores que repetem o mesmo valor —
é o que você leva para o carrinho do fornecedor.

| Item | Valor / Especificação | Encapsulamento | Qtd | Designadores | Part Number Sugerido |
|---|---|---|---|---|---|
| Resistor 220Ω | 220Ω ±1-5%, 1/4-1/2W | THT | **2** | R1, R3 | Filme metálico genérico |
| Resistor 10kΩ | 10kΩ ±5%, 1/2W | THT | 1 | R2 | Filme metálico genérico |
| Resistor 330Ω | 330Ω ±5%, 1/4W | THT | 1 | R4 | Filme metálico genérico |
| Capacitor eletrolítico 100µF/25V | 105°C, radial | THT | 1 | C1 | Eletrolítico automotivo 105°C |
| Capacitor cerâmico 100nF | X7R, 16V | 0805/THT | 2 | C2 (x2) | Cerâmico multicamada |
| Diodo TVS 18V | 1.5KE18A, Ppk 1500W | DO-201AE | 1 | D1 | Littelfuse/Vishay 1.5KE18A |
| Diodo retificador 1N5408 | 1000V, 3A | DO-201AD | 1 | D2 | 1N5408 |
| Diodo Zener 15V | 1N5245B, 1W | DO-41 | 1 | D3 | 1N5245B |
| MOSFET Canal P | IRF4905, TO-220 | TO-220AB | 1 | Q1 | IRF4905PBF |
| Optoacoplador | PC817, DIP-4 | DIP-4 | 1 | U1 | PC817X1NSZ1B |
| Soquete DIP-4 (para U1) | — | THT | 1 | SOC1 | Soquete DIP-8 (usa 4 posições) |
| Módulo ESP32 DevKit | WROOM-32D, USB-UART CP2102 | Módulo | 1 | U2 | ESP32-WROOM-32D / NodeMCU-32S |
| Módulo RTC DS3231 | I2C + bateria CR2032 | Módulo | 1 | RTC1 | DS3231 breakout |
| Módulo Buck 12V→5V | Entrada 6-28V, saída 5V/3A | Módulo | 1 | PS1 | MP1584EN ou LM2596S |
| LED bicolor 5mm | vermelho/verde, catodo comum | THT 5mm | 1 | LED1 | Genérico |
| Dissipador TO-220 | ~15°C/W, com furo M3 | — | 1 | HS1 | 19x25x16mm aletado |
| Isolador de mica + bucha | Para TO-220 | — | 1 | (junto a HS1) | Kit isolação TO-220 |
| Porta-fusível inline + fusível 1A | ATM Mini, 32V | — | 1 | F1 | Fusível automotivo mini 1A |
| Porta-fusível inline + fusível 20A | ATC/ATM, 32V | — | 1 | F2 | Fusível automotivo mini 20A (15A se bomba ≤10A — medir antes) |
| Placa (protótipo/perfurada) | 70x90mm mín. | Fenolite ilhada ou fibra de vidro | 1 | PCB1 | — |

**Total de itens distintos: 19** · Todos com referência cruzada no
[esquemático](01-hardware-schematic.md) e na
[análise térmica/proteção](03-protecao-automotiva.md).

## A.2.2.2 Conferência por Designador (ordem do esquemático)

Use esta tabela ao montar a placa, conferindo item a item contra a Folha 02
do [desenho técnico](05-technical-drawing.html) — evita trocar R1 por R3
(mesmo valor, posições diferentes no circuito).

| Designador | Componente | Valor | Nó no esquemático |
|---|---|---|---|
| R1 | Resistor | 220Ω | GPIO25 → LED do PC817 |
| R2 | Resistor | 10kΩ | Pull-up de Gate (+12V_PERM → GATE_DRIVE) |
| R3 | Resistor | 220Ω | GATE_DRIVE → Gate do Q1 |
| R4 | Resistor | 330Ω | GPIO26/27 → LED de status |
| C1 | Capacitor eletrolítico | 100µF/25V | Entrada do PS1 (filtro) |
| C2 | Capacitor cerâmico | 100nF (x2) | Desacoplamento VCC do ESP32 |
| D1 | Diodo TVS | 1.5KE18A | Drain do Q1 → GND (clamp) |
| D2 | Diodo flyback | 1N5408 | Antiparalelo com a bomba (fora do gabinete, ver D.3) |
| D3 | Diodo Zener | 15V | Gate-Source do Q1 |
| Q1 | MOSFET P-CH | IRF4905 | High-side switch da bomba |
| U1 | Optoacoplador | PC817 | Barreira de isolamento (lógica ↔ potência) |
| U2 | ESP32 | WROOM-32D | Controlador central |
| RTC1 | RTC | DS3231 | I2C (SDA=GPIO21, SCL=GPIO22) |
| PS1 | Buck 12V→5V | MP1584EN/LM2596S | Alimentação lógica |
| LED1/LED2 | LED status | vermelho/verde | Indicação local |
| F1 | Fusível | 1A | Linha de controle (12V lógico) |
| F2 | Fusível | 20A (ajustar) | Linha de potência (+12V_PERM) |
| HS1 | Dissipador | — | Sobre Q1 |
| SOC1 | Soquete DIP-4 | — | Sob U1 |

## A.2.3 Materiais de Instalação (fora da placa)

Não vão soldados — ficam no chicote/gabinete. Já detalhados na
[BOM completa](02-bom.md): conector automotivo CN1 (à bomba), gabinete
ENC1 (IP65), tags NFC (1 por veículo), e os cabos por bitola conforme a
[tabela A.2.1](02-bom.md#a21-tabela-de-bitolas-de-fiação-automotiva-awg--mm²).

> **Antes de fechar o pedido:** confira o item F2 — a corrente real da
> bomba deve ser medida com alicate amperímetro no veículo específico
> antes de definir o fusível e a bitola do cabo de potência (bombas variam
> de 4A a 15A conforme modelo). Ver [docs/02-bom.md](02-bom.md), nota da
> Seção A.2.1.
