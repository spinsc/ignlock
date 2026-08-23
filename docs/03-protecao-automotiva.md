# Seção A.3 — Guia de Proteção Automotiva

## A.3.1 Análise Térmica do MOSFET IRF4905 (Q1)

**Parâmetros do componente (datasheet IRF4905):**
- Rds(on) típico @ Vgs=-10V, Tj=25°C: **0.020Ω** (usar 0.028Ω para Tj=100°C, pior caso, coeficiente ~+40%)
- Resistência térmica junção-case (RθJC): 1.5°C/W
- Resistência térmica case-dissipador (RθCS, com isolador de mica): ~0.5°C/W
- Temperatura máxima de junção (Tj max): 175°C

### Cálculo de dissipação (P = I² × Rds(on))

| Corrente de carga (I) | Rds(on) pior caso (100°C) | Potência dissipada (P) |
|---|---|---|
| 5A | 0.028Ω | 0.70 W |
| 7A | 0.028Ω | 1.37 W |
| 10A | 0.028Ω | 2.80 W |

### Dimensionamento do dissipador (pior caso: 10A contínuos, ambiente de motor 70°C)

Fórmula: `Tj = Ta + P × (RθJC + RθCS + RθSA)`

Alvo: manter Tj ≤ 125°C (margem de segurança de 50°C abaixo do limite absoluto de 175°C, considerando ambiente de cofre de motor).

```
125°C = 70°C + 2.80W × (1.5 + 0.5 + RθSA)
55°C / 2.80W = 19.6°C/W = 1.5 + 0.5 + RθSA
RθSA ≤ 17.6°C/W
```

**Conclusão:** um dissipador aletado padrão TO-220 com RθSA ≈ 15°C/W (ex. dissipador 19x25x16mm) é suficiente até 10A contínuos em ambiente de 70°C, com margem de segurança de ~10°C. Para aplicações acima de 10A ou instalação em pontos de calor extremo (próximo ao coletor de escape), recomenda-se dissipador maior (RθSA ≤ 10°C/W) ou instalação do módulo em local mais ventilado do compartimento.

> **Nota:** para correntes de pico de partida a frio (inrush), que podem chegar a 1.5-2x a corrente nominal por poucos milissegundos, o IRF4905 suporta pulsos de corrente muito superiores (Idm = -220A pulsado) sem risco térmico, já que a constante térmica do encapsulamento TO-220 é de segundos, não milissegundos.

## A.3.2 Proteção Contra Surtos — ISO 7637-2 / Load Dump

Ambientes automotivos geram transientes elétricos normatizados pela ISO 7637-2. Os mais relevantes para este projeto:

| Pulso ISO 7637-2 | Descrição | Mitigação neste projeto |
|---|---|---|
| Pulso 1 | Corte de carga indutiva (desconexão de alternador sob carga) — pode gerar -100V | D1 (TVS 1.5KE18A) grampeia excursões negativas na linha de potência |
| Pulso 2a/2b | Transiente de comutação em série com alimentação (+50V a +100V) | D1 grampeia em 18V (Vbr), protegendo o Drain do Q1; fusível F2 protege contra sobrecorrente sustentada |
| Pulso 3a/3b | Transientes rápidos de chaveamento (ns) — até ±150V | Capacitor C1 (100µF) no Buck + trilhas curtas minimizam acoplamento; D1 responde em <1ns (TVS é near-instantâneo) |
| **Load Dump (ISO 16750-2 / pulso 5)** | Desconexão da bateria com alternador carregando — pico de **+40V a +120V** por 40-400ms | D1 é dimensionado para grampear em ~18-25V com Ppk 1500W — suficiente para a energia de um load dump filtrado por essa topologia; **recomenda-se adicionalmente que o Buck Step-Down (PS1) seja um módulo com proteção de entrada até 30-40V** (a maioria dos módulos LM2596/MP1584 comerciais suporta 28-40V de entrada, dando margem) |

**Recomendações de projeto:**
1. Sempre alimentar a lógica (PS1/ESP32) a partir da Linha 15 (pós-chave), nunca direto da bateria — reduz exposição a transientes de partida do motor de arranque (queda momentânea a ~6-8V) e desliga o sistema de controle quando o veículo está desligado.
2. Manter D1 fisicamente próximo ao Drain do Q1, com trilhas/fios curtos (<5cm) para minimizar indutância parasita que reduziria a eficácia do grampeamento.
3. Adicionar fusível F2 dimensionado em ~125-150% da corrente nominal da bomba (nunca subdimensionar — fusível é a última linha de defesa contra curto-circuito no chicote).

## A.3.3 Isolamento Galvânico

O optoacoplador PC817 (U1) separa fisicamente dois domínios elétricos:

- **Lado lógico (isolado):** ESP32, 3.3V, referenciado ao GND da eletrônica de controle.
- **Lado de potência:** +12V do veículo, chaveamento do MOSFET, sujeito a todos os transientes automotivos descritos em A.3.2.

Isso garante que:
- Um surto no lado de potência (ex. pico de load dump que ultrapasse a proteção de D1) tenha isolação de 5000Vrms (especificação do PC817) antes de alcançar o GPIO do ESP32.
- Ruído de chaveamento do MOSFET (dv/dt no Drain) não se acopla ao terra lógico do microcontrolador, evitando resets espúrios ou corrupção do BLE.

**Recomendações de layout (PCB ou protoboard):**
- Manter um único ponto de junção entre GND lógico e GND de potência (junção em estrela), evitando loops de terra.
- Rotear a trilha/fio de potência (Source-Drain do Q1, cabo até a bomba) separada fisicamente das trilhas de sinal do ESP32/BLE (a antena BLE integrada no módulo WROOM-32 é sensível a ruído próximo).
- Se usar PCB, aplicar uma "fenda" (slot) entre a região de potência e a região lógica, com o optoacoplador fazendo a única ponte entre elas.

## A.3.4 Corrente de Repouso e Consumo do Sistema

| Estado | Consumo típico |
|---|---|
| ESP32 ativo, BLE advertising, bomba bloqueada | ~80-120 mA @ 5V |
| ESP32 ativo, BLE conectado, bomba liberada (LED do opto aceso) | ~95-135 mA @ 5V |
| Deep sleep (não recomendado para este caso de uso — precisa BLE sempre ativo) | N/A |

Como o sistema é alimentado pela Linha 15 (pós-chave), o consumo em repouso com o veículo desligado é **zero** — não há risco de descarregar a bateria do veículo parado.
