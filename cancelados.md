# Demanda: 3o Servico "CANCELADOS"

## Objetivo deste documento

Documento vivo da demanda. Deve preservar:

- o pedido funcional;
- o comportamento atual encontrado no sistema (diagnostico);
- os problemas/bugs descobertos durante a analise;
- as decisoes tecnicas;
- as alteracoes realizadas;
- as migracoes necessarias;
- as validacoes executadas;
- as pendencias e proximos passos.

Este arquivo deve ser atualizado conforme a demanda evolui, para evitar perda
de contexto.

**Regra de ouro desta demanda: NAO QUEBRAR o sistema atual, que esta em uso
intenso em producao (Coolify/VPS).** Toda alteracao deve ser aditiva e
retrocompativel.

## Situacao reportada (pedido do cliente)

Criar um 3o servico chamado **CANCELADOS**, porque hoje existem apenas 2:

1. ATRASOS
2. RECLAMACOES

Requisitos declarados:

- a **precificacao deve ser identica** a do servico RECLAMACAO como ele esta
  hoje ("igual, duplicada"), mudando apenas a nomenclatura;
- deve refletir **em todos os ambientes/telas onde precisar**;
- deve aparecer em **Registrar atendimento** (registro de venda);
- deve aparecer no **dashboard** depois que houver vendas de CANCELADOS
  lancadas;
- e nos demais pontos que dependem de servico.

## Diagnostico do sistema antes das alteracoes

### Infraestrutura de servicos e generica

O sistema NAO tem os servicos hardcoded no banco de forma rigida:

- tabela `services` (id, name UNIQUE, description, base_price, sla,
  highlights, is_active);
- tabela `service_price_ranges` (service_id, sale_type, min_quantity,
  max_quantity, unit_price, effective_from);
- API CRUD completa em `app/api/services/route.ts` (GET/POST/PUT/DELETE).

Ou seja: criar o registro do servico e possivel via SQL ou via UI admin, sem
alterar codigo.

### O problema real: ~8 pontos assumem exatamente 2 servicos

Todos esses pontos comparam **string do nome do servico**, nao `service_id`.
Um 3o servico simplesmente nao apareceria neles.

### Descoberta critica 1: `sale_items.product_id` e sempre NULL

Ambas as telas de venda enviam `productId: null`:

- `app/dashboard/sales/new/page.tsx` (payload)
- `app/dashboard/sales/page.tsx` (modal rapido)

Consequencia: todos os `LEFT JOIN services serv ON si.product_id = serv.id`
das metricas **nunca casam**. A classificacao cai sempre no fallback
`si.product_name`, que e a string do nome do servico congelada no momento da
venda. Portanto **o nome exato do servico e o que rege dashboards e
relatorios**.

Implicacao para esta demanda: o nome "Cancelados" precisa ser reconhecido por
comparacao de string nos agrupamentos.

### Descoberta critica 2: precificacao da RECLAMACAO e progressiva

Nao e faixa simples. E progressiva (estilo faixa de imposto de renda):

- primeiras 10 unidades: preco da 1a faixa (hoje R$ 40,00);
- da 11a unidade em diante: preco da 2a faixa (hoje R$ 15,00);
- total = `10 x 40 + (qtd - 10) x 15`.

Ja ATRASOS usa **faixa simples** (`qtd x preco da faixa atingida`), com faixas
1-10 = R$ 30,00, 11-20 = R$ 20,00, 21+ = R$ 15,00.

Fonte: `database/migrations/011_update_pricing_nov2025.sql`.

Implicacao: "precificacao igual a RECLAMACAO" significa que CANCELADOS deve
entrar na **regra progressiva**, nao apenas ter os mesmos numeros.

### Descoberta critica 3 (BUG PRE-EXISTENTE): acento quebra o calculo

O nome do servico em producao tem acento: **"Reclamação"**.

- `app/dashboard/sales/new/page.tsx` comparava
  `name.toLowerCase().includes("reclamacao")` (sem acento) -> resultado
  **sempre false**;
- `app/dashboard/sales/page.tsx` (modal rapido) normalizava NFD antes de
  comparar -> **funcionava**.

Consequencia: **as duas telas de venda calculavam valores diferentes para a
mesma RECLAMACAO**. A tela "nova venda" caia no calculo de faixa simples,
enquanto o modal rapido aplicava o progressivo.

Mesmo bug de acento em `app/dashboard/admin/services/page.tsx` (texto
explicativo das faixas).

Este bug foi corrigido nesta demanda, porque replicar a logica para CANCELADOS
sem corrigir manteria a divergencia.

### Comissoes NAO dependem de servico

Verificado:

- `commission_policies.product_id` referencia a tabela legada `products`, nao
  `services`;
- `get_applicable_commission_policy(user_id, product_id, date, sale_type)` e
  dirigida por **sale_type + data + usuario**;
- como `si.product_id` e sempre NULL, o escopo `product` nunca dispara.

Conclusao: **adicionar CANCELADOS nao exige mudanca nas regras de comissao.**
A unica excecao e o agrupamento visual por servico no PDF de comissao
(`components/CommissionReportTemplate.tsx`), que soma por nome.

### Pacotes

- `client_packages` tem `service_id`, e a carteira e unificada por
  `client_id + service_id`;
- a tela `app/dashboard/packages/page.tsx` nao referencia servico (carteira
  unificada por cliente);
- **Ponto de atencao:** em `app/dashboard/sales/page.tsx` o tipo 03 (consumo de
  pacote) forca `productName = "Atrasos"` por regra de negocio explicita no
  codigo. Ver secao "Pendencias / decisoes do cliente".

## Inventario dos pontos afetados

| # | Arquivo | Ponto | Necessidade |
|---|---------|-------|-------------|
| 1 | `database/migrations/018_add_cancelados_service.sql` | criacao do servico | NOVO |
| 2 | `lib/service-pricing.ts` | regra de preco compartilhada | NOVO |
| 3 | `app/dashboard/sales/new/page.tsx` | subtotal + banner progressivo | alterado |
| 4 | `app/dashboard/sales/page.tsx` | modal rapido (calculo) | alterado |
| 5 | `app/api/dashboard/metrics/route.ts` | buckets SQL + resposta | alterado |
| 6 | `app/dashboard/page.tsx` | tipos, metricas derivadas, card | alterado |
| 7 | `components/CommissionReportTemplate.tsx` | soma por servico no PDF | alterado |
| 8 | `app/dashboard/services/page.tsx` | textos das faixas | alterado |
| 9 | `app/dashboard/admin/services/page.tsx` | textos das faixas + bug acento | alterado |

## Decisoes tecnicas

### Precificacao copiada do banco, nao digitada

A migracao **nao hardcoda 40/15**. Ela **copia as faixas da RECLAMACAO como
estao no banco no momento da execucao**.

Motivo: o pedido foi "igual a precificacao de hoje". A migration 011 diz
40/15, mas um administrador pode ter alterado os valores pela interface depois.
Copiar do banco garante identidade por construcao, sem suposicao.

### Regra de preco centralizada

Criado `lib/service-pricing.ts` com:

- `normalizeServiceName()` - remove acento e caixa;
- `isProgressiveService()` - true para reclamacao e cancelados;
- `getApplicableRanges()` - filtra faixas por sale_type com fallback para '01';
- `calculateServiceSubtotal()` - aplica progressivo ou faixa simples;
- `formatServiceLabel()` - rotulo padronizado.

Motivo: a logica estava duplicada e divergente nas duas telas de venda. Com um
unico ponto de verdade, as telas passam a calcular igual e um 4o servico futuro
exige mudanca em um lugar so.

Detalhe: o limite da 1a faixa deixou de ser fixo em 10. Agora vem de
`firstRange.maxQuantity` (com 10 apenas como fallback), respeitando o cadastro.

### Compatibilidade / nao quebrar producao

- a migracao e **idempotente** (`ON CONFLICT DO NOTHING`, DELETE+INSERT das
  faixas do proprio Cancelados);
- nenhuma alteracao destrutiva em ATRASOS ou RECLAMACAO;
- os buckets novos no SQL de metricas sao **aditivos** (novas colunas), nao
  alteram os buckets existentes;
- a comparacao usa `LIKE '%cancelad%'` e `includes("cancelado")`, tolerando
  "Cancelado"/"Cancelados".

## Alteracoes realizadas

### Banco

- **`database/migrations/018_add_cancelados_service.sql`** (novo)
  - cria a funcao auxiliar `fnvj_normalize_text()` (normalizacao de acentos);
  - insere o servico `Cancelados` espelhando `base_price`, `sla` e
    `highlights` da RECLAMACAO;
  - fallback de criacao caso RECLAMACAO nao exista;
  - replica todas as faixas de `service_price_ranges` da RECLAMACAO para
    CANCELADOS (todos os `sale_type`, '01' e '02');
  - inclui query de verificacao comentada no final.

### Codigo

- **`lib/service-pricing.ts`** (novo) - regra de precificacao compartilhada.
- **`app/dashboard/sales/new/page.tsx`**
  - `subtotal` passou a usar `calculateServiceSubtotal()`;
  - banner "calculo progressivo" passou a usar `isProgressiveService()`;
  - **corrigido o bug de acento** que fazia a RECLAMACAO nao ser progressiva
    nesta tela.
- **`app/dashboard/sales/page.tsx`**
  - `calculateProgressivePrice()` passou a delegar para
    `calculateServiceSubtotal()`, eliminando a duplicacao.
- **`app/api/dashboard/metrics/route.ts`**
  - adicionados os buckets `cancelados_units`, `cancelados_vendas`,
    `cancelados_consumos`, `cancelados_revenue`, `cancelados_sales_count`;
  - expostos na resposta como `canceladosUnits`, `canceladosVendas`,
    `canceladosConsumos`, `canceladosRevenue`, `canceladosSalesCount`;
  - `servicePerformanceQuery` passou de `LIMIT 6` para `LIMIT 10` para caber o
    3o servico com folga (os outros `LIMIT 6` sao de clientes, nao de
    servicos, e foram mantidos).
- **`app/dashboard/page.tsx`**
  - tipo `PeriodTotals` ganhou `canceladosUnits`, `canceladosVendas`,
    `canceladosConsumos`, `canceladosRevenue`, `canceladosSalesCount`;
  - metricas derivadas `avgCanceledUnits` e `avgCanceledUnitValue`;
  - card unificado renomeado para "Reclamações, Atrasos & Cancelados" com a
    3a coluna (cor rose, seguindo o padrao das outras duas);
  - card "Atendimentos" passou de 2 para 3 colunas, incluindo
    "Valor Unit. Cancelado";
  - `formatServiceLabel` local substituido pelo helper compartilhado.
- **`components/CommissionReportTemplate.tsx`**
  - adicionado o bucket `sumCancelados` e a linha "Cancelados" no bloco
    "Soma Por Serviço" (exibida somente quando houver valor, mesmo padrao de
    "Outros");
  - a comparacao de nome passou a normalizar acentos.
- **`app/dashboard/services/page.tsx`** e
  **`app/dashboard/admin/services/page.tsx`**
  - textos explicativos das faixas passaram a usar `isProgressiveService()`,
    cobrindo CANCELADOS e corrigindo o bug de acento na tela admin.

## Correcoes na tela /dashboard/sales/new

Durante o teste do CANCELADOS o cliente reportou que a tela
`/dashboard/sales/new` estava muito problematica. Diagnostico e correcoes:

### Bug 1 (grave): Tipo 03 era impossivel de selecionar

Um `useEffect` comparava o tipo de venda escolhido com os tipos que possuem
faixa em `service_price_ranges`. Como o tipo `03` (consumo de pacote) **nao
possui faixa** (existem apenas '01' e '02'), ao selecionar '03' o efeito
forcava o valor de volta para '01' imediatamente.

Resultado: a opcao aparecia no select, mas era impossivel de manter
selecionada. Consumo de pacote nao funcionava nesta tela.

Correcao: o efeito agora preserva explicitamente o tipo '03'.

### Bug 2: campo de desconto inacessivel

A tela tinha toda a logica de desconto implementada
(`generalDiscountType`, `generalDiscountValue`, `handleDiscountValueChange`,
calculo de `generalDiscountAmount` e exibicao no resumo), mas **o campo nunca
era renderizado**. Nao havia como aplicar desconto.

Correcao: adicionados os campos "Tipo de desconto" (% ou R$) e "Desconto",
ocultos no tipo 03.

### Bug 3: data da venda travada e nunca enviada

`const [saleDate] = useState(() => new Date())` — sem setter, input
`disabled`, e **o payload nao enviava `saleDate`**. Toda venda gravava a data
atual, sem possibilidade de lancamento retroativo (que o modal rapido permite).

Correcao: campo `type="date"` editavel, limitado a hoje (`max`), e enviado no
payload.

### Bug 4: nao permitia atribuir a venda a outro atendente

O modal rapido tem "Atribuir venda ao atendente" para admin. Esta tela nao
tinha, e o payload nao enviava `attendantId`.

Correcao: carrega `/api/auth/me` e, se admin, `/api/admin/users?active=true`;
adicionado o campo de atribuicao (padrao "Eu mesmo"). A API ja aceitava
`attendantId`, nenhuma mudanca de backend foi necessaria.

### Bug 5: quantidade aceitava valor fracionado

`step="0.01"` + `parseFloat` permitiam quantidades quebradas (ex.: 2,5
unidades de atendimento).

Correcao: `step="1"`, `min="1"` e `parseInt`.

### Bug 6: "Valor unitario" enganoso em servico progressivo

Exibia apenas o preco da faixa. Para 30 unidades de Reclamacao mostrava
R$ 15,00, quando o valor medio real pago era R$ 23,33 (R$ 700 / 30).

Correcao: em servicos progressivos o texto passou a exibir tambem o valor
medio real por unidade.

### Melhoria adicional

O campo "Observacoes" nao era renderizado apesar de existir em `formData`.
Adicionado.

### Nao implementado nesta rodada

**Cupom de desconto.** O modal rapido tem aplicacao de cupom; esta tela nao.
Nao foi adicionado porque envolve a API de validacao de cupom e o calculo de
`couponDiscountAmount`, com impacto em comissao. Fica registrado como
proximo passo, se o cliente quiser paridade total.

## Pendencias / decisoes do cliente

1. **Tipo 03 (consumo de pacote) forca "Atrasos".**
   Em `app/dashboard/sales/page.tsx` existe regra explicita: consumo de pacote
   e exclusivo de ATRASOS. Se CANCELADOS puder ser vendido como pacote
   (tipo 02) e consumido (tipo 03), essa regra precisa mudar. **Nao alterado
   por decisao propria — depende de confirmacao do cliente.**

2. **CANCELADOS deve permitir venda de pacote (tipo 02)?**
   A migracao copia as faixas de RECLAMACAO inclusive as de `sale_type = '02'`,
   entao tecnicamente fica habilitado. Confirmar se e o desejado.

## Validacoes

### Build e tipos

- `npm run build`: aprovado, 88 rotas reconhecidas.
- TypeScript: aprovado sem erros.
- Diagnosticos por arquivo: nenhum erro nos 7 arquivos alterados e nos 2 novos.

Correcao aplicada durante a validacao: `PriceRangeLike.saleType` foi tipado
como `string` porque as telas usam tipos diferentes (`"01" | "02"` em uma,
`"01" | "02" | "03"` em outra). Sem isso o build falhava com TS2345.

### Teste da matematica de preco (executado contra o codigo real)

Faixas usadas: 1-10 = R$ 40,00 / 11+ = R$ 15,00.

| Qtd | Reclamacao | Cancelados | Iguais |
|-----|-----------|-----------|--------|
| 1   | R$ 40     | R$ 40     | OK |
| 5   | R$ 200    | R$ 200    | OK |
| 10  | R$ 400    | R$ 400    | OK |
| 11  | R$ 415    | R$ 415    | OK |
| 15  | R$ 475    | R$ 475    | OK |
| 30  | R$ 700    | R$ 700    | OK |
| 100 | R$ 1.750  | R$ 1.750  | OK |

Conferencia manual do progressivo: 11 un = `10x40 + 1x15 = 415`. Confere.

ATRASOS permaneceu em faixa simples, sem alteracao de comportamento:

- 10 un = R$ 300 (10 x 30);
- 15 un = R$ 300 (15 x 20);
- 25 un = R$ 375 (25 x 15).

Deteccao de servico progressivo, com e sem acento:

- "Reclamacao" -> true; "Reclamação" -> true;
- "Cancelados" -> true; "Cancelado" -> true;
- "Atrasos" -> false.

Rotulos: "Reclamações", "Atrasos", "Cancelados".

Arquivos temporarios do teste foram removidos apos a execucao.

## Implantacao no Coolify/VPS

### Ordem obrigatoria

1. Backup do PostgreSQL da VPS.
2. Aplicar `database/migrations/018_add_cancelados_service.sql`.
3. Verificar a criacao do servico e a copia das faixas.
4. Publicar o codigo na branch `coolify-deploy`.
5. Validar Registrar atendimento, Dashboard e Servicos no dominio real.

Observacao: o codigo novo **nao quebra** se a migracao ainda nao tiver sido
aplicada — sem o servico cadastrado, CANCELADOS simplesmente nao aparece nas
listas e os contadores ficam zerados.

### Consultas de verificacao

```sql
-- servico criado e faixas espelhadas
SELECT s.name, r.sale_type, r.min_quantity, r.max_quantity, r.unit_price
FROM services s
LEFT JOIN service_price_ranges r ON r.service_id = s.id
WHERE LOWER(s.name) IN ('cancelados')
   OR LOWER(s.name) LIKE '%reclama%'
ORDER BY s.name, r.sale_type, r.min_quantity;
```

Esperado: faixas de CANCELADOS identicas as de RECLAMACAO.

## Diario tecnico

### Analise inicial

- Sistema mapeado: infra de servicos generica, mas ~8 pontos assumem 2
  servicos por comparacao de string.
- Descoberto que `si.product_id` e sempre NULL, logo o nome do servico rege
  dashboards e relatorios.
- Descoberto que RECLAMACAO usa precificacao progressiva, nao faixa simples.
- Descoberto bug pre-existente de acento que fazia as duas telas de venda
  calcularem valores diferentes para RECLAMACAO.
- Confirmado que comissoes nao dependem de servico (apenas sale_type + data).

### Fundacao

- Criada a migracao 018 copiando a precificacao da RECLAMACAO direto do banco.
- Criado `lib/service-pricing.ts` centralizando a regra de preco.
- Telas de venda passaram a usar o helper compartilhado; bug de acento
  corrigido.
- Metricas do dashboard ganharam os buckets de CANCELADOS.

### Reflexo nas telas

- Dashboard: card unificado com a 3a coluna e valor unitario medio de
  CANCELADOS.
- PDF de comissao: soma por servico passou a distinguir CANCELADOS em vez de
  jogar tudo em "Outros".
- Telas de Servicos (comum e admin): textos das faixas reconhecem CANCELADOS
  como progressivo.
- Build e teste da matematica de preco aprovados.

### Implantacao concluida

Codigo publicado na branch `coolify-deploy` (commit `1bb0448`).

Migracao 018 aplicada ao PostgreSQL da VPS com sucesso:

- `CREATE FUNCTION` - helper `fnvj_normalize_text` criado;
- `INSERT 0 1` - servico "Cancelados" criado;
- `INSERT 0 4` - as 4 faixas da Reclamacao replicadas.

Resultado verificado no banco de producao:

| Servico | sale_type | min | max | unit_price |
|---------|-----------|-----|-----|-----------|
| Cancelados | 01 | 1 | 10 | 40 |
| Cancelados | 01 | 11 | (nulo) | 15 |
| Cancelados | 02 | 1 | 10 | 40 |
| Cancelados | 02 | 11 | (nulo) | 15 |
| Reclamação | 01 | 1 | 10 | 40 |
| Reclamação | 01 | 11 | (nulo) | 15 |
| Reclamação | 02 | 1 | 10 | 40 |
| Reclamação | 02 | 11 | (nulo) | 15 |

Precificacao **identica** confirmada, conforme o pedido. O nome real da
reclamacao em producao e "Reclamação" (com acento), o que confirma o
diagnostico do bug de acento descrito acima.

### Estado atual

Demanda implementada, migrada e publicada. Pendente apenas a validacao
funcional na interface e as duas decisoes de negocio sobre pacote (ver
"Pendencias / decisoes do cliente").
