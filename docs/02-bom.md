# Seção A.2 — Bill of Materials (BOM)

| Ref. | Componente | Part Number Sugerido | Encapsulamento | Especificação | Qtd | Observação |
|---|---|---|---|---|---|---|
| U2 | Módulo ESP32 DevKit | ESP32-WROOM-32D (NodeMCU-32S) | Módulo SMD em placa DevKit | 240MHz, BLE 4.2/5.0, 4MB Flash | 1 | Preferir versão com regulador 3.3V onboard e USB-UART CP2102 |
| Q1 | MOSFET Canal P | IRF4905PBF (Infineon/Vishay) | TO-220AB | Vds -55V, Id -74A (contínuo, derateado), Rds(on) ≈ 0.02Ω @ Vgs=-10V | 1 | Usar sempre com dissipador — ver A.3 |
| U1 | Optoacoplador | PC817X1NSZ1B (Sharp/Everlight) | DIP-4 | Isolação 5000Vrms, CTR 80-160% | 1 | Soquete DIP-4 recomendado para manutenção |
| D1 | Diodo TVS (supressor de transiente) | 1.5KE18A (Littelfuse/Vishay) | DO-201AE (axial) | Vbr 18V, Ppk 1500W (10/1000µs) | 1 | Grampeamento de load dump ISO 7637-2 |
| D2 | Diodo retificador (flyback) | 1N5408 | DO-201AD (axial) | 1000V, 3A | 1 | Antiparalelo com a carga indutiva (bomba/relé) |
| D3 | Diodo Zener (proteção Gate) | 1N5245B (15V, 1W) | DO-41 | Vz 15V ±5%, 1W | 1 | Ligado Gate-Source |
| R1 | Resistor | Filme metálico | 1/4W THT | 220Ω ±1% | 1 | Corrente do LED do opto (~9.5mA @ 3.3V) |
| R2 | Resistor | Filme metálico | 1/2W THT | 10kΩ ±5% | 1 | Pull-up de Gate (fail-safe) |
| R3 | Resistor | Filme metálico | 1/2W THT | 220Ω ±5% | 1 | Limitador de gate |
| R4 | Resistor | Filme metálico | 1/4W THT | 330Ω ±5% | 1 | LED de status |
| LED1 | LED bicolor (vermelho/verde) | LED bicolor 5mm catodo comum | THT 5mm | 2.0-2.2V, 20mA | 1 | Painel/indicação local |
| F1 | Fusível + porta-fusível | Fusível automotivo mini 1A + soquete inline | ATM Mini | 1A, 32V | 1 | Linha de controle (12V lógico) |
| F2 | Fusível + porta-fusível | Fusível automotivo mini 20A + soquete inline | ATC/ATM | 20A, 32V | 1 | Dimensionar conforme corrente real da bomba (ver A.3.1) — 15A se bomba ≤10A |
| PS1 | Módulo Buck Step-Down | MP1584EN ou LM2596S (módulo pronto) | Módulo SMD/THT | Entrada 6-28V, saída 5V/3A ajustável | 1 | Preferir módulo com proteção de entrada reversa; alternativa: fonte automotiva isolada 12V→5V 1A |
| PCB1 | Placa de circuito impresso (protótipo) ou perfurada | Baquelite/fenolite ilhada ou fibra de vidro | 70x90mm mín. | — | 1 | Ver A.3.3 para trilhas de potência |
| SOC1 | Soquete DIP-4 para U1 | Soquete DIP-8 (usar 4 posições) | THT | — | 1 | Facilita substituição do opto |
| HS1 | Dissipador de calor para TO-220 | Dissipador aletado padrão TO-220, ex. 19x25x16mm, ~15°C/W | — | Isolador de mica + parafuso M3 se necessário | 1 | Ver cálculo térmico A.3.1 |
| CN1 | Conector Molex/Mini-Fit (ou Deutsche automotivo) | Molex 5557 4 vias ou Deutsch DT04-4P | Automotivo IP67 (recomendado) | 20A por via | 1 par | Conexão à chicote da bomba — preferir IP67 em compartimento do motor/tanque |
| ENC1 | Caixa/gabinete plástico ABS com prensa-cabo | Gabinete IP65 100x68x50mm | — | — | 1 | Instalação protegida contra umidade/vibração — ver Seção D |
| TAG1 | Tag NFC NTAG213/215/216 | NTAG213 (144 bytes) mín. | Adesivo ou cartão PVC | ISO 14443A, 13.56MHz | 1 por veículo | NTAG215/216 se precisar gravar payload maior |
| — | Cabo automotivo (potência, +12V bomba) | Cabo automotivo classe B, cobre estanhado | — | Mín. 4mm² (12 AWG) para até 20A / 6mm² (10 AWG) acima de 20A | conforme | Ver tabela A.2.1 |
| — | Cabo automotivo (sinal/controle) | Cabo automotivo 1 via | — | 0.5mm² (20 AWG) | conforme | Alimentação lógica e sinal pós-chave |
| — | Cabo de aterramento (GND) | Cabo automotivo preto | — | Mesma bitola da linha de potência | conforme | Sempre no chassi/negativo de bateria, ponto único |
| C1 | Capacitor eletrolítico (filtro entrada Buck) | Eletrolítico 105°C automotivo | Radial THT | 100µF/25V | 1 | Reduz ripple de entrada |
| C2 | Capacitor cerâmico (desacoplamento ESP32) | Cerâmico X7R | 0805/THT | 100nF/16V | 2 | Um por trilha VCC próximo ao módulo |
| RTC1 | Módulo RTC I2C com backup de bateria | DS3231 (módulo breakout + CR2032) | Módulo SMD | I2C, deriva <2min/ano | 1 | **Crítico** — mantém hora absoluta durante perda de energia do ESP32 (veículo desligado). Ver A.1.3.1 |

## A.2.1 Tabela de Bitolas de Fiação Automotiva (AWG / mm²)

| Corrente contínua | AWG mínimo | mm² mínimo | Aplicação típica |
|---|---|---|---|
| até 5A | AWG 18 | 0.75 mm² | Sinal, alimentação lógica (Linha 15) |
| 5-10A | AWG 16 | 1.0-1.5 mm² | Bombas de combustível de baixa vazão |
| 10-15A | AWG 14 | 2.0-2.5 mm² | Bombas de combustível padrão |
| 15-25A | AWG 12 | 3.0-4.0 mm² | Bombas de alta vazão / relé de partida |
| >25A | AWG 10 | 5.0-6.0 mm² | Casos especiais (verificar corrente real com amperímetro em regime de partida a frio) |

> **Regra prática:** sempre medir a corrente real de partida (inrush) e regime da bomba do veículo específico com um alicate amperímetro antes de finalizar F2 e a bitola do cabo de potência — bombas variam de 4A a 15A conforme modelo/fabricante.
