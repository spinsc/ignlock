# IGNLOCK — Módulo de Rastreamento

Firmware do controlador de rastreamento (ESP32 + SIM7600G-H), **separado**
do firmware de bloqueio de partida em [`../firmware`](../firmware) — ver a
justificativa da arquitetura em
[docs/08-modulo-rastreamento.md](../docs/08-modulo-rastreamento.md), Seção A.4.1.

## Status

Código pronto, com a mesma ressalva do firmware de bloqueio: **não foi
gravado nem testado em placa física ainda**. A sintaxe exata de alguns
comandos AT do SIM7600 pode precisar de ajuste fino contra a revisão de
firmware do módulo específico usado — ver o aviso no topo de
`src/cellular_client.h`.

## Antes de gravar em uma unidade nova

1. Edite `include/config.h`:
   - `VEHICLE_ID` — deve bater exatamente com o `vehicle_id` já cadastrado
     no [painel](../web-dashboard) (senão o insert em `vehicle_positions`
     falha por violação de FK).
   - `CELLULAR_APN` — confirme com a operadora do chip M2M usado.
2. Confirme os resistores do divisor de tensão da bateria
   (`BATTERY_DIVIDER_RATIO`) batem com os valores reais montados na placa.

## Compilar

```bash
cd firmware_tracker
pio run              # compila
pio run -t upload    # grava no ESP32
pio device monitor    # log serial (115200 baud)
```

## Fluxo de operação

1. Boot: inicializa o modem, registra na rede LTE, liga o motor GNSS.
2. Loop: se a bateria estiver em corte de baixa tensão, não faz nada além
   de checar a tensão a cada 5 min (ver `PowerMonitor`).
3. Caso contrário, reporta a posição a cada 60s (veículo ligado) ou 15 min
   (desligado) — sense de ignição via a Linha 15, isolado por opto.
4. Cada report é um `POST` direto para `vehicle_positions` no Supabase,
   com a mesma chave anônima do app/painel — a política de RLS só permite
   `INSERT`, nunca leitura (ver `add_vehicle_positions` no projeto Supabase).
