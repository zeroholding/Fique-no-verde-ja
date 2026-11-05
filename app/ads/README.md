# FNVJ Ads — Fonte de verdade do módulo

> **Documento vivo e obrigatório.** Toda mudança em rota, tela, coluna, fórmula, banco, permissão ou procedimento do módulo Ads deve atualizar este arquivo na mesma alteração.
>
> **Última atualização:** 05/11/2026  
> **Estado:** Etapa 5 — modo manual removido; a única entrada de dados é a Meta Marketing API. Conta única, painel detalhado e imagem dos anúncios.  
> **Rota:** `/ads` (tela única)

## 1. Do que se trata

O FNVJ Ads é a central de resultados do tráfego pago do Fique no Verde Já. Os números entram **exclusivamente** pela Meta Marketing API: `POST /api/ads/sync` busca os insights diários da conta de anúncios e atualiza o painel.

Não existe mais envio de arquivo. O upload de CSV/XLSX, o histórico de envios e a tela de relatórios foram removidos na Etapa 5 — o gestor de tráfego não precisa exportar nada do Gerenciador de Anúncios.

O módulo usa o mesmo login, cookie JWT, tabela `users` e PostgreSQL do FNVJ/Tracken. Não existe segundo cadastro.

A conta de anúncios é **única**: não há seletor de conta. O `META_AD_ACCOUNT_ID` define de qual conta vêm os dados.

Regra de linguagem: nada de termo técnico na tela. Sem “vinculado”, “competência”, “payload” e semelhantes. Siglas do mercado de anúncios (CPC, CTR, CPM, CPL, ROAS) aparecem sempre junto do nome por extenso.

Regra de design: interface no padrão SaaS moderno (Linear/Vercel/Stripe), tipografia **Montserrat** (carregada via Google Fonts `<link>`), ícones estritamente em **SVG** (`lucide-react`) e **absolutamente nenhum emoji** no código ou na interface.

## 2. Estado implementado

### Etapa 1 — fundação (29/09/2026)

- rota autenticada `/ads` com a sessão do FNVJ.

### Etapa 2 — painel (13/10/2026)

- Painel: período (atalhos e datas livres), indicadores com comparação com o período anterior, evolução por dia (uma métrica por vez) e tabela de desempenho por campanha, conjunto ou anúncio, com busca e ordenação;
- estado vazio, carregamento, erro com “Tentar de novo” e aviso de dias sem sincronização.

### Etapa 3 — exportação e redesign (03/11/2026)

- Exportação CSV do ranking e da evolução diária, com ponto e vírgula e BOM UTF-8 (abre no Excel em português);
- tipografia Montserrat, ícones SVG, cards com variação, breadcrumbs no ranking.

### Etapa 4 — sincronização automática (03/11/2026)

- Cliente da Graph API (`lib/ads/meta-api.ts`), paginação por cursores, nível de anúncio com `time_increment=1`;
- rotas `POST /api/ads/sync` e `GET /api/ads/sync`;
- botão **Sincronizar Meta Ads** no painel.

### Etapa 5 — só automático, conta única e detalhe (05/11/2026)

- **Modo manual removido:** saíram o envio de CSV/XLSX, o leitor de planilhas, a pré-visualização, o histórico de envios e a tela `/ads/relatorios`;
- **Conta única:** saiu o filtro por conta do painel e da API;
- **Cobertura corrigida:** a sincronização cobre o **período pedido**, não só os dias que vieram com veiculação. Sincronizar 30 dias de uma campanha parada mostra zero, não “dia sem sincronização”;
- **Sincronizar período sem veiculação** passou a ser resultado válido (grava cobertura e informa);
- **Imagem dos anúncios:** nova tabela `ads_creatives`, preenchida em uma segunda chamada à Meta, best-effort;
- **Painel detalhado:** até 12 indicadores, resumo de campanhas/conjuntos/anúncios, miniatura do criativo no ranking e painel de detalhes por linha;
- **Botão Meta** com a marca, no cabeçalho e no estado vazio.

### Ainda não implementado / pendente

- filtros por objetivo, status e janela de atribuição;
- sincronização agendada (cron/webhook) para rodar de madrugada sem clique.

## 3. Decisões vigentes

1. A URL pública interna é `/ads`, separada de `/tracken/ads`. O Ads não aparece no menu do Tracken.
2. A autenticação é a sessão FNVJ (`token` HttpOnly). O layout valida o JWT e confere o usuário no banco (ativo ou não). Cada API autentica sozinha, porque o middleware só olha se o cookie existe.
3. Visual no padrão SaaS limpo: Montserrat, fundo neutro, cartões brancos, badges em verde/vermelho apenas para variação, ícones exclusivamente em SVG, sem emojis.
4. **Fonte única de dados: a Meta Marketing API.** Nada de leitura de planilha. A sincronização roda no servidor, por demanda.
5. **A resposta da API é lida no servidor.** Não fica no disco: ficam as linhas interpretadas em `ads_daily` e o hash SHA-256 do lote em `ads_imports`.
6. **A sincronização mais nova vale para o período que ela cobre** (seção 5).
7. Métrica calculada só usa linhas em que as duas pontas existem (seção 6). Divisão por zero vira “—”, nunca zero ou infinito.
8. Alcance diário nunca é somado em alcance do período: aparece como **Alcance médio por dia**.
9. Não existe empresa/tenant no banco atual: os dados são globais, vistos por todo usuário ativo.
10. **A imagem do anúncio é best-effort.** Se a Meta não devolver o criativo, a sincronização continua e a linha aparece sem foto. Imagem nunca bloqueia número.

## 4. Contrato da Meta

Dados no nível **Anúncio**, com detalhamento **diário**, uma moeda e uma configuração de atribuição.

| Campo da Graph API | Vira |
| --- | --- |
| `date_start` | `day` |
| `account_id` / `account_name` | `account_id` / `account_name` |
| `campaign_id` / `campaign_name` | `campaign_id` / `campaign_name` |
| `adset_id` / `adset_name` | `adset_id` / `adset_name` |
| `ad_id` / `ad_name` | `ad_id` / `ad_name` |
| `spend` | `spend` |
| `impressions` / `reach` | `impressions` / `reach` |
| `clicks` | `all_clicks` |
| `inline_link_clicks` | `link_clicks` |
| `actions` | `conversations`, `leads`, `purchases`, `landing_page_views`, `result_type` |
| `action_values` | `purchase_value` |

Variáveis de ambiente (Coolify):

- `META_ACCESS_TOKEN` — token do sistema, escopo `ads_read`;
- `META_AD_ACCOUNT_ID` — só os números, sem `act_`;
- `META_API_VERSION` — opcional, padrão `v21.0`.

`GET /api/ads/sync` devolve `{ isConfigured, adAccountId, apiVersion, missing }`.

## 5. Regra de substituição

A sincronização mais nova vale para o intervalo **pedido** (do `since` ao `until`):

- saem as linhas daquela conta no intervalo;
- linhas fora do intervalo não mudam;
- a gravação é uma transação, com trava no banco (`pg_advisory_xact_lock`).

**Cobertura.** A tabela `ads_coverage` guarda os dias que cada lote cobre. Dia coberto sem linha é dia sem veiculação (vale zero no gráfico). Dia fora da cobertura é dia **sem sincronização**: o gráfico deixa lacuna e o painel avisa.

## 6. Métricas e fórmulas

Valores brutos (soma): investimento, impressões, alcance, cliques no link, cliques (todos), resultados, visualizações da página de destino, conversas iniciadas, leads, compras, valor das compras.

| Indicador | Fórmula | Só aparece se os dois existirem |
| --- | --- | --- |
| CTR (taxa de cliques) | cliques no link ÷ impressões × 100 | cliques no link e impressões |
| CPC (custo por clique) | investimento ÷ cliques no link | investimento e cliques no link |
| CPM (custo por mil impressões) | investimento ÷ impressões × 1.000 | investimento e impressões |
| Custo por resultado | investimento ÷ resultados | investimento e resultados |
| Custo por conversa | investimento ÷ conversas iniciadas | investimento e conversas |
| CPL (custo por lead) | investimento ÷ leads | investimento e leads |
| Custo por compra | investimento ÷ compras | investimento e compras |
| ROAS | valor das compras ÷ investimento | valor das compras e investimento |
| Alcance médio por dia | soma do alcance diário ÷ dias com alcance | alcance |

## 7. Modelo de dados

Criado por `database/migrations/027_create_ads_reports.sql`, `030_ads_creatives.sql` **e** por `lib/ads/schema.ts` (mesmo SQL, idempotente).

- **`ads_imports`**: um registro por sincronização (`file_format = 'api'`).
- **`ads_daily`**: uma linha por anúncio por dia.
- **`ads_coverage`**: dias que cada sincronização cobre.
- **`ads_creatives`**: uma linha por anúncio, com miniatura e imagem.

## 8. Permissões

- **Ver** o painel: qualquer usuário autenticado e ativo.
- **Sincronizar**: só administrador (`users.is_admin`).

## 9. APIs

Todas autenticam pelo cookie `token` (ou `Authorization: Bearer`).

| Método e rota | Quem | O que faz |
| --- | --- | --- |
| `GET /api/ads/dashboard?from=&to=` | usuário | Números do painel do período. |
| `POST /api/ads/sync` | admin | Busca na Meta e grava. Corpo opcional `{since, until}`. |
| `GET /api/ads/sync` | usuário | Estado da configuração da Meta no ambiente. |

## 10. Arquivos do módulo

**Telas** (`app/ads/`)
- `layout.tsx` — valida sessão, injeta Montserrat;
- `ads-shell.tsx` — barra superior com marca, selo Meta e saída;
- `page.tsx` + `ads-dashboard.tsx` — painel com período, indicadores, gráfico, ranking e sincronização;
- `_components/` — `ui.tsx`, `kpi-cards.tsx`, `daily-chart.tsx`, `ranking-table.tsx`, `period-picker.tsx`, `meta-button.tsx`.

**Regras de negócio** (`lib/ads/`)
- `meta-api.ts` — cliente da Graph API, parser de insights e busca das imagens;
- `store.ts` — consultas, substituição por período, gravação transacional e criativos;
- `report.ts` — contratos da coleta;
- `export.ts` — CSV com ponto e vírgula e BOM UTF-8;
- `db.ts`, `schema.ts`, `metrics.ts`, `dates.ts`, `format.ts`, `client.ts`, `types.ts`.

## 11. Changelog

### 05/11/2026 — só automático, conta única e detalhe
- Removido o modo manual: envio de arquivo, leitor de planilha, pré-visualização, histórico de envios e a rota `/ads/relatorios`;
- Removido o filtro por conta: a conta de anúncios é única;
- Cobertura passa a usar o período pedido na sincronização, não o período com dados;
- Período sem veiculação deixa de ser erro e passa a ser cobertura registrada;
- Criada a tabela `ads_creatives` e a busca best-effort da imagem de cada anúncio;
- Painel com até 12 indicadores, resumo de entidades, miniatura no ranking e painel de detalhes;
- Botão de sincronização com a marca da Meta.

### 03/11/2026 — sincronização automática via Meta Marketing API
- Cliente `lib/ads/meta-api.ts`, rota `POST /api/ads/sync` e botão no painel.

### 03/11/2026 — filtro de contas, exportação CSV e redesign
- Filtro por conta (removido na Etapa 5), exportação CSV e redesenho com Montserrat.
