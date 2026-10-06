# Seção A.8 — Multi-empresa (tenants), login e administração da plataforma

Uma plataforma, várias empresas clientes. Cada empresa só enxerga os próprios veículos, motoristas, logs e posições (RLS por `tenant_id` no Supabase); a ACN Sinal Verde administra a plataforma como **superadmin**.

## Papéis (painel)

| Papel | Escopo |
|---|---|
| `superadmin` (ACN) | Plataforma: empresas, solicitações de acesso, patrocinadores. Troca a "empresa ativa" no seletor do cabeçalho para ver/gerir os dados dela. |
| `admin` (empresa) | Tudo da própria empresa: veículos, condutores (acesso ao app), autorizações, parâmetros, usuários do painel. |
| `operator` (empresa) | Operação do dia a dia (sem Parâmetros/Usuários). |

## Solicitação e criação de acesso

1. Na tela de login do painel: **Solicitar acesso** (empresa, contato, e-mail, telefone) → grava em `tenant_requests`.
2. Superadmin → aba **Plataforma** → *Aprovar*: a função `approve-tenant-request` cria a empresa (código curto = `slug`) e o primeiro administrador, com **senha provisória** (exibida uma vez; troca obrigatória no 1º login). *Recusar* só marca a solicitação.
3. O administrador da empresa cadastra veículos, condutores e **acesso ao app** de cada condutor (e-mail + senha) em Condutores → *Definir acesso*.

## Login no app do motorista

- **1º acesso**: nome (ou código) da empresa + e-mail + senha. A empresa fica lembrada no celular.
- **Demais acessos**: só e-mail e senha ("Trocar" muda de empresa).
- Senha conferida no servidor (`driver_login`), 5 erros bloqueiam 15 min; sessão salva e liberação offline depois do 1º login. Os parâmetros da empresa e os vínculos de parceiro são baixados no login e ficam em cache.

## Parâmetros por empresa (painel → Parâmetros)

Opções de tempo de uso (horas), tempo padrão, emergência (padrão e máximo), exigir KM final ao desvincular, permitir motorista parceiro. Lidos pelo app ao entrar.

## Regras de operação

- **Exclusividade**: enquanto um motorista está vinculado e com saldo, ninguém mais libera o veículo (firmware recusa). Exceção: o **motorista parceiro** dele opera ligar/desligar em nome do titular.
- **Desvincular**: o titular encerra e libera o carro; o saldo que sobrou vira **crédito** do motorista (usado numa próxima liberação). Esqueceu/perdeu o celular: admin usa o PIN do veículo (app → engrenagem → *Liberar veículo*) ou o botão de emergência.
- Anúncios dos apoiadores são **globais da ACN** (cadastrados só pelo superadmin) e aparecem empilhados no topo do app e do painel.

## Segurança — limites conhecidos

O canal BLE com o ESP32 não é autenticado criptograficamente (já era assim): a exclusividade e o parceiro são verificados pelo app e pelo firmware, mas quem controla o protocolo BLE por conta própria consegue contorná-los. A auditoria (logs, fim de viagem, snapshots) permanece no servidor. O rastreador (SIM7600) ainda grava posições sem `tenant_id`: o servidor o completa pelo `vehicle_id`, que por isso precisa ser **único na plataforma** enquanto o firmware do rastreador não enviar o `TENANT_ID`.
