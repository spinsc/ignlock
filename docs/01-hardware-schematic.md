# Seção A.1 — Esquemático Elétrico Completo

## Sistema de Bloqueio e Liberação de Partida Veicular Inteligente
**Revisão:** 1.0 | **Data:** 2026-08-23 | **Autor:** Engenharia de Sistemas Embarcados

---

## A.1.1 Arquitetura de Blocos

```
                +------------------+
   +12V ------->|  BUCK STEP-DOWN  |------> +5V (VIN ESP32)
  (pós-chave,   |  LM2596 / MP1584 |
   Linha 15)    +------------------+
        |
        |                                        +--------------------+
        |                                        |      ESP32          |
        |                                        |  (WROOM-32 DevKit)  |
        |                                        |                      |
        |                                        |  GPIO25 --> Relé-LED |----+
        |                                        |  GPIO26 --> STATUS   |
        |                                        |  GPIO27 --> BOOT/FS  |
        |                                        |  BLE GATT Server     |
        |                                        +--------------------+
        |                                                   |
        |                                                   | (R1 220R)
        |                                                   v
        |                                          +------------------+
        |                                          |   PC817 (U1)     |
        |                                          |  Optoacoplador   |
        |                                          |  Pino1(A) Pino2(K)|<-- GND
        |                                          |  Pino3(E) Pino4(C)|
        |                                          +------------------+
        |                                                   |  (C = Pino4)
        |                                                   |
        +----------------[ R2 10k PULL-UP GATE ]-----+      |
        |                                              |      | (R3 220R série gate)
        |                                              v      v
        |                                        +-----------------+
   +12V (Line 15)------------[S]--- IRF4905 (Q1) -+-----------------+
        |                          P-CH MOSFET     G
        |                          TO-220           |
        |                    D +-------------------+ (Gate)
        |                      |
        |                 [TVS D1]                (E = Pino3 do PC817 -> GND chassi)
        |                 1.5KE18A
        |                 (D-GND)
        |                      |
        +----------------------+-------> SAÍDA (+12V CHAVEADO)
                               |              |
                          [FLYBACK D2]        v
                          1N5408          BOMBA DE COMBUSTÍVEL
                          (catodo->+12V,   / RELÉ ORIGINAL DA BOMBA
                           anodo->DRAIN)
                               |
                              GND (retorno pelo próprio consumidor / chassi)
```

## A.1.2 Netlist / Ligações Pino a Pino

### Alimentação
| De | Para | Observação |
|---|---|---|
| +12V veículo (pós-chave / Linha 15, **fusível 1A** em série) | VIN módulo Buck Step-Down | Nunca ligar direto na bateria (permanente) — deve morrer com a chave desligada, ver A.1.3 |
| Buck OUT+ (ajustado para 5.0V ±2%) | ESP32 pino `5V`/`VIN` | Verificar polaridade antes de energizar |
| Buck OUT- / GND | ESP32 `GND` | Referência comum de todo o circuito de sinal |
| +12V veículo (permanente, direto da bateria, **fusível 15A/20A** conforme bomba) | Source (S) do IRF4905 (Q1) | Esta é a linha de potência que será chaveada — a bomba só liga se Q1 conduzir |
| GND chassi | Retorno da bomba / carga | Comum a todo o sistema |

### ESP32 → Optoacoplador PC817 (U1) — Lado de Controle (isolado, 3.3V)
| ESP32 | Componente | Componente | Observação |
|---|---|---|---|
| GPIO25 (`PIN_PUMP_CTRL`) | R1 (220Ω, 1/4W) | Pino 1 (Ânodo) do U1 | Corrente ~9-10mA, dentro do limite seguro do GPIO (máx recomendado 12mA) |
| GND | — | Pino 2 (Cátodo) do U1 | Retorno do LED interno do opto |
| GPIO26 (`PIN_STATUS_LED`) | R4 (330Ω) | LED status (bicolor vermelho/verde) | Indicação visual local de bloqueado/liberado |
| GPIO0 / EN | — | — | Boot/reset padrão do módulo DevKit, não usado pela aplicação |

### Optoacoplador PC817 (U1) → Gate Driver do MOSFET — Lado de Potência (12V, isolado galvanicamente do ESP32)
| Componente | Pino | Conecta a | Observação |
|---|---|---|---|
| U1 Pino 4 (Coletor) | — | Nó "Gate Drive" (junção de R2, R3 e Gate via R3) | Quando o fototransistor conduz, puxa este nó para próximo de GND |
| U1 Pino 3 (Emissor) | — | GND chassi | Fecha o laço do lado de potência |
| R2 (10kΩ, 1/2W) | — | Entre +12V (Source) e nó "Gate Drive" | **Pull-up de segurança**: com o opto desligado (ESP32 sem energizar o LED), o Gate fica em +12V = mesmo potencial do Source → Vgs = 0V → **MOSFET DESLIGADO (fail-safe bloqueado)** |
| R3 (220Ω, 1/2W) | — | Entre nó "Gate Drive" e Gate do Q1 | Limita corrente de carga/descarga do capacitor de gate (evita ringing) |
| D3 (Zener 15V, 1W, bidirecional TVS pequeno) | — | Entre Gate e Source do Q1 | Protege o Gate contra Vgs > |20V| em transientes |

### MOSFET de Potência IRF4905 (Q1) — High-Side Switch
| Pino | Conecta a |
|---|---|
| Source (S) | +12V permanente da bateria (fusível dedicado) |
| Gate (G) | Nó "Gate Drive" (via R3) |
| Drain (D) | Saída chaveada → entrada +12V original da bomba de combustível (ou bobina do relé da bomba) |

### Proteções de Potência
| Componente | Ligação | Função |
|---|---|---|
| D1 — TVS 1.5KE18A | Entre Drain (D) e GND | Grampeia surtos de *load dump* (ISO 7637-2 pulso 5) que apareçam na linha chaveada |
| D2 — Diodo Flyback 1N5408 | Catodo em +12V (Drain/saída), Anodo em GND *(ou em antiparalelo direto sobre a carga indutiva — bomba/bobina do relé)* | Escoa a energia armazenada na indutância da bomba/bobina no instante do desligamento, protegendo o Drain do MOSFET |
| Fusível F1 (1A) | Em série na alimentação do Buck (12V lógica) | Protege eletrônica de controle |
| Fusível F2 (conforme corrente da bomba, tipicamente 15-20A) | Em série na linha +12V permanente → Source do Q1 | Protege o ramo de potência |

> **Nota de topologia:** o diodo flyback D2 deve ficar o mais próximo fisicamente possível da carga indutiva (bomba/relé), em antiparalelo com ela (catodo no +12V, anodo no terminal chaveado), não apenas no conector do módulo — isso minimiza indutância parasita do chicote entre o supressor e a fonte do surto.

## A.1.3 Diagrama do Circuito de Potência (detalhe)

```
      +12V BATERIA (permanente)
            |
          [F2 20A]
            |
            +----------------------------+
            |                            |
         Source(S)                    R2 10k
      +----IRF4905-----+                 |
      |     Q1         |                 +---- nó GATE_DRIVE ----+
      |              Gate(G)-----[R3 220R]-----+                 |
      |                |                        |            [D3 15V TVS]
      |             Drain(D)                    |                |
      |                |                    U1 PC817 Pino4(C)   GND
      |                +---------+                |
      |                          |            U1 Pino3(E)
      |                    [D1 TVS 18V]           |
      |                          |                GND
      |                         GND
      |
      +---> SAÍDA CHAVEADA (+12V_SW) ---+---[D2 1N5408 antiparalelo]---+
                                          |                              |
                                    BOMBA DE COMBUSTÍVEL /  <------------+
                                    RELÉ ORIGINAL (retorno GND)
```

## A.1.3.1 Adendo Crítico — Módulo RTC Externo (DS3231) para Operação 100% Offline

**Problema de engenharia identificado:** o ESP32 é alimentado pela Linha 15 (pós-chave) — decisão correta para não drenar a bateria do veículo parado, mas isso significa que **o módulo perde energia toda vez que o motorista desliga o veículo**. O contador `millis()` do ESP32 zera a cada boot e o chip não possui domínio RTC com retenção de energia própria. Sem uma fonte de tempo absoluto que sobreviva ao corte de energia, o firmware **não teria como saber quanto tempo realmente se passou** entre o motorista desligar e ligar o carro — o que é essencial para a regra de tolerância de 12h funcionar corretamente em operação 100% offline (sem NTP/internet).

**Solução adotada:** adicionar um módulo RTC **DS3231** (comunicação I2C, bateria coin-cell CR2032 própria, deriva <2min/ano) à BOM. Esse módulo mantém a hora absoluta mesmo com o ESP32 totalmente desenergizado, consumindo apenas a própria bateria de célula (µA), sem impacto na bateria do veículo.

| Componente adicional | Part Number | Qtd |
|---|---|---|
| Módulo RTC | DS3231 (módulo breakout com bateria CR2032) | 1 |

### Ligação do DS3231 (barramento I2C)
| DS3231 | ESP32 |
|---|---|
| VCC | 3.3V |
| GND | GND |
| SDA | GPIO21 |
| SCL | GPIO22 |

O firmware sincroniza o DS3231 a cada autenticação BLE bem-sucedida (usando o `EPOCH_TIMESTAMP` enviado pelo app) e, a cada boot, lê a hora absoluta do DS3231 antes de decidir se a janela de tolerância ainda é válida — ver Seção B.3 e B.4.

## A.1.4 Lógica de Nível

| Estado ESP32 (GPIO25) | Corrente no LED do PC817 | Fototransistor U1 | Nó Gate Drive | Vgs do Q1 | Estado da Bomba |
|---|---|---|---|---|---|
| `LOW` (0V) — padrão/boot/falha | OFF | Aberto | ≈ +12V (via R2) | ≈ 0V | **BLOQUEADA** (fail-safe) |
| `HIGH` (3.3V) — liberado | ON | Saturado | ≈ GND (0-0.5V) | ≈ -11.5V | **LIBERADA** (Q1 em condução) |

Este arranjo garante que **qualquer falha** (queda de energia do ESP32, travamento de firmware antes da inicialização do GPIO, reset, brownout) resulte automaticamente em GPIO25 = LOW = bomba bloqueada. Ver Seção B.4 para o tratamento de fail-safe em firmware.
