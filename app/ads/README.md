# FNVJ Ads — Fonte de verdade do módulo

> **Documento vivo e obrigatório.** Toda mudança em rota, tela, importação, coluna, fórmula, banco, permissão ou procedimento do módulo Ads deve atualizar este arquivo na mesma alteração.
>
> **Última atualização:** 29/09/2026  
> **Estado:** Etapa 1 implementada localmente — fundação visual e pré-validação local de arquivos  
> **Rota:** `/ads`

## 1. Do que se trata

O FNVJ Ads é a central de análise de tráfego pago do Fique no Verde Já. A fundação atual pré-valida **CSV exportado manualmente do Gerenciador de Anúncios da Meta/Facebook**. XLSX/XLS permanecem planejados até adoção de um parser seguro e mantido. Não existe integração automática com a Marketing API nesta etapa.

Objetivos:

- reunir performance de campanhas, conjuntos e anúncios;
- mostrar investimento, alcance, impressões, cliques, resultados e retorno;
- oferecer análises claras, filtros, gráficos, ranking e detalhe;
- manter histórico confiável das importações;
- impedir duplicação ao importar o mesmo arquivo ou períodos sobrepostos.

O módulo usa o mesmo login, cookie JWT, tabela `users` e PostgreSQL do FNVJ/Tracken. Não existe segundo cadastro.

## 2. Estado implementado

### Etapa 1 — concluída

- rota autenticada `/ads`;
- shell responsivo próprio com identidade azul inspirada na Meta/Facebook;
- fonte principal Geist (OFL, já carregada no FNVJ), com Helvetica/Arial apenas como fallback de sistema;
- acesso de volta ao dashboard FNVJ e ao Tracken;
- visão geral, KPIs vazios honestos, áreas de gráficos, ranking, estrutura e importações;
- modal de seleção por clique ou arrastar/soltar;
- leitura **somente no navegador** de CSV, sem upload e sem executar fórmula;
- limites reais: 5 MB, 5.000 linhas de dados, 100 colunas e 10.000 caracteres por célula;
- parser com suporte a vírgula, ponto e vírgula, tabulação, campos entre aspas e quebra de linha;
- geração de leitura para impedir que um arquivo antigo sobrescreva o mais novo;
- detecção de cabeçalhos, quantidade de linhas e primeiras cinco linhas;
- mapeamento confirmado das 11 colunas do primeiro export, além de aliases PT/EN para IDs, campanha, conjunto, cliques, resultados e conversão;
- nenhum dado fictício e nenhum envio ao servidor;
- middleware reconhece `/ads` como área autenticada;
- links de acesso no dashboard FNVJ e no painel Tracken;
- modal e drawer com Escape, confinamento/restauração de foco e fundo inerte;
- sidebar fixa no desktop e drawer no mobile.

### Validação técnica da Etapa 1

- TypeScript (`tsc --noEmit`): aprovado;
- ESLint dos arquivos alterados: aprovado sem erros;
- build de produção Next.js 16: aprovado, rota `/ads` dinâmica gerada;
- revisão de whitespace: aprovada;
- revisão semântica executada; riscos confirmados de parser, foco, corrida, fonte e redirecionamento foram corrigidos.

### Ainda não implementado

- upload/persistência no PostgreSQL;
- contrato ampliado com campanha, conjunto, IDs, cliques, resultados e valor de conversão;
- preview com novos/atualizados/ignorados/erros;
- importação idempotente e histórico de lotes;
- APIs de filtros, stats, tabela e exportação;
- gráficos alimentados por dados reais;
- permissões finais de visualização/importação/exclusão;
- integração automática com Meta Marketing API.

A persistência permanece deliberadamente desabilitada. O primeiro relatório real já confirmou o formato básico, mas não contém IDs, campanha, conjunto, cliques, resultados nem valor de conversão. Gravar apenas por nome do anúncio + dia não é idempotência segura: renomear um anúncio criaria outra identidade. O contrato será fechado depois de um segundo export com essas dimensões.

## 3. Decisões vigentes

1. A URL pública interna é literalmente `/ads`, separada de `/tracken/ads`.
2. A autenticação é a sessão FNVJ já existente (`token` HttpOnly).
3. O visual é azul e claro, inspirado na linguagem Meta/Facebook, sem copiar logotipo ou fonte proprietária.
4. O arquivo é processado localmente na Etapa 1.
5. Não exibir métricas simuladas.
6. Métricas derivadas só existem quando os valores brutos necessários estiverem presentes.
7. Primeira implementação de dados será manual por arquivo; API Meta fica fora do escopo inicial.
8. O nível preferido do relatório é **Anúncio com detalhamento diário**, porque permite agregar com segurança para Conjunto e Campanha.

## 4. Contrato de relatório

### 4.1 Formato confirmado no primeiro CSV real — 29/09/2026

O arquivo observado está no nível **Anúncio**, com detalhamento **diário**, uma moeda e uma configuração de atribuição. Nenhum valor, nome de anúncio ou ID real é registrado neste documento.

Cabeçalhos confirmados, na ordem do export:

1. `Nome da conta`;
2. `Dia`;
3. `Nome do anúncio`;
4. `Alcance`;
5. `Impressões`;
6. `Frequência`;
7. `Moeda`;
8. `Valor gasto (BRL)`;
9. `Configuração de atribuição`;
10. `Início dos relatórios`;
11. `Encerramento dos relatórios`.

Características confirmadas:

- CSV separado por vírgula;
- campos textuais com vírgula vêm corretamente entre aspas;
- datas em `YYYY-MM-DD`;
- números decimais com ponto;
- dias sem veiculação podem não produzir linha;
- início e encerramento coincidem com o dia em um breakdown diário;
- frequência vem pronta, mas também pode ser conferida por impressões ÷ alcance no grão diário.

Com esse arquivo já é possível analisar:

- investimento;
- alcance diário (não somar como alcance único do período);
- impressões;
- frequência diária;
- CPM;
- evolução diária;
- comparação por nome de anúncio.

Não é possível calcular corretamente com esse arquivo:

- CTR e CPC, porque não há cliques;
- CPA/CPL, porque não há resultados;
- ROAS, porque não há valor de conversão;
- hierarquia Campanha → Conjunto → Anúncio, porque campanha e conjunto não vieram;
- idempotência robusta, porque não há IDs estáveis da conta/campanha/conjunto/anúncio.

### 4.2 Formato completo ainda necessário

#### Dimensões preferidas

- data/dia;
- ID e nome da conta de anúncios;
- ID e nome da campanha;
- ID e nome do conjunto de anúncios;
- ID e nome do anúncio;
- objetivo;
- veiculação/status;
- moeda;
- janela de atribuição.

#### Métricas brutas preferidas

- valor usado/investimento;
- impressões;
- alcance;
- cliques no link;
- visualizações da página de destino;
- resultados;
- tipo de resultado;
- valor de conversão;
- compras, leads ou conversas iniciadas, conforme o objetivo.

#### Métricas derivadas

- `CTR = cliques no link / impressões × 100`;
- `CPC = investimento / cliques no link`;
- `CPM = investimento / impressões × 1.000`;
- `CPA/CPL = investimento / resultados`;
- `Frequência = impressões / alcance`;
- `ROAS = valor de conversão / investimento`.

Divisão por zero retorna métrica indisponível, nunca infinito ou zero enganoso. ROAS não é calculado sem valor de conversão compatível.

## 5. Fluxo definitivo planejado

1. Selecionar ou arrastar o relatório.
2. Pré-validar formato, tamanho, aba, cabeçalhos, idioma e granularidade.
3. Mostrar primeiras linhas sem gravar.
4. Normalizar cabeçalhos e números localizados.
5. Exibir resumo: válidas, novas, atualizáveis, duplicadas e rejeitadas.
6. Confirmar explicitamente.
7. Gravar lote e fatos em transação com client PostgreSQL dedicado.
8. Atualizar dashboard imediatamente.
9. Guardar histórico, hash e erros completos.
10. Exportar exatamente o recorte filtrado com proteção contra fórmula de planilha.

## 6. Modelo de dados planejado

Nomes finais dependem da decisão de visibilidade/empresa.

### `ads_import_batches`

- `id` UUID;
- `uploaded_by_user_id` → `users.id`;
- nome, tamanho e hash SHA-256 do arquivo;
- conta, moeda, timezone e janela de atribuição detectados;
- período mínimo/máximo;
- total de linhas, válidas, inseridas, atualizadas, ignoradas e rejeitadas;
- status, erro e timestamps.

### `ads_daily_insights`

Uma linha por data + conta + campanha + conjunto + anúncio + janela de atribuição.

- IDs e nomes Meta;
- dimensões do relatório;
- métricas brutas;
- `import_batch_id`;
- `payload_raw` para auditoria;
- timestamps.

A chave natural deve impedir soma duplicada em períodos sobrepostos. Importação repetida atualiza o fato; não cria uma segunda cópia.

### `ads_import_errors`

- lote;
- número da linha;
- coluna/campo;
- código e mensagem;
- valor original seguro;
- timestamp.

## 7. Permissões — PENDENTE

O banco atual não possui empresa/tenant; há apenas `users.is_admin`.

Proposta inicial:

- usuários ativos visualizam o dashboard;
- administradores importam, substituem ou excluem relatórios;
- toda alteração registra o usuário responsável.

Antes da migration, confirmar se os dados são globais da empresa ou privados por `user_id`.

## 8. APIs planejadas

- `POST /api/ads/import/preview` — valida sem publicar;
- `POST /api/ads/import/commit` — grava lote confirmado;
- `GET /api/ads/stats` — KPIs e séries;
- `GET /api/ads/insights` — ranking e detalhe paginado;
- `GET /api/ads/imports` — histórico;
- `GET /api/ads/export` — CSV do filtro atual.

Toda API deve validar a sessão no servidor; middleware não substitui autorização.

## 9. Segurança e integridade

- nunca salvar arquivo em pasta pública;
- limite explícito de 5 MB, 5.000 linhas, 100 colunas e 10.000 caracteres por célula;
- validar extensão e estrutura CSV antes da prévia;
- SQL parametrizado;
- transação com client dedicado (`lib/tracken/db.ts` como referência);
- hash de arquivo + chave natural por fato;
- neutralizar fórmulas em exportações CSV;
- não confiar em `localStorage` para autorização;
- não registrar token, cookie, segredo ou relatório bruto em logs;
- respostas antigas de filtros devem ser abortadas/descartadas por geração.

## 10. Arquivos do módulo

- `app/ads/layout.tsx` — valida JWT e monta o shell;
- `app/ads/page.tsx` — entrada da rota;
- `app/ads/ads-shell.tsx` — navegação responsiva;
- `app/ads/ads-dashboard.tsx` — dashboard e prévia local;
- `app/ads/README.md` — este contrato;
- `app/api/auth/logout/route.ts` — limpa JWT inválido preservando retorno ao `/ads`;
- `.kiro/steering/ads-source-of-truth.md` — obriga leitura/atualização deste documento.

## 11. Regra de manutenção

Ao trabalhar no Ads:

1. ler este README antes de editar;
2. distinguir implementado, planejado e pendente;
3. atualizar “Estado implementado”, decisões e changelog na mesma alteração;
4. não transformar hipótese de coluna Meta em contrato sem arquivo real;
5. não adicionar métrica sem registrar fórmula e origem;
6. nunca colocar dados reais, IDs, tokens ou segredos aqui.

## 12. Changelog

### 29/09/2026 — Primeiro relatório real analisado

- confirmado CSV diário no nível de anúncio e seus 11 cabeçalhos;
- adicionados aliases exatos em português para o export observado;
- documentadas métricas possíveis e impossíveis sem inventar dados;
- mantida persistência desabilitada por ausência de IDs e métricas de conversão;
- relatórios reais protegidos por `.gitignore` (`app/ads/*.csv|xlsx|xls`).

### 29/09/2026 — Fundação do módulo

- criado `/ads` com sessão compartilhada;
- criado shell azul responsivo;
- criado dashboard inicial sem dados simulados;
- criado parser CSV local limitado e prévia das primeiras linhas;
- XLSX/XLS mantidos fora da fundação até existir parser seguro;
- registrados escopo, decisões, modelo e roadmap;
- adicionados pontos de navegação e proteção no middleware;
- adicionados foco preso/restaurado no modal e drawer, sidebar fixa e retorno seguro após JWT inválido;
- removido uso novo do `xlsx@0.18.5` por risco conhecido; a prévia inicial ficou restrita a CSV limitado.
