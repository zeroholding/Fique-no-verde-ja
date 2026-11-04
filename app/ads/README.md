# FNVJ Ads — Fonte de verdade do módulo

> **Documento vivo e obrigatório.** Toda mudança em rota, tela, importação, coluna, fórmula, banco, permissão ou procedimento do módulo Ads deve atualizar este arquivo na mesma alteração.
>
> **Última atualização:** 03/11/2026  
> **Estado:** Etapa 4 implementada — integração automática com Meta Marketing API, filtro por conta, exportação CSV e redesign SaaS com Montserrat  
> **Rotas:** `/ads` (Painel) e `/ads/relatorios` (Relatórios)

## 1. Do que se trata

O FNVJ Ads é a central de resultados do tráfego pago do Fique no Verde Já. Ele opera em dois modos complementares:
1. **Integração Automática via Meta Marketing API (`/api/ads/sync`):** busca os insights diários diretamente da conta de anúncios da Meta via token permanente do sistema (`META_ACCESS_TOKEN`), atualizando métricas de campanhas, conjuntos e anúncios com um clique.
2. **Envio manual de relatórios:** caso prefira, o responsável pelo tráfego pode exportar o relatório do Gerenciador de Anúncios da Meta (CSV ou Excel) e enviá-lo em **Relatórios**.

O módulo usa o mesmo login, cookie JWT, tabela `users` e PostgreSQL do FNVJ/Tracken. Não existe segundo cadastro.

Regra de linguagem: nada de termo técnico na tela. Sem “vinculado”, “competência”, “payload” e semelhantes. Siglas do mercado de anúncios (CPC, CTR, CPM, CPL, ROAS) aparecem sempre junto do nome por extenso.

Regra de design: interface no padrão SaaS moderno (Linear/Vercel/Stripe), tipografia **Montserrat** (carregada via Google Fonts `<link>`), ícones estritamente em **SVG** (`lucide-react`) e **absolutamente nenhum emoji** no código ou na interface.

## 2. Estado implementado

### Etapa 1 — fundação (29/09/2026)

- rota autenticada `/ads` com a sessão do FNVJ;
- pré-validação de CSV só no navegador (substituída na Etapa 2).

### Etapa 2 — relatórios e painel (13/10/2026)

- cabeçalho com a marca e duas abas: **Painel** e **Relatórios** (sem menu lateral);
- Painel: período (atalhos e datas livres), indicadores com comparação com o período anterior, evolução por dia (uma métrica por vez) e tabela de desempenho por campanha, conjunto ou anúncio, com busca e ordenação;
- Relatórios: histórico de envios para todos; para administradores, também envio, exclusão e o passo a passo da exportação;
- envio em duas etapas: o arquivo é conferido e a tela mostra o que muda no painel antes de salvar;
- estado vazio, carregamento, erro com “Tentar de novo” e aviso de dias sem relatório.

### Etapa 3 — filtro de contas, exportação CSV e redesign SaaS (03/11/2026)

- **Filtro por conta de anúncios:** seletor dropdown no painel que permite filtrar métricas consolidadas, série diária e ranking por uma conta específica ou "Todas as contas";
- **Exportação CSV:** geração de arquivos CSV formatados com separador ponto e vírgula e cabeçalho UTF-8 BOM (`\uFEFF`) compatível direto com Microsoft Excel em português:
  - Exportação do ranking de campanhas, conjuntos ou anúncios com investimento, impressões, cliques, resultados e taxas;
  - Exportação da evolução diária das métricas selecionadas do período;
- **Tipografia e Design System:**
  - Tipografia **Montserrat** integrada no layout via Google Fonts `<link>` com fallbacks seguros;
  - Ícones em SVG nativos (`lucide-react`) em todas as telas, cards, botões, modais e avisos;
  - Cards de KPIs com visual refinado, badges com percentual de variação e microinterações de seleção;
  - Breadcrumbs de navegação hierárquica no ranking (Campanha › Conjunto › Anúncio);
  - Barra de proporção de investimento e modais acessíveis com backdrop blur.

### Etapa 4 — sincronização automática via Meta Marketing API (03/11/2026)

- **Cliente oficial da Graph API (`lib/ads/meta-api.ts`):**
  - Conexão direta com `https://graph.facebook.com/${META_API_VERSION}/act_${META_AD_ACCOUNT_ID}/insights`;
  - Paginação automática por cursores da Meta;
  - Extração de métricas de nível de anúncio por dia (`level=ad`, `time_increment=1`);
  - Mapeamento de ações de conversão da Meta (`leads`, `purchases`, `messaging_conversations`, `landing_page_views`);
  - Gravação transacional com a mesma regra de substituição de períodos de relatórios (`ads_daily` e `ads_coverage`);
- **Rotas e Botão de Sincronização:**
  - `POST /api/ads/sync` para acionar a sincronização sob demanda;
  - `GET /api/ads/sync` para checar se as variáveis de ambiente da Meta estão configuradas;
  - Botão **"Sincronizar Meta Ads"** presente tanto no Painel quanto na aba de Relatórios.

**Arquivos aceitos (modo manual)**

- CSV (vírgula, ponto e vírgula ou tabulação; UTF-8, UTF-16 ou Windows-1252);
- Excel `.xlsx`, lido no servidor sem biblioteca externa (ver decisão 4);
- recusados com mensagem clara: `.xls` antigo, planilha com senha, `.zip`, arquivo acima dos limites.

**Limites:** 5 MB, 50.000 linhas de dados, 200 colunas, 10.000 caracteres por célula. Para `.xlsx`, cada parte descompactada pode ter até 48 MB e o conjunto até 80 MB (proteção contra arquivo-bomba).

### Ainda não implementado / pendente

- objetivo, status e janela de atribuição como filtros adicionais;
- agendamento cron automático (webhook / job) para sincronizar de madrugada sem precisar clicar no botão.

## 3. Decisões vigentes

1. A URL pública interna é `/ads`, separada de `/tracken/ads`. O Ads não aparece no menu do Tracken.
2. A autenticação é a sessão FNVJ (`token` HttpOnly). O layout valida o JWT e confere o usuário no banco (ativo ou não). Cada API autentica sozinha, porque o middleware só olha se o cookie existe.
3. Visual no padrão SaaS limpo e profissional: tipografia Montserrat, fundo neutro, cartões brancos com sombras sutis, badges em verde/vermelho apenas para métricas de variação positiva/negativa, ícones exclusivamente em SVG (`lucide-react`), sem emojis decorativos.
4. **Excel sem biblioteca.** O leitor de `.xlsx` usa `node:zlib` (`lib/ads/report-file.ts`). Descartados: `xlsx@0.18.5` (vulnerabilidades conhecidas sem correção no npm), `exceljs` (dependências pesadas) e pacote fora do npm. CSV continua sendo o formato recomendado.
5. **O arquivo ou resposta da API é lido no servidor.** O envio manual vai em multipart para `/api/ads/imports`; a sincronização automática vai via `POST /api/ads/sync`. O payload não fica no disco: ficam o nome, o tamanho, o hash SHA-256 e as linhas interpretadas em `ads_daily`.
6. **O envio/sincronização mais novo vale para os dias que ele cobre** (seção 6). Substitui a regra antiga de “persistência desabilitada”.
7. Métrica calculada só usa linhas em que as duas pontas existem (seção 7). Divisão por zero vira “—”, nunca zero ou infinito.
8. Alcance diário nunca é somado em alcance do período: aparece como **Alcance médio por dia**.
9. O relatório precisa estar **separado por dia** (Detalhamento › Por tempo › Dia ou `time_increment=1` na API).
10. Não existe empresa/tenant no banco atual: os dados são globais, vistos por todo usuário ativo.

## 4. Contrato de relatório e API

### 4.1 Formato confirmado em arquivo real e Marketing API

Dados no nível **Anúncio**, com detalhamento **diário**, uma moeda e uma configuração de atribuição.

Campos confirmados:
1. `Nome da conta` / `account_name`
2. `Dia` / `date_start`
3. `Nome do anúncio` / `ad_name`
4. `Alcance` / `reach`
5. `Impressões` / `impressions`
6. `Frequência` (recalculada)
7. `Moeda` / `currency`
8. `Valor gasto` / `spend`
9. `Cliques no link` / `inline_link_clicks`
10. `Cliques (todos)` / `clicks`
11. `Ações` / `actions` (leads, compras, conversas, visualizações)

## 5. Como exportar do Meta (passo a passo do modo manual)

1. No Gerenciador de Anúncios, aba **Anúncios**, escolha o período (canto direito).
2. Clique em **Detalhamento**, ao lado de “Colunas”, e escolha **Por tempo › Dia**. Sem isso o Meta exporta **um total único do período** (uma linha por anúncio) e o painel recusa o arquivo.
3. Em **Colunas**, **Desempenho e cliques** traz o que o painel usa. Só **Desempenho** também funciona, mas sem cliques no link. Para ver campanhas e conjuntos, o arquivo precisa ter **Nome da campanha** e **Nome do conjunto de anúncios**.
4. Abra o menu do ícone de download (a setinha ao lado dele) e escolha **Exportar como .csv** ou **Exportar como .xlsx**.
5. Enviar em **Relatórios › Enviar relatório**.

## 6. Regra de substituição

O envio ou sincronização mais novo vale para o intervalo de dias que ele cobre (do primeiro ao último dia sincronizado):

- se o lote identifica a conta, saem do intervalo as linhas dessa conta (por ID ou nome) e as sem conta;
- se o lote não identifica conta, saem todas as linhas do intervalo;
- linhas fora do intervalo ou de outras contas não mudam;
- a tela mostra antes de salvar o que já existe no intervalo e os totais antes e depois (no envio manual);
- sincronizar ou reenviar mantém a integridade;
- salvar e excluir são serializados por trava no banco (`pg_advisory_xact_lock`) e a gravação é uma transação.

**Cobertura.** A tabela `ads_coverage` guarda os dias que cada envio/sync ainda cobre. Dia coberto sem linha é dia sem veiculação (vale zero no gráfico). Dia fora da cobertura é dia **sem relatório**: o gráfico deixa lacuna e o painel avisa.

**Histórico.** Cada registro aparece como **Em uso**, **Em uso em parte** ou **Substituído**.

## 7. Métricas e fórmulas

Valores brutos (soma): investimento, impressões, alcance, cliques no link, cliques (todos), resultados, visualizações da página de destino, conversas iniciadas, leads, compras, valor das compras.

| Indicador | Fórmula | Só aparece se o arquivo/API trouxe |
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

## 8. Modelo de dados

Criado por `database/migrations/027_create_ads_reports.sql` **e** por `lib/ads/schema.ts` (mesmo SQL, idempotente).

- **`ads_imports`**: um registro por arquivo ou sincronização API (`file_format`: `'csv'`, `'xlsx'` ou `'api'`).
- **`ads_daily`**: uma linha por anúncio por dia.
- **`ads_coverage`**: dias que cada import/sync cobre.

## 9. Permissões

- **Ver** painel e histórico: qualquer usuário autenticado e ativo.
- **Sincronizar via API, enviar e excluir** relatório: só administrador (`users.is_admin`).

## 10. APIs

Todas autenticam pelo cookie `token` (ou `Authorization: Bearer`).

| Método e rota | Quem | O que faz |
| --- | --- | --- |
| `GET /api/ads/dashboard?from=&to=&account=` | usuário | Números do painel do período com filtro opcional por conta. |
| `GET /api/ads/imports` | usuário | Histórico de envios e sincronizações. |
| `POST /api/ads/sync` | admin | Executa a sincronização direta via Meta Marketing API. |
| `GET /api/ads/sync` | usuário | Retorna status da configuração da Meta API no ambiente. |
| `POST /api/ads/imports` | admin | Multipart, campo `file`. Confere e grava (201). |
| `POST /api/ads/imports?preview=1` | admin | Confere e devolve o resumo, sem gravar. |
| `DELETE /api/ads/imports/:id` | admin | Exclui o envio e as linhas dele ainda em uso. |

## 11. Arquivos do módulo

**Telas** (`app/ads/`)
- `layout.tsx` — valida sessão, injeta Google Fonts Montserrat;
- `ads-shell.tsx` — topbar de navegação, abas Painel/Relatórios;
- `page.tsx` + `ads-dashboard.tsx` — Painel interativo com seletor de contas, botão de sincronização e exportação;
- `relatorios/page.tsx` + `reports-manager.tsx` — histórico unificado (API + arquivos), botão de sincronização e upload;
- `_components/` — `ui.tsx`, `kpi-cards.tsx`, `daily-chart.tsx`, `ranking-table.tsx`, `period-picker.tsx`.

**Regras de negócio** (`lib/ads/`)
- `meta-api.ts` — cliente da Meta Marketing API (Graph API) e parser de insights diários;
- `store.ts` — consultas, substituição por período e persistência transacional;
- `export.ts` — gerador CSV com separador ponto e vírgula e BOM UTF-8;
- `db.ts`, `schema.ts`, `metrics.ts`, `dates.ts`, `format.ts`, `client.ts`, `types.ts`.

## 12. Changelog

### 03/11/2026 — Sincronização automática via Meta Marketing API
- Implementado cliente `lib/ads/meta-api.ts` para buscar métricas diárias diretamente da Graph API da Meta (`META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_API_VERSION`);
- Criada rota `POST /api/ads/sync` e `GET /api/ads/sync` com autenticação de administrador;
- Adicionado botão "Sincronizar Meta Ads" no painel e na tela de relatórios;
- Suporte a registros de origem `'api'` no histórico e no store.

### 03/11/2026 — Filtro de contas, exportação CSV e redesign SaaS com Montserrat
- Adicionado filtro por conta de anúncios no painel e na API;
- Implementada exportação CSV para Excel no ranking e na evolução diária;
- Redesenho completo de UI com tipografia Montserrat e 100% de ícones em SVG.
