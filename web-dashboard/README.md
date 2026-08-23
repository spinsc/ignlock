# IGNLOCK — Painel da Frota

Dashboard React + TypeScript + Vite para gestão de veículos, condutores e
consulta dos logs de viagem sincronizados pelo app do motorista. Conecta
diretamente ao projeto Supabase `ignlock` (mesmo backend usado pelo app
Flutter — ver `../mobile_app`).

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # já vem com URL e chave publicável do projeto
npm run dev
```

Abra http://localhost:5173 (ou a porta que o Vite indicar).

## Login

Contas de admin são criadas diretamente no banco (Authentication → Users no
Supabase Studio, ou via SQL). A primeira conta já está criada:

- **E-mail:** spinelli.sc@gmail.com
- **Senha inicial:** `123456` (o painel obriga a troca no primeiro login —
  tela "Defina sua senha")

Para criar novos admins, adicione o usuário em Authentication → Users no
[Supabase Studio](https://supabase.com/dashboard/project/proidvvzhzegvlohmguf)
e, se quiser forçar troca de senha no primeiro acesso, defina
`user_metadata.must_change_password = true` ao criar o usuário.

## Arquitetura de dados e segurança

O schema (`vehicles`, `drivers`, `trip_logs`) e as políticas de RLS estão
documentados na migração `initial_ignlock_schema` do projeto Supabase.
Resumo do modelo de permissões:

| Tabela | App do motorista (chave anônima) | Painel web (usuário autenticado) |
|---|---|---|
| `vehicles` | sem acesso | leitura + escrita total |
| `drivers` | sem acesso | leitura + escrita total |
| `trip_logs` | **somente INSERT** (nunca lê) | leitura (somente leitura) |

**Importante:** por causa dessa política, qualquer código que insira em
`trip_logs` usando a chave anônima **não pode** encadear `.select()` — pedir
o registro de volta exige uma permissão de leitura que o app não tem, e a
chamada falha com erro de RLS mesmo o insert sendo aceito. Foi exatamente
esse comportamento que validamos ao testar a integração (ver
`mobile_app/lib/services/sync_service.dart`).

`trip_logs.vehicle_id` e `trip_logs.driver_code` são chaves estrangeiras
para `vehicles`/`drivers` — um log só sincroniza com sucesso se o veículo e
o condutor já estiverem cadastrados aqui no painel (aba **Veículos** /
**Condutores**). Isso implementa a recomendação de segurança do projeto:
o firmware não valida o condutor, então a validação acontece no backend.

## Build e deploy

```bash
npm run build   # gera dist/
```

Pensado para deploy no Vercel (import do repositório Git — configura
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` como variáveis de ambiente
do projeto, com os mesmos valores de `.env.example`) ou qualquer hospedagem
de site estático.
