# Seção A.5 — Botão de Emergência e Motorista Parceiro

Duas extensões independentes da regra de liberação, ambas opcionais e
ambas pensadas para o mesmo problema real: o motorista oficial não está
disponível no momento em que o veículo precisa se mover.

## A.5.1 Motorista Parceiro

### Regra de negócio

Um condutor **parceiro** pode ser vinculado a um condutor **oficial**,
por veículo (painel → aba Autorizações → "Motorista parceiro"). O
parceiro fica autorizado a dar partida nesse veículo **apenas durante a
posse do oficial** — ou seja, enquanto existir um `trip_logs` aberto do
oficial para aquele veículo (`released_at <= agora < expires_at`, ver
Seção D.4.2 do manual).

Fora dessa janela, o vínculo não tem efeito: o parceiro não ganha acesso
permanente ao veículo só por estar cadastrado como parceiro de alguém.

### Modelo de dados

```sql
driver_partners (
  vehicle_id text,             -- FK -> vehicles.vehicle_id
  official_driver_code text,   -- FK -> drivers.driver_code
  partner_driver_code text,    -- FK -> drivers.driver_code
  primary key (vehicle_id, official_driver_code, partner_driver_code)
)
```

N:N em todos os sentidos — um oficial pode ter mais de um parceiro no
mesmo veículo (equipe de apoio), e um mesmo parceiro pode dar cobertura
a oficiais diferentes, inclusive em veículos diferentes.

### Aplicação da regra (importante)

Assim como `driver_vehicle_access` (autorização motorista↔veículo, ver
docs/09 e a nota na aba Autorizações), **este vínculo é hoje um registro
de gestão/relatório, não uma trava técnica**: o app não consulta
`driver_partners` nem `trip_logs` antes de liberar — qualquer ID digitado
no formulário é aceito pelo firmware (a segurança real do sistema está em
outro lugar: só quem está fisicamente junto do veículo tem NFC + alcance
BLE). Fazer o app *recusar* um parceiro fora da janela de posse exige que
o telefone consulte essas tabelas em tempo real antes de liberar — hoje
ele não tem essa permissão de leitura (só `INSERT` em `trip_logs`, ver
`web-dashboard/README.md`). Está no mesmo plano de trabalho combinado que
a aplicação de `driver_vehicle_access`, para quando o firmware/app
voltarem a esse escopo.

Na prática, isso funciona porque a trilha de auditoria já existe: todo
acionamento (oficial ou parceiro) grava um `trip_logs` com o
`driver_code` de quem digitou o próprio ID no app — dá para conferir
depois, no relatório, se um parceiro só usou o veículo durante a posse do
oficial que ele cobre.

## A.5.2 Botão de Emergência (hardware opcional)

### Quando usar

Liberação de emergência, sem NFC/BLE — para quando nem motorista oficial
nem parceiro têm celular disponível, mas o veículo precisa ser movido
(ex.: obstruindo saída, risco iminente). **Não é um atalho para uso
diário** — cada acionamento fica registrado e precisa ser justificado
depois.

### Instalação (sem alterar a placa já roteada)

O botão usa **GPIO32** do ESP32 DevKit, que não tem nenhum trace na placa
fenolite já roteada (docs/09/10/11) nem é reivindicado por nenhum outro
periférico no firmware. Ligação:

```
GPIO32 do DevKit ──── botão momentâneo NA ──── GND
```

- Fio direto no pino do header do DevKit — **não precisa refazer as
  trilhas de cobre nem alterar a lista de compra existente**
  (`docs/IGNLOCK-componentes-placa.xlsx`); adicionar 1× botão momentâneo
  painel (normalmente aberto) + ~15cm de fio como item avulso, se for
  instalar.
- Usa o pull-up interno do ESP32 (`INPUT_PULLUP`) — não precisa de
  resistor externo.
- Repouso = HIGH (solto), pressionado = LOW.
- **Evite GPIO27**: mesmo sem cobre dedicado na placa final, o firmware
  ainda o usa como saída (`PIN_STATUS_LED_G`, resquício do LED
  bicolor original — a placa final simplificou para um único LED em
  GPIO26). Reaproveitar esse pino para entrada colidiria com esse output.

### Comportamento do firmware

- Exige **pressão contínua de 3 segundos** (`EMERGENCY_HOLD_MS`) antes de
  liberar — reduz o risco de acionamento acidental, já que este caminho
  ignora toda a autenticação normal por definição. É a única mitigação
  técnica contra abuso; o resto é procedural (log + justificativa).
- Libera por **1 hora** apenas (`EMERGENCY_TOLERANCE_HOURS`), bem mais
  curto que a janela normal (4–48h) — é uma saída de emergência, não um
  turno de trabalho. Passada 1h, volta a bloquear normalmente e exige o
  procedimento NFC/BLE de novo.
- Grava o instante do acionamento na memória local do ESP32 (NVS),
  sobrevive a reboot, e expõe via uma característica BLE dedicada
  (`CHR_UUID_EMERGENCY`, payload `EMG:<epoch>`) até o app confirmar que
  sincronizou (escrevendo `ACK` de volta).

### Sincronização e justificativa

1. Próxima vez que **qualquer** celular conectar normalmente ao veículo
   (fluxo padrão da Seção D.4.1), o app lê a característica de
   emergência. Se houver evento pendente, grava localmente, sincroniza
   com o Supabase (tabela `emergency_events`) e confirma (`ACK`) ao
   firmware — tudo antes de mostrar o formulário normal de liberação, sem
   bloquear o fluxo principal.
2. O evento aparece na aba **Emergências** do painel, com veículo e
   instante do acionamento. `driver_code` e `justification` ficam vazios
   até alguém preencher — o botão físico não coleta essa informação (não
   há tempo/tela para isso numa emergência real).
3. Justificativa acontece depois, por qualquer um dos dois caminhos que
   a regra de negócio previu: **administrativamente** (conversa com o
   supervisor, fora do sistema) ou **via sistema** (painel → aba
   Emergências → preenche motorista + motivo → Salvar).

### Modelo de dados

```sql
emergency_events (
  id uuid,
  vehicle_id text,           -- FK -> vehicles.vehicle_id
  triggered_at timestamptz,  -- instante do acionamento (RTC do ESP32)
  driver_code text,          -- nulo até justificado
  justification text,        -- nulo até justificado
  justified_at timestamptz,
  justified_by text          -- 'motorista' | 'admin'
)
```

RLS: `anon` (app) só insere; `authenticated` (painel) lê e atualiza —
mesmo padrão de `trip_logs`, incluindo a mesma regra de nunca encadear
`.select()` num insert com a chave anônima (ver
`web-dashboard/README.md`).

### Status de implementação

Escrito e revisado, **não flashado/testado em hardware real** — mesmo
status do restante do firmware do ESP32 de bloqueio (deferido nesta fase
do projeto). Quando o firmware voltar ao escopo de bring-up, testar em
conjunto: debounce do botão, tempo de resposta do BLE ao pressionar, e o
ciclo completo sync→ACK com o app.
