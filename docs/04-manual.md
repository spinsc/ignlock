# Seção D — Manual de Desenvolvimento, Montagem, Instalação e Uso

---

## D.1 Guia de Montagem da PCB/Protótipo

### D.1.1 Sequência de Soldagem (protoboard ilhada ou PCB)

1. **Soquetes primeiro:** solde o soquete DIP-4 (U1/PC817) antes de qualquer outro componente — evita dano térmico ao optoacoplador e facilita substituição futura.
2. **Componentes passivos baixos:** resistores R1-R4, diodo zener D3 — todos rente à placa.
3. **Diodos de potência:** D1 (TVS) e D2 (flyback) — respeitar a polaridade (faixa catodo). Usar trilhas/fios de bitola adequada (ver A.2.1) mesmo nas conexões destes diodos.
4. **MOSFET Q1 (IRF4905) por último entre os semicondutores:** solde com a aba metálica (tab, que é o Drain) voltada para fora da placa, permitindo fixação do dissipador sem tensionar os terminais.
5. **Módulo Buck Step-Down (PS1):** monte em separado (geralmente já vem em placa própria) e interligue por fios curtos (<10cm) com conectores ou solda direta.
6. **ESP32 DevKit:** utilize barra de pinos fêmea (soquete) na placa principal — nunca solde o módulo ESP32 diretamente, para permitir substituição sem desmontar o sistema.

### D.1.2 Isolamento e Proteção Mecânica

- Aplique **verniz de proteção conformal** (ou, na ausência, esmalte sintético/verniz de unha dielétrico em último caso para protótipos) sobre toda a face de solda após os testes elétricos, especialmente na região de potência (Q1, D1, D2, F2).
- Todas as conexões de potência (Source, Drain, GND de potência) devem usar **terminais faston ou conectores automotivos com trava**, nunca fio solto torcido — a vibração veicular contínua fadiga e rompe conexões soldadas sem alívio de tensão.
- Isole o corpo metálico do IRF4905 (TO-220, aba = Drain) do dissipador com **isolador de mica + bucha isolante + pasta térmica**, caso o dissipador seja compartilhado com outro componente ou encoste na carcaça metálica do gabinete (evita curto do Drain com o chassi/GND).

### D.1.3 Instalação do Dissipador de Calor

1. Aplique uma fina camada de pasta térmica na face de contato do TO-220.
2. Fixe o dissipador com parafuso M3 + porca, torque leve (não esmague o encapsulamento).
3. Verifique com multímetro (modo continuidade) que **não há curto entre a aba do MOSFET (Drain) e o dissipador/gabinete** caso o dissipador seja aterrado ao chassi do veículo — se o dissipador for metálico e ficar exposto dentro do gabinete, use isolador de mica (ver A.3.1 para cálculo térmico).

### D.1.4 Teste de Bancada (antes de instalar no veículo)

1. Alimente PS1 com fonte de bancada 12V, **sem conectar ainda a linha de potência do Q1**.
2. Confirme +5V estável na saída do Buck com multímetro.
3. Ligue o ESP32, confirme via monitor serial (115200 baud) o boot log (`[BOOT] ...`) e o estado de fail-safe bloqueado.
4. Alimente separadamente a linha de potência (Source do Q1) com uma fonte de bancada de 12V/1A **e uma lâmpada automotiva de 12V/5W no lugar da bomba** (carga de teste segura).
5. Envie um comando de autenticação via BLE (usar um app genérico de debug BLE, ex. nRF Connect, escrevendo na característica AUTH) e confirme que a lâmpada acende.
6. Aguarde a expiração (ou reduza `VALID_HOURS` para 1 em teste) e confirme que a lâmpada apaga automaticamente.

---

## D.2 Procedimento de Gravação das Tags NFC

### D.2.1 Materiais
- Tags NFC NTAG213 (ou superior) — adesivas ou em cartão PVC.
- Smartphone Android com NFC (a gravação pode ser feita com apps genéricos como "NFC Tools", ou pelo próprio app da frota se implementarmos tela de admin — recomendado para produção).
- MAC BLE do ESP32 do veículo (obtido via monitor serial no boot: `[BLE] Servico iniciado. Nome: IGNLOCK-XXXX` — o MAC completo aparece no log de boot antes dessa linha, via `esp_read_mac`).

### D.2.2 Formato do Conteúdo NDEF

Grave um **registro de texto NDEF único** com o seguinte formato (consumido por `VehicleTag.parse()` no app — ver [vehicle_tag.dart](../mobile_app/lib/models/vehicle_tag.dart)):

```
VEHICLE_ID;BLE_MAC
```

**Exemplo:**
```
TRUCK-042;AA:BB:CC:DD:EE:FF
```

- `VEHICLE_ID`: identificador único e legível do veículo na frota (placa, número de frota, etc. — sem `;`).
- `BLE_MAC`: endereço MAC do ESP32, formato `XX:XX:XX:XX:XX:XX`, maiúsculas.

### D.2.3 Passo a Passo

1. Anote o MAC BLE do ESP32 do veículo (monitor serial no boot ou etiqueta interna do módulo).
2. Abra o app de gravação NFC, crie um novo registro de **texto (Text Record)**.
3. Digite exatamente `VEHICLE_ID;BLE_MAC` conforme o formato acima, sem espaços extras.
4. Aproxime a tag e grave. Bloqueie a tag contra escrita (write-lock) após confirmar a leitura correta, se o app permitir — evita gravação acidental futura.
5. Teste a leitura usando o próprio app da frota (tela de liberação, botão "Aproximar do veículo") antes de fixar definitivamente a tag no painel.
6. Mantenha um registro (planilha/sistema da frota) associando `VEHICLE_ID` ↔ `BLE_MAC` ↔ placa/chassi do veículo, para rastreabilidade e eventual regravação.

### D.2.4 Fixação Física
- Cole a tag em local **plano, seco, longe de metal** (metal atenua/bloqueia o campo NFC) — recomendado: canto do painel plástico próximo ao volante, ou console central.
- Evite locais expostos a sol direto intenso e prolongado (degrada o adesivo) ou risco de atrito constante (ex. sob o joelho do motorista).

---

## D.3 Manual de Instalação Veicular

### D.3.1 Identificação Segura do Chicote da Bomba/Relé de Combustível

1. **Nunca corte fios sem antes confirmar com multímetro** qual é o fio de alimentação positiva da bomba de combustível — em muitos veículos a bomba é acionada por um **relé dedicado**, e a interceptação correta é no fio que sai do relé em direção ao tanque/bomba (não na bobina de acionamento do relé, que é de baixa corrente).
2. Consulte o **diagrama elétrico específico do modelo/ano do veículo** (manual de serviço do fabricante) para localizar o relé da bomba de combustível na caixa de relés.
3. Com a chave desligada, meça continuidade e, com a chave ligada (sem dar partida), meça tensão no terminal suspeito — deve haver +12V apenas quando a bomba está energizada (alguns veículos energizam a bomba por ~2s ao ligar a chave, antes da partida, para pressurizar o sistema — use esse comportamento para confirmar o fio correto).
4. **Ponto de corte recomendado:** entre a saída do relé da bomba e o conector da bomba/módulo de controle, inserindo o sistema em série (Drain do Q1 → bomba; Source do Q1 → saída original do relé).

### D.3.2 Ligação do Pós-Chave (Linha 15)

- A alimentação lógica do sistema (Buck Step-Down → ESP32 → DS3231) deve ser conectada à **Linha 15** (contato pós-chave, "ignição ligada"), tipicamente disponível:
  - No conector do rádio original (fio comutado por chave, +12V apenas com ignição ligada).
  - Na caixa de fusíveis do habitáculo, fusível de "acessórios" ou "ignição".
- **Nunca** conecte a lógica direto na bateria (permanente) — isso manteria o ESP32/BLE sempre ativos, drenando a bateria do veículo parado (ver A.3.4).
- A linha de potência (Source do Q1) deve vir **diretamente da bateria** (ou do ponto de alimentação original da bomba, que já é permanente/protegido por fusível de fábrica), pois o próprio MOSFET é quem controla se a bomba recebe energia — não a chave de ignição.

### D.3.3 Cuidados Mecânicos Contra Vibração e Umidade

| Cuidado | Motivo |
|---|---|
| Usar gabinete IP65 (ENC1) com prensa-cabos em todas as entradas de fio | Compartimento do motor e sob o painel têm exposição a umidade, poeira e óleo |
| Fixar o gabinete com abraçadeiras ou parafusos em ponto rígido da carroceria, longe de partes móveis (polias, correias) | Vibração contínua do motor pode romper conexões e desgastar o gabinete por atrito |
| Usar conectores automotivos com trava positiva (Molex Mini-Fit ou Deutsch DT) em vez de conectores de terminal aberto | Evita desconexão por vibração — crítico para a linha de potência da bomba |
| Aplicar loom/conduíte corrugado em todo o chicote novo | Proteção contra abrasão, calor e umidade |
| Rotear o chicote longe do coletor de escape e de partes que atinjam alta temperatura | O DS3231 (bateria de lítio) e os semicondutores têm faixas de temperatura limitadas |
| Selar todas as emendas com solda + termorretrátil (nunca apenas fita isolante) | Fita isolante se degrada com óleo/calor; solda+termorretrátil resiste à vibração e umidade |
| Aterrar (GND) em ponto único de chassi, limpo e sem pintura | Evita resistência de contato e ruído elétrico que afetaria o BLE |

### D.3.4 Checklist de Instalação

- [ ] Multímetro confirmou fio correto da bomba/relé antes de qualquer corte.
- [ ] Fusíveis F1 (lógica) e F2 (potência) instalados o mais próximo possível da fonte (bateria/pós-chave).
- [ ] Gabinete fixado em local protegido, longe de calor e partes móveis.
- [ ] Todas as emendas soldadas e protegidas com termorretrátil.
- [ ] Teste de bancada (D.1.4) realizado **antes** da instalação definitiva.
- [ ] Após instalação: teste de liberação/bloqueio real dando partida no veículo.
- [ ] Teste de fail-safe: desconectar o ESP32 (ou seu fusível F1) com a bomba liberada e confirmar que ela **bloqueia imediatamente**.
- [ ] Tag NFC fixada e testada no local definitivo do painel.

---

## D.4 Manual do Motorista

### D.4.1 Uso Diário (primeira liberação do dia / após expirar a tolerância)

1. Abra o aplicativo da frota no celular.
2. Toque em **"Aproximar do veículo"**.
3. Aproxime o celular da tag NFC no painel (ícone NFC piscando na tela) até a leitura ser confirmada.
4. Aguarde a conexão Bluetooth automática com o veículo (alguns segundos).
5. Preencha o formulário:
   - **Condutor** (seu ID/matrícula).
   - **KM atual** (odômetro do painel).
   - **Destino** da viagem.
6. Toque em **"Liberar partida"**.
7. Aguarde a confirmação verde ("Liberado por N horas") — o LED de status no gabinete instalado no veículo também deve acender **verde**.
8. Dê a partida normalmente.

### D.4.2 Durante a Janela de Tolerância

- Se você desligar e ligar o veículo novamente **dentro da janela configurada** (ex. 12 horas), a bomba permanece liberada automaticamente — **não é necessário repetir o procedimento NFC/BLE**.
- O LED de status permanece **verde** enquanto a liberação estiver válida.

### D.4.3 Quando a Tolerância Expira

- Passadas as N horas desde a última liberação, o sistema bloqueia automaticamente a bomba (LED muda para **vermelho**).
- Repita o procedimento da Seção D.4.1 para liberar novamente.

### D.4.4 Boas Práticas

- Mantenha o Bluetooth do celular sempre ativado durante o expediente.
- Não force a leitura NFC contra vidro ou metal — encoste diretamente na área da tag no painel.
- Em caso de falha de leitura, aguarde 2-3 segundos e tente novamente antes de reportar problema.

---

## D.5 Matriz de Troubleshooting / Resolução de Problemas

| Sintoma | Causas prováveis | Diagnóstico | Solução |
|---|---|---|---|
| App não encontra o dispositivo BLE após ler a tag NFC | ESP32 sem energia (fusível F1 rompido, veículo desligado); Bluetooth do celular desativado; celular fora do alcance (>10m com obstáculos metálicos) | Verificar LED de status no gabinete (apagado = sem energia); verificar Bluetooth do celular; medir tensão pós-chave no conector | Trocar F1; ativar Bluetooth; aproximar o celular a menos de 5m com linha de visada |
| Leitura NFC falha repetidamente | Tag danificada/descolada; celular sem NFC ativo; metal entre celular e tag | Testar tag com outro celular/app NFC genérico | Reativar NFC nas configurações do celular; regravar/trocar a tag (D.2) |
| Liberação enviada mas bomba não liga | MOSFET Q1 danificado (curto ou aberto); fio da bomba desconectado; fusível F2 rompido | Medir tensão no Drain do Q1 com liberação ativa (deve haver +12V); medir continuidade Source-Drain com liberação ativa | Substituir Q1; verificar conexão do chicote; trocar F2 |
| Bomba permanece **sempre bloqueada**, mesmo após liberação BLE confirmada pelo app | DS3231 sem hora confiável (bateria CR2032 descarregada, ou nunca sincronizado); falha no I2C | Verificar log serial: mensagem `[RTC] FALHA` ou `[BOOT] AVISO CRITICO` no boot | Trocar bateria CR2032 do DS3231; verificar fiação SDA/SCL (GPIO21/22); após reparo, fazer uma nova liberação para ressincronizar |
| Bomba libera, mas volta a bloquear antes do tempo configurado | Reboot inesperado do ESP32 combinado com falha no DS3231 (perde referência de tempo); brownout por queda de tensão no arranque do motor | Verificar log serial para resets inesperados; medir tensão de 5V do Buck durante a partida do motor de arranque | Garantir capacitor C1 (100µF) na entrada do Buck; considerar módulo Buck com maior faixa de entrada/holdup; verificar aterramento único |
| Token/liberação expira mais cedo ou mais tarde que o esperado | Fuso horário incorreto no celular; celular com hora/data errada | Comparar hora do celular com hora real | Corrigir data/hora automática do celular (usar hora de rede) antes de nova liberação |
| LED de status pisca ou fica em estado intermediário | Alimentação instável (5V com ripple); mau contato no conector do LED | Medir 5V com osciloscópio/multímetro em modo AC durante a partida | Verificar aterramento; revisar solda dos LEDs; considerar capacitor adicional no Buck |
| App conecta mas trava em "Enviando liberação..." | Característica AUTH não respondeu (firmware travado); payload rejeitado silenciosamente por formato inválido | Ler log serial (`[AUTH] Payload malformado`) | Reiniciar o ESP32 (remover/reconectar F1); confirmar versão do firmware compatível com o app |
| Múltiplos veículos aparecem/confundem no app | MACs BLE duplicados ou tags trocadas entre veículos | Conferir cadastro `VEHICLE_ID` ↔ `BLE_MAC` (D.2.3, passo 6) | Regravar a tag correta para cada veículo; nunca reutilizar uma tag em veículo diferente sem regravar |
| Queda de tensão no arranque causa reset do ESP32 (log mostra boot repetido) | Motor de arranque puxa a tensão da bateria abaixo de ~6-7V momentaneamente | Osciloscópio na saída do Buck durante a partida | Confirmar que o Buck está na Linha 15 (não deveria estar energizado durante a partida do motor de arranque, que ocorre com a chave em posição "start" — a maioria dos veículos mantém a Linha 15 ativa apenas em "ligado", cortando em "partida"; se o modelo do veículo mantém energizado durante o arranque, considerar capacitor de holdup maior (470-1000µF) na entrada do Buck |

### D.5.1 Interpretação Rápida do LED de Status

| Cor | Significado |
|---|---|
| Vermelho fixo | Bomba bloqueada (estado normal em repouso ou após expiração) |
| Verde fixo | Bomba liberada, dentro da janela de tolerância |
| Apagado | Sem alimentação (verificar F1, conexão pós-chave) |

### D.5.2 Códigos de Log Serial (referência para suporte técnico)

| Log | Significado |
|---|---|
| `[BOOT] AVISO CRITICO: DS3231 nao encontrado` | Falha de hardware no RTC — sistema permanece bloqueado até reparo |
| `[RTC] AVISO: DS3231 perdeu energia` | Bateria CR2032 fraca ou primeira energização — aguardando sync BLE |
| `[LOCK] Bloqueando (fail-safe): ...` | Bloqueio automático — inclui o motivo (expiração, falta de hora confiável, etc.) |
| `[AUTH] Payload malformado, ignorado` | App enviou payload fora do formato esperado — verificar versão do app |
| `[BLE] Cliente conectado/desconectado` | Rastreamento de sessão BLE — útil para diagnosticar quedas de conexão |
