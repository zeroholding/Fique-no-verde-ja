# FNVJ Ads — Fonte de verdade do módulo

> **Documento vivo e obrigatório.** Toda mudança em rota, tela, importação, coluna, fórmula, banco, permissão ou procedimento do módulo Ads deve atualizar este arquivo na mesma alteração.
>
> **Última atualização:** 13/10/2026  
> **Estado:** Etapa 2 implementada — envio de relatório (CSV/Excel), histórico, banco e painel de resultados  
> **Rotas:** `/ads` (Painel) e `/ads/relatorios` (Relatórios)

## 1. Do que se trata

O FNVJ Ads é a central de resultados do tráfego pago do Fique no Verde Já. O responsável pelo tráfego exporta o relatório do Gerenciador de Anúncios da Meta (CSV ou Excel), envia em **Relatórios**, e a equipe acompanha os números no **Painel**.

Não existe integração automática com a Marketing API. Tudo vem de arquivo exportado à mão.

O módulo usa o mesmo login, cookie JWT, tabela `users` e PostgreSQL do FNVJ/Tracken. Não existe segundo cadastro.

Regra de linguagem: nada de termo técnico na tela. Sem “vinculado”, “competência”, “payload” e semelhantes. Siglas do mercado de anúncios (CPC, CTR, CPM, CPL, ROAS) aparecem sempre junto do nome por extenso.

## 2. Estado implementado

### Etapa 1 — fundação (29/09/2026)

- rota autenticada `/ads` com a sessão do FNVJ;
- pré-validação de CSV só no navegador (substituída na Etapa 2).

### Etapa 2 — relatórios e painel (13/10/2026)

**Telas**

- cabeçalho com a marca e duas abas: **Painel** e **Relatórios** (sem menu lateral);
- Painel: período (atalhos e datas livres), indicadores com comparação com o período anterior, evolução por dia (uma métrica por vez) e tabela de desempenho por campanha, conjunto ou anúncio, com busca e ordenação;
- Relatórios: histórico de envios para todos; para administradores, também envio, exclusão e o passo a passo da exportação;
- envio em duas etapas: o arquivo é conferido e a tela mostra o que muda no painel antes de salvar;
- estado vazio, carregamento, erro com “Tentar de novo” e aviso de dias sem relatório.

**Arquivos aceitos**

- CSV (vírgula, ponto e vírgula ou tabulação; UTF-8, UTF-16 ou Windows-1252);
- Excel `.xlsx`, lido no servidor sem biblioteca externa (ver decisão 4);
- recusados com mensagem clara: `.xls` antigo, planilha com senha, `.zip`, arquivo acima dos limites.

**Limites:** 5 MB, 50.000 linhas de dados, 200 colunas, 10.000 caracteres por célula. Para `.xlsx`, cada parte descompactada pode ter até 48 MB e o conjunto até 80 MB (proteção contra arquivo-bomba).

### Ainda não implementado / pendente

- integração automática com a Meta Marketing API;
- exportação do recorte do painel;
- objetivo, status e janela de atribuição como filtros;
- relatório real com campanha, conjunto, cliques e resultados para confirmar os apelidos dessas colunas (seção 4.2);
- filtro por conta quando houver mais de uma (hoje os números somam todas).

## 3. Decisões vigentes

1. A URL pública interna é `/ads`, separada de `/tracken/ads`. O Ads não aparece no menu do Tracken.
2. A autenticação é a sessão FNVJ (`token` HttpOnly). O layout valida o JWT e confere o usuário no banco (ativo ou não). Cada API autentica sozinha, porque o middleware só olha se o cookie existe.
3. Visual sóbrio de propósito: fundo cinza claro, cartões brancos com borda fina, um azul para ação e gráfico, verde/vermelho só para variação. Sem gradiente, selo decorativo, brilho ou texto de marketing.
4. **Excel sem biblioteca.** O leitor de `.xlsx` usa `node:zlib` (`lib/ads/report-file.ts`). Descartados: `xlsx@0.18.5` (vulnerabilidades conhecidas sem correção no npm), `exceljs` (dependências pesadas) e pacote fora do npm. CSV continua sendo o formato recomendado.
5. **O arquivo é lido no servidor.** O envio vai em multipart para `/api/ads/imports`; com `?preview=1` só confere e devolve o resumo, e na confirmação o mesmo arquivo vai de novo para gravar. O arquivo não é guardado: ficam o nome, o tamanho, o hash SHA-256 e as linhas interpretadas.
6. **O envio mais novo vale para os dias que ele cobre** (seção 6). Substitui a regra antiga de “persistência desabilitada”, que existia porque o primeiro relatório não tinha IDs e a chave nome do anúncio + dia duplicaria ao renomear um anúncio.
7. Métrica calculada só usa linhas em que as duas pontas existem (seção 7). Divisão por zero vira “—”, nunca zero ou infinito.
8. Alcance diário nunca é somado em alcance do período: aparece como **Alcance médio por dia**.
9. O relatório precisa estar **separado por dia** (Detalhamento › Por tempo › Dia) ou ter início igual ao fim em cada linha. Relatório com o total do período inteiro é recusado, e o aviso mostra o período que o arquivo trouxe e como exportar de novo. Não se distribui o total pelos dias: isso seria inventar número que o Meta não informou.
10. Não existe empresa/tenant no banco atual: os dados são globais, vistos por todo usuário ativo.

## 4. Contrato de relatório

### 4.1 Formato confirmado em arquivo real — 29/09/2026

Relatório no nível **Anúncio**, com detalhamento **diário**, uma moeda e uma configuração de atribuição. Nenhum valor, nome de anúncio ou ID real é registrado neste documento.

Cabeçalhos confirmados, na ordem do export:

1. `Nome da conta`;
2. `Dia`;
3. `Nome do anúncio`;
4. `Alcance`;
5. `Impressões`;
6. `Frequência` (não usada: o painel recalcula);
7. `Moeda`;
8. `Valor gasto (BRL)`;
9. `Configuração de atribuição` (não usada);
10. `Início dos relatórios`;
11. `Encerramento dos relatórios`.

Características confirmadas: CSV UTF-8 com BOM, separado por vírgula, textos com vírgula entre aspas, datas `YYYY-MM-DD`, decimais com ponto, início e encerramento iguais ao dia, dias sem veiculação sem linha.

Com esse arquivo o painel mostra investimento, impressões, CPM, alcance médio por dia e a evolução por anúncio. Não mostra cliques, CTR, CPC, custo por resultado nem ROAS, porque essas colunas não vieram.

### 4.2 Colunas reconhecidas

O cabeçalho é normalizado antes de comparar (sem acento, minúsculas, símbolos viram `_`). Reconhecer uma coluna **não** a confirma: só os 11 títulos da seção 4.1 foram vistos em arquivo real. Os demais são apelidos esperados em português e inglês e **precisam ser conferidos** quando chegar um relatório com campanha, conjunto, cliques e resultados.

| Dado | Títulos aceitos | Confirmado em arquivo real |
| --- | --- | --- |
| Dia | `Dia`, `Day`, `Data`, `Date` | sim (`Dia`) |
| Período do relatório | `Início dos relatórios`, `Encerramento dos relatórios`, `Reporting starts/ends` | sim (PT) |
| Conta | `Nome da conta`, `ID da conta`, `Account name/ID` | sim (`Nome da conta`) |
| Campanha | `Nome da campanha`, `ID da campanha`, `Campaign name/ID` | não |
| Conjunto | `Nome do conjunto de anúncios`, `ID do conjunto de anúncios`, `Ad set name/ID` | não |
| Anúncio | `Nome do anúncio`, `ID do anúncio`, `Ad name/ID` | sim (`Nome do anúncio`) |
| Moeda | `Moeda`, `Currency`, ou o sufixo `(BRL)` do título de valores | sim |
| Investimento | `Valor usado`, `Valor gasto`, `Valor investido`, `Amount spent`, `Spend`, `Investimento` (com ou sem sufixo de moeda) | sim (`Valor gasto (BRL)`) |
| Impressões | `Impressões`, `Impressions` | sim |
| Alcance | `Alcance`, `Reach` | sim |
| Cliques no link | `Cliques no link`, `Link clicks` | não |
| Cliques (todos) | `Cliques (todos)`, `Clicks (all)` | não |
| Resultados | `Resultados`, `Results` | não |
| Tipo de resultado | `Tipo de resultado`, `Indicador de resultados`, `Result type` | não |
| Visualizações da página de destino | `Visualizações da página de destino`, `Landing page views` | não |
| Conversas iniciadas | `Conversas por mensagem iniciadas`, `Messaging conversations started` | não |
| Leads | títulos que começam com `Leads` (vale a primeira coluna encontrada) | não |
| Compras | `Compras`, `Purchases` | não |
| Valor das compras | `Valor de conversão de compras`, `Purchases conversion value` | não |

Colunas que o Meta já entrega calculadas (CTR, CPC, CPM, custo por resultado, frequência, ROAS) são ignoradas de propósito. O painel recalcula a partir dos valores brutos, para poder somar períodos e comparar.

### 4.3 Leitura de números e datas

- número com os dois separadores: o último é o decimal;
- número com um separador só: se vêm exatamente três dígitos depois e a parte inteira não é zero, é milhar; senão, decimal. O separador mais votado no arquivo inteiro desempata (`12.34` num arquivo faz `1.234` valer 1,234);
- `R$`, espaços e espaço sem quebra são removidos;
- impressões, alcance e cliques precisam ser inteiros; qualquer valor negativo (inclusive `(12,50)`) é recusado;
- célula vazia numa coluna que veio vale zero; coluna que não veio fica **ausente** (NULL), diferente de zero;
- datas `AAAA-MM-DD`, `DD/MM/AAAA`, `AAAAMMDD` e número de série do Excel (inclusive calendário de 1904). Com barra, o formato dia/mês é o padrão e o arquivo inteiro decide se for mês/dia;
- linha sem dia, ou sem nome de conta, campanha, conjunto e anúncio, é linha de total e fica de fora, com aviso;
- mesmo anúncio no mesmo dia repetido (por exemplo, outro detalhamento por idade) é somado, com aviso de que o alcance pode ficar acima do real;
- moedas diferentes no mesmo arquivo são recusadas.

## 5. Como exportar do Meta (passo a passo mostrado na tela)

1. No Gerenciador de Anúncios, aba **Anúncios**, escolha o período (canto direito).
2. Clique em **Detalhamento**, ao lado de “Colunas”, e escolha **Por tempo › Dia**. Sem isso o Meta exporta **um total único do período** (uma linha por anúncio) e o painel recusa o arquivo.
3. Em **Colunas**, **Desempenho e cliques** traz o que o painel usa. Só **Desempenho** também funciona, mas sem cliques no link. Para ver campanhas e conjuntos, o arquivo precisa ter **Nome da campanha** e **Nome do conjunto de anúncios**.
4. Abra o menu do ícone de download (a setinha ao lado dele) e escolha **Exportar como .csv** ou **Exportar como .xlsx**.
5. Enviar em **Relatórios › Enviar relatório**.

**Rótulos do Meta já vistos em captura de tela (13/10/2026):** botão “Detalhamento” ao lado de “Colunas: Desempenho”; menu do download com “Exportar como .csv”, “Exportar como .xlsx”, “Personalizar exportação”, “Programar exportação” e “Compartilhar link da tabela”. O caminho **Por tempo › Dia** dentro de “Detalhamento” **não** foi visto em captura; vem do nome usual do Meta e do primeiro arquivo real, que trazia a coluna `Dia`. Se o submenu tiver outro nome, ajuste aqui, em `relatorios/export-steps.tsx` e nas mensagens de `lib/ads/report-rows.ts`.

## 6. Regra de substituição

O envio mais novo vale para o intervalo de dias que ele cobre (do primeiro ao último dia do arquivo):

- se o arquivo identifica a conta, saem do intervalo as linhas dessa conta (por ID ou nome) e as sem conta;
- se o arquivo não identifica conta, saem todas as linhas do intervalo;
- linhas fora do intervalo ou de outras contas não mudam;
- a tela mostra antes de salvar o que já existe no intervalo e os totais antes e depois;
- reenviar o mesmo arquivo mantém os mesmos números (a tela avisa que ele já foi enviado);
- salvar e excluir são serializados por trava no banco (`pg_advisory_xact_lock`) e a gravação é uma transação.

**Cobertura.** A tabela `ads_coverage` guarda os dias que cada envio ainda cobre. Dia coberto sem linha é dia sem veiculação (vale zero no gráfico). Dia fora da cobertura é dia **sem relatório**: o gráfico deixa lacuna e o painel avisa. Ao substituir parte de um envio, o trecho trocado sai da cobertura dele.

**Histórico.** Cada envio aparece como **Em uso**, **Em uso em parte** ou **Substituído**.

**Excluir um envio** remove o registro e as linhas dele que ainda estão em uso. O que ele tinha substituído não volta: para recuperar, envie de novo o relatório daquele período.

## 7. Métricas e fórmulas

Valores brutos (soma): investimento, impressões, alcance, cliques no link, cliques (todos), resultados, visualizações da página de destino, conversas iniciadas, leads, compras, valor das compras.

| Indicador | Fórmula | Só aparece se o arquivo trouxe |
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

Regras:

- cada razão soma só as linhas em que **as duas pontas existem**. Linha de relatório antigo sem cliques não entra no CPC, senão o gasto dela inflaria o custo por clique;
- ROAS nunca é calculado sem valor de conversão;
- “Resultados” soma tipos diferentes quando o arquivo traz mais de um; a tela avisa quais;
- comparação: período anterior de **mesmo tamanho** imediatamente antes; só aparece se esse período tem dados. Investimento é neutro (gastar mais não é bom nem ruim); nos demais, verde é melhora e vermelho é piora;
- períodos: 7, 30 e 90 dias contados **do último dia com dados** (não de hoje, porque o relatório chega depois que os dias passam); “Este mês” e “Mês passado” pelo calendário (America/Sao_Paulo); “Todo o período” e “Personalizado”. Padrão: últimos 30 dias com dados;
- o gráfico mostra uma métrica por vez, para não misturar escalas. Quantidades viram barras; taxas e custos viram linha;
- na tabela, nome vazio aparece como “Não informado”. Sem ID, conjuntos e anúncios de mesmo nome em campanhas diferentes não se misturam;
- a tabela mostra até 500 linhas por nível (as de maior investimento) e carrega 20 por vez.

## 8. Modelo de dados

Criado por `database/migrations/027_create_ads_reports.sql` **e** por `lib/ads/schema.ts` (mesmo SQL, idempotente). As migrations deste projeto são aplicadas à mão; por isso a API também cria as tabelas na primeira chamada (`ensureAdsSchema` em `lib/ads/db.ts`, uma vez por processo, com trava no banco). Se o usuário do banco não tiver permissão de criar tabelas, aplique a migration 027 manualmente. Ao mudar uma coluna, mude os dois arquivos juntos.

- **`ads_imports`**: um registro por arquivo. Nome, tamanho, hash SHA-256, formato, contas, moeda, período, linhas lidas/gravadas/ignoradas/substituídas, métricas presentes, colunas do arquivo (JSONB), `uploaded_by` → `users(id)` (`ON DELETE SET NULL`) e data do envio.
- **`ads_daily`**: uma linha por anúncio por dia. `import_id` → `ads_imports(id)` (`ON DELETE CASCADE`); dia; IDs e nomes de conta, campanha, conjunto e anúncio (texto, vazio quando ausente); tipo de resultado; métricas. **NULL na métrica = a coluna não veio no arquivo.**
- **`ads_coverage`**: dias que cada envio ainda cobre (seção 6).

Não há `payload_raw` nem cópia do arquivo.

## 9. Permissões

- **Ver** painel e histórico: qualquer usuário autenticado e ativo.
- **Enviar e excluir** relatório: só administrador (`users.is_admin`).
- A tela esconde o que o usuário não pode fazer, mas a permissão de verdade é conferida de novo em cada API. Não confiar em `localStorage`.
- Os dados são globais da empresa (não há tenant).

## 10. APIs

Todas autenticam pelo cookie `token` (ou `Authorization: Bearer`). Erros seguem `{ "error": { "code", "message" } }`; a `message` já é texto para a pessoa que está usando.

| Método e rota | Quem | O que faz |
| --- | --- | --- |
| `GET /api/ads/dashboard?from=&to=` | usuário | Números do painel do período (`AAAA-MM-DD`; sem período, últimos 30 dias com dados; máximo de ~5 anos). |
| `GET /api/ads/imports` | usuário | Histórico de envios e se o usuário pode gerenciar. |
| `POST /api/ads/imports` | admin | Multipart, campo `file`. Confere e grava (201). |
| `POST /api/ads/imports?preview=1` | admin | Confere e devolve o resumo, sem gravar. |
| `DELETE /api/ads/imports/:id` | admin | Exclui o envio e as linhas dele ainda em uso. |

Códigos: 401 sessão, 403 permissão, 400 período ou arquivo ausente, 404 envio inexistente, 413 arquivo grande, 422 arquivo que não pôde ser lido (mensagem explica o que fazer).

## 11. Segurança e integridade

- arquivo lido em memória e descartado; nunca vai para disco nem para pasta pública;
- limites aplicados antes e durante a leitura (seção 2); `Content-Length` conferido antes de ler o corpo;
- `.xlsx`: recusa senha, Zip64 e compressão fora do padrão, limita o tamanho descompactado de cada parte e do total, e não executa fórmula (só lê o valor guardado);
- SQL sempre parametrizado; gravação em lote com `UNNEST`;
- transação com client dedicado do pool (`withTransaction`/`withClient` de `lib/tracken/db.ts`). **Nunca** usar `query("BEGIN")` de `lib/db.ts`: ele guarda a transação numa variável global e duas requisições simultâneas cairiam na mesma transação;
- textos do arquivo (nomes de campanha etc.) são só dados: a tela renderiza como texto, sem HTML;
- cookie `sameSite: "lax"` evita envio de formulário por outro site;
- não registrar token, cookie, segredo ou conteúdo do relatório em log;
- respostas antigas de período são descartadas (`AbortController`).

## 12. Arquivos do módulo

**Telas** (`app/ads/`)

- `layout.tsx` — valida o JWT, lê o usuário no banco e monta o cabeçalho;
- `ads-shell.tsx` — cabeçalho, abas Painel/Relatórios, “Voltar ao sistema”, sair;
- `page.tsx` + `ads-dashboard.tsx` — Painel;
- `relatorios/page.tsx` + `reports-manager.tsx` — histórico, envio e exclusão;
- `relatorios/upload-dialog.tsx` — envio em duas etapas;
- `relatorios/export-steps.tsx` — passo a passo da exportação;
- `_components/` — `ui.tsx` (botão, cartão, aviso, janela), `kpi-cards.tsx`, `daily-chart.tsx`, `ranking-table.tsx`, `period-picker.tsx`, `viewer-context.tsx`.

**Regras de negócio** (`lib/ads/`)

- `report-file.ts` — abre CSV e `.xlsx` com segurança;
- `report-rows.ts` — reconhece colunas, lê números e datas, monta as linhas diárias;
- `store.ts` — consultas: prévia, salvar, listar, excluir, dados do painel;
- `db.ts` — conexões e criação das tabelas; `schema.ts` — SQL das tabelas;
- `metrics.ts` — catálogo de métricas e fórmulas; `dates.ts` — datas e períodos;
- `format.ts`, `client.ts`, `types.ts`, `preview.ts`, `report-error.ts`.

**APIs** (`app/api/ads/`): `dashboard/route.ts`, `imports/route.ts`, `imports/[id]/route.ts`.

**Outros:** `database/migrations/027_create_ads_reports.sql`; tokens visuais `.ads-root` em `app/globals.css`; `app/api/auth/logout/route.ts` (limpa JWT inválido e volta ao Ads); `.kiro/steering/ads-source-of-truth.md` (obriga ler/atualizar este documento). Relatórios reais ficam fora do Git (`.gitignore`: `app/ads/*.csv|xlsx|xls`).

## 13. Regra de manutenção

Ao trabalhar no Ads:

1. ler este README antes de editar;
2. distinguir implementado, planejado e pendente;
3. atualizar “Estado implementado”, decisões e changelog na mesma alteração;
4. não transformar apelido de coluna em contrato sem arquivo real: marque na tabela da seção 4.2;
5. não adicionar métrica sem registrar fórmula e origem;
6. nunca colocar dados reais, IDs, tokens ou segredos aqui;
7. testar com banco temporário, nunca contra o banco de produção.

## 14. Changelog

### 13/10/2026 — Passo a passo corrigido e aviso de arquivo sem dia

- primeiro uso real: o arquivo foi exportado sem “Detalhamento › Por tempo › Dia” e o painel recusou, como previsto;
- o passo a passo citava “Exportar › Exportar dados da tabela”, que não existe no menu do Meta; agora usa os rótulos vistos na tela (“Exportar como .csv” e “Exportar como .xlsx”);
- o aviso de arquivo sem dia agora diz o período que o arquivo trouxe (por exemplo, “total único de 14/09/2026 a 13/10/2026”) e o que fazer;
- registrados quais rótulos do Meta foram vistos em captura e quais não.

### 13/10/2026 — Relatórios, banco e painel (Etapa 2)

- nova tela **Relatórios** com envio de CSV/Excel, conferência antes de salvar, histórico e exclusão (administrador);
- novo **Painel** com indicadores, comparação com o período anterior, gráfico por dia e tabela por campanha, conjunto e anúncio;
- tabelas `ads_imports`, `ads_daily` e `ads_coverage` (migration 027 + criação automática);
- regra de substituição por período e conta; cobertura de dias para separar “sem veiculação” de “sem relatório”;
- leitor de `.xlsx` próprio, sem `xlsx@0.18.5`;
- APIs `/api/ads/dashboard` e `/api/ads/imports`;
- layout refeito: cabeçalho com abas no lugar do menu lateral, visual neutro, sem textos de marketing nem botão do Tracken;
- linguagem simples em toda a tela;
- verificado com banco temporário em memória, arquivo real e telas renderizadas no servidor; nada foi executado contra o banco de produção.

### 13/10/2026 — Ads fora do menu do Tracken

- removido o item “Meta Ads” do menu lateral do painel Tracken (`components/tracken/TrackenSidebar.tsx`), grupo “Análise”;
- o Ads continua acessível pela rota `/ads` e pelo menu do dashboard FNVJ (`components/Sidebar.tsx`).

### 29/09/2026 — Primeiro relatório real analisado

- confirmado CSV diário no nível de anúncio e seus 11 cabeçalhos;
- adicionados aliases exatos em português para o export observado;
- documentadas métricas possíveis e impossíveis sem inventar dados;
- relatórios reais protegidos por `.gitignore` (`app/ads/*.csv|xlsx|xls`).

### 29/09/2026 — Fundação do módulo

- criado `/ads` com sessão compartilhada;
- criado dashboard inicial sem dados simulados e parser CSV local limitado;
- registrados escopo, decisões, modelo e roadmap;
- adicionados pontos de navegação e proteção no middleware;
- removido uso novo do `xlsx@0.18.5` por risco conhecido.
