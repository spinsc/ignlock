# Seção A.4 — Módulo de Rastreamento (GPS + Celular)

## A.4.1 Decisão de Arquitetura: Módulo Separado e Sempre Ligado

O sistema de bloqueio de partida (Seções A.1-A.3) é alimentado pela
**Linha 15** (pós-chave) deliberadamente — para não drenar a bateria do
veículo parado. Rastreamento contínuo exige exatamente o oposto: energia
disponível **mesmo com o veículo desligado**.

Em vez de comprometer o design já validado do ESP32 de bloqueio (que
precisa ficar sempre acordado anunciando BLE, com lógica de fail-safe
testada), o rastreamento é um **segundo controlador, eletricamente e
logicamente independente**, ligado direto à bateria permanente:

- Uma falha de firmware no rastreador não pode travar ou impedir a
  liberação da bomba (e vice-versa).
- Os dois sistemas têm ciclos de trabalho opostos: o bloqueio precisa
  estar sempre pronto para responder a um BLE connect; o rastreador quer
  dormir a maior parte do tempo para economizar bateria.
- Se o rastreador falhar ou for removido, o bloqueio de partida continua
  funcionando normalmente, e vice-versa.

Os dois módulos só compartilham o `vehicle_id` como chave de correlação no
backend — não há fiação de dados entre eles.

## A.4.2 Diagrama de Blocos

```
BATERIA +12V (permanente) ---[F3 2A]---+--> Regulador do módulo SIM7600 (aceita 6-24V direto)
                                        |
                                        +--> Buck 12V->5V ---> ESP32 (Tracker) VIN
                                        |
LINHA 15 (pós-chave) --[R_div]--[opto isolador]--> GPIO (sense de ignição)
                                        |
                                   [divisor resistivo]
                                        |
                                        +--> ADC do ESP32 (leitura de tensão da bateria)

ESP32 (Tracker)
   |-- UART --> SIM7600G-H (LTE Cat4 + GNSS integrado)
   |                 |-- antena LTE (u.FL + pigtail)
   |                 |-- antena GNSS ativa (u.FL + pigtail)
   |                 |-- SIM card (M2M)
   |
   +-- HTTPS POST (via AT+HTTP* do SIM7600) --> Supabase REST
                                                  (tabela vehicle_positions,
                                                   mesma chave anônima do app)
```

## A.4.3 Por que SIM7600G-H (não SIM800L)

- **2G está sendo desligado nas operadoras brasileiras** — um projeto novo
  não deve depender de GPRS/2G (SIM800L) como única opção de conectividade.
- O SIM7600G-H (variante "Global") já traz **GNSS integrado** no mesmo
  chip do modem LTE — dispensa um módulo GPS separado (ex. NEO-6M),
  reduzindo contagem de peças e pontos de falha.
- Suporta comandos AT de **HTTP(S) embutidos** (`AT+HTTPINIT`,
  `AT+HTTPPARA`, `AT+HTTPACTION`, `AT+HTTPDATA`) — o ESP32 não precisa
  implementar uma pilha TCP/IP própria sobre PPP, só enviar comandos AT
  pela UART.
- Placas de breakout comerciais (Waveshare, SIMCom EVB, genéricas) aceitam
  alimentação direta de 6-24V com regulador onboard — dispensa um buck
  dedicado só para o modem.

> Confirme com o fornecedor as bandas LTE suportadas pela variante
> específica antes de comprar — a variante "Global" (SIM7600G-H) cobre a
> maioria das bandas usadas por Vivo/Claro/TIM, mas isso deve ser validado
> por região antes do pedido.

## A.4.4 Orçamento de Energia (por que o intervalo de report é adaptativo)

| Cenário | Corrente média estimada | Consumo em 24h |
|---|---|---|
| Reportando a cada 5 min, sempre ativo | ~46 mA | ~1.1 Ah/dia |
| Reportando a cada 15 min (veículo parado) | ~16 mA | ~0.38 Ah/dia |

Uma bateria automotiva típica tem 45-70Ah. Em 5 min/report constante, o
rastreador sozinho consumiria **~1.5-2.5% da carga por dia** com o veículo
parado — inaceitável para um veículo que pode ficar dias sem rodar.
Por isso o firmware usa um **intervalo adaptativo**:

- **Veículo ligado** (detectado pelo sense da Linha 15): reporta a cada
  **60s** — rastreamento quase em tempo real durante a viagem.
- **Veículo desligado**: reporta a cada **15 min** — suficiente para saber
  onde o veículo está sem drenar a bateria.
- **Corte de baixa tensão**: se a tensão da bateria (lida via ADC, ver
  A.4.5) cair abaixo de **11.8V**, o rastreador para de transmitir e entra
  em hibernação profunda, só voltando a operar quando a tensão subir acima
  de **12.4V** (ex. depois que o veículo for religado e o alternador
  recarregar) — protege a capacidade de partida do veículo contra o
  próprio rastreador.

## A.4.5 Sensoriamento (ignição e tensão da bateria)

Dois sinais analógicos/digitais adicionais, isolados do lado de potência
da mesma forma que o resto do projeto (ver A.3.3):

- **Sense de ignição:** Linha 15 → divisor resistivo → optoacoplador
  (mesmo princípio do PC817 usado no bloqueio) → GPIO digital do ESP32.
  Nível ALTO = veículo ligado.
- **Tensão da bateria:** divisor resistivo (ex. 100kΩ/22kΩ, atenuando
  ~14V para ~2.5V) direto num pino ADC do ESP32 — sem isolamento galvânico
  necessário aqui, pois é uma medição, não um chaveamento de potência.

## A.4.6 BOM do Módulo de Rastreamento

| Ref. | Componente | Part Number Sugerido | Qtd | Observação |
|---|---|---|---|---|
| U3 | Módulo ESP32 DevKit | ESP32-WROOM-32D | 1 | Mesmo módulo usado no bloqueio — reaproveita toolchain |
| U4 | Módulo LTE + GNSS | SIM7600G-H (breakout, ex. Waveshare SIM7600G-H HAT) | 1 | Confirmar bandas LTE da região antes de comprar |
| ANT1 | Antena LTE | Antena externa u.FL/SMA, banda LTE | 1 | Instalar longe de metal/gabinete |
| ANT2 | Antena GNSS ativa | Antena ativa u.FL/SMA, LNA integrado | 1 | Necessita linha de visada razoável para o céu |
| SIM1 | Chip SIM M2M | Nano/micro SIM conforme o módulo | 1 | Plano de dados M2M — baixo consumo (poucos MB/mês) |
| F3 | Porta-fusível + fusível 2A | ATM Mini, 32V | 1 | Linha permanente da bateria para o módulo |
| PS2 | Módulo Buck 12V→5V | MP1584EN ou LM2596S | 1 | Alimentação do ESP32 (o SIM7600 usa seu próprio regulador onboard) |
| U5 | Optoacoplador | PC817 | 1 | Isolamento do sense de ignição (Linha 15) |
| R5, R6 | Resistores (divisor sense ignição) | 10kΩ / 2.2kΩ (ajustar) | 2 | Atenua 12V para o nível do opto |
| R7, R8 | Resistores (divisor tensão bateria) | 100kΩ / 22kΩ | 2 | Atenua ~14V para ~2.5V (faixa do ADC) |
| ENC2 | Gabinete IP65 | 100x68x50mm | 1 | Instalação protegida — mesmo padrão do módulo de bloqueio |

> Este módulo tem uma placa e um gabinete **próprios**, separados do
> módulo de bloqueio (ver A.4.1) — não compartilha PCB nem BOM com a
> Seção A.2.

## A.4.7 Backend e Painel

- Tabela `vehicle_positions` no Supabase (`vehicle_id`, `latitude`,
  `longitude`, `speed_kmh`, `heading_deg`, `recorded_at`, `received_at`),
  com o mesmo modelo de segurança de `trip_logs`: o rastreador (chave
  anônima) só **insere**, nunca lê; o painel (autenticado) só **lê**.
- Aba **Rastreamento** no [painel web](../web-dashboard) — mapa
  (OpenStreetMap/Leaflet) com a última posição de cada veículo, mais uma
  tabela com velocidade, coordenadas e status ("atualizado" /
  "sem sinal recente" após 20 min sem report).
- O firmware do rastreador está em [`firmware_tracker/`](../firmware_tracker)
  — mesmo status do firmware de bloqueio: **pronto, mas não gravado nem
  testado em placa física ainda**.
