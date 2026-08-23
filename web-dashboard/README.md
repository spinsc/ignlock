# IGNLOCK — Painel da Frota

Dashboard React + TypeScript + Vite para gestão de veículos, condutores,
usuários do painel e consulta dos logs de viagem sincronizados pelo app do
motorista. Conecta diretamente ao projeto Supabase `ignlock` (mesmo backend
usado pelo app Flutter — ver `../mobile_app`). **No ar em:**
https://spinsc.github.io/ignlock/

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # já vem com URL e chave publicável do projeto
npm run dev
```

Abra http://localhost:5173 (ou a porta que o Vite indicar).

## Login e perfis de acesso

Existem dois perfis (`profiles.role`):

- **admin** — gestão completa, incluindo a aba **Usuários** (criar contas
  de acesso ao painel e mudar o perfil de qualquer usuário).
- **operator** — tudo exceto a aba Usuários (não vê nem gerencia contas).

A primeira conta (admin) já está criada — e-mail `spinelli.sc@gmail.com`,
com a senha que você definiu no primeiro acesso.

### Criando novos usuários

Só quem já é **admin** vê a aba **Usuários**. Lá, "+ Novo usuário" pede
e-mail, nome (opcional) e perfil, gera uma senha temporária (mostrada uma
única vez — anote antes de fechar) e cria a conta pela Edge Function
`admin-create-user`. A nova conta é obrigada a trocar a senha no primeiro
login (mesmo mecanismo do primeiro admin).

> A Edge Function existe justamente para isso não precisar da chave de
> serviço (service_role) no navegador: ela roda no servidor, confirma que
> quem está chamando é admin (via RLS/`profiles`), e só então usa a
> `service_role` internamente para criar a conta. Ver
> `supabase/functions/admin-create-user` no projeto Supabase (gerenciado
> via MCP, não versionado neste repo).

## Importar/exportar CSV (veículos e condutores)

Nas abas **Veículos** e **Condutores**, os botões **Exportar CSV** e
**Importar CSV**:

- **Exportar** baixa a lista atual (`veiculos.csv` / `condutores.csv`).
- **Importar** lê um CSV com cabeçalho `vehicle_id,ble_mac,plate,model` (ou
  `driver_code,full_name`) e faz *upsert* — linhas com `vehicle_id`/
  `driver_code` já existentes são atualizadas, as novas são criadas. Linhas
  com campos obrigatórios vazios ou MAC em formato inválido são ignoradas
  e reportadas no resumo da importação.

## Gravação de tags NFC

Na aba **Veículos**, o botão **Gravar NFC** de cada linha grava a tag do
painel do veículo (formato `VEHICLE_ID;BLE_MAC`, igual ao documentado em
`docs/04-manual.md`, Seção D.2) diretamente do navegador, via
[Web NFC](https://developer.mozilla.org/en-US/docs/Web/API/Web_NFC_API).

**Isso só funciona no Chrome para Android** (é a única combinação que
implementa Web NFC até hoje) — abra o painel no celular do administrador
para gravar. Em qualquer outro navegador (desktop, iOS, Firefox), o botão
mostra o texto exato para gravar manualmente com um app como **NFC Tools**.

## Arquitetura de dados e segurança

O schema (`vehicles`, `drivers`, `trip_logs`, `profiles`) e as políticas de
RLS estão documentados nas migrações `initial_ignlock_schema` e
`add_profiles_and_roles` do projeto Supabase. Resumo do modelo de
permissões:

| Tabela | App do motorista (chave anônima) | Painel web (autenticado) |
|---|---|---|
| `vehicles` | sem acesso | leitura + escrita total |
| `drivers` | sem acesso | leitura + escrita total |
| `trip_logs` | **somente INSERT** (nunca lê) | leitura (somente leitura) |
| `profiles` | sem acesso | leitura (todos); escrita só para `role=admin` |

**Importante:** por causa dessa política, qualquer código que insira em
`trip_logs` usando a chave anônima **não pode** encadear `.select()` — pedir
o registro de volta exige uma permissão de leitura que o app não tem, e a
chamada falha com erro de RLS mesmo o insert sendo aceito. Foi exatamente
esse comportamento que validamos ao testar a integração (ver
`mobile_app/lib/services/sync_service.dart`).

`trip_logs.vehicle_id` e `trip_logs.driver_code` são chaves estrangeiras
para `vehicles`/`drivers` — um log só sincroniza com sucesso se o veículo e
o condutor já estiverem cadastrados aqui no painel. Isso implementa a
recomendação de segurança do projeto: o firmware não valida o condutor,
então a validação acontece no backend.

## Build e deploy

```bash
npm run build   # gera dist/
```

O deploy é automático: todo push em `web-dashboard/**` (branch `master`)
dispara `.github/workflows/deploy-dashboard.yml`, que builda e publica no
GitHub Pages em https://spinsc.github.io/ignlock/. As variáveis
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` ficam em Settings → Secrets
and variables → Actions → Variables do repositório.
