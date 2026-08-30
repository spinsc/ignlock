# Seção A.6 — Área de Patrocinadores

Anúncios pagos de fornecedores relevantes para os usuários da frota — o
caso de uso original é a LEDFLEX (barras de LED, sinalização veicular,
grades) anunciando para usuários de segurança pública, mas o cadastro é
genérico para qualquer patrocinador.

## Onde aparece

- **Painel (admin)**: aba **Patrocinadores** (só para `role=admin`, mesma
  restrição da aba Usuários) — área dedicada de gestão: lista, cria,
  edita e remove anúncios.
- **App do motorista**: card discreto na **tela inicial** (antes de
  aproximar do veículo), nunca durante o fluxo de liberação em si
  (NFC/BLE/formulário/emergência) — segurança não compete por atenção com
  anúncio. Ver `mobile_app/lib/widgets/sponsor_ad_banner.dart`.

## Modelo de dados

```sql
sponsor_ads (
  id uuid,
  sponsor_name text,       -- ex: "LEDFLEX"
  headline text,            -- chamada opcional, ex: "Barras de LED para viaturas"
  image_url text,           -- criativo, do bucket de storage sponsor-ads
  link_url text,             -- para onde vai ao tocar/clicar (opcional)
  target_audience text,      -- rótulo livre, ex: "seguranca_publica"
  weight int,                 -- peso de rotação (maior = aparece mais)
  active boolean,
  starts_at timestamptz,      -- nulo = sem data de início
  ends_at timestamptz         -- nulo = sem data de término
)
```

Criativos ficam no bucket público `sponsor-ads` do Supabase Storage
(upload feito pelo painel, ao salvar o formulário do anúncio).

## RLS — a primeira leitura pública real do schema

Todo o resto do schema deste projeto restringe leitura ao painel
(`authenticated`) ou não permite leitura nenhuma pela chave anônima (ver
`web-dashboard/README.md`, seção "Arquitetura de dados e segurança").
`sponsor_ads` é diferente de propósito: o conteúdo é publicitário, não
sensível, e **precisa** ser lido pelo app sem login.

| Papel | Permissão |
|---|---|
| Painel (`authenticated`) | leitura + escrita total (inclusive anúncios inativos/agendados) |
| App do motorista (`anon`) | **leitura**, restrita a anúncios `active = true` e dentro do período vigente (`starts_at`/`ends_at`) — filtrado na própria política RLS, não no cliente |

## Rotação

O app busca todos os anúncios elegíveis (já filtrados pelo RLS) e sorteia
**um** para exibir, com probabilidade proporcional ao campo `weight` —
ver `mobile_app/lib/services/sponsor_ads_service.dart`. Um patrocinador
com peso 3 aparece, em média, 3x mais que um com peso 1. Sorteio novo a
cada vez que a tela inicial é montada (não fixo por sessão).

Se não houver nenhum anúncio elegível, ou se não houver conectividade no
momento, o app simplesmente não mostra nada — é conteúdo secundário, o
fluxo principal (liberação de partida, 100% offline-first) nunca depende
disso.

## Status de implementação

Painel testado de ponta a ponta contra o Supabase real (criar com upload
de imagem, editar sem reenviar imagem, excluir) — funcionando. Lado do
app (busca, sorteio por peso, card discreto, abrir link) revisado e
compilando limpo (`flutter analyze`), mas segue o mesmo status do resto
do app quanto a testes em dispositivo real.
