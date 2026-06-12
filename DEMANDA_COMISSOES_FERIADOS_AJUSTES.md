# Demanda: Comissoes, Feriados e Ajustes Pos-Pagamento

## Objetivo deste documento

Este e o documento vivo da demanda. Ele deve preservar:

- o pedido funcional;
- o comportamento atual encontrado no sistema;
- as decisoes de implementacao;
- as alteracoes realizadas;
- as migracoes necessarias;
- as validacoes executadas;
- as pendencias e proximos passos.

Sempre que esta demanda evoluir, este arquivo deve ser atualizado para evitar
perda de contexto.

## Situacao reportada

### Feriados

A data de 04/06/2026 deveria receber a politica especial de comissao de 10%,
mas foi tratada como dia util.

### Estornos posteriores ao pagamento

E necessario visualizar valores de comissao que devem ser abatidos quando um
estorno e lancado depois do pagamento da competencia original.

Exemplo funcional:

1. Um atendimento de uma competencia fechada gerou comissao.
2. A comissao foi paga.
3. Depois do pagamento, a venda recebeu um estorno.
4. O valor originalmente pago deve permanecer no historico.
5. A reducao da comissao deve virar um ajuste negativo pendente.
6. O ajuste deve ser descontado no proximo pagamento de comissao.

## Regra de competencia

Entendimento inicial:

- competencia: mes calendario completo da data do atendimento/venda;
- pagamento: dia 15 posterior ao fechamento, conforme calendario operacional;
- uma competencia paga nao deve ser alterada retroativamente;
- estornos anteriores ao pagamento podem recalcular a comissao ainda pendente;
- estornos posteriores ao pagamento devem gerar ajuste para pagamento futuro.

### Ponto que precisa permanecer explicito

Foi informado o exemplo "competencia abril/2026, pagamento 15/06". Isso nao
corresponde literalmente a "pagamento no dia 15 do mes seguinte", que seria
15/05/2026. A implementacao deve permitir registrar a data efetiva de pagamento
sem inferi-la apenas pelo mes.

## Diagnostico do sistema antes das alteracoes

### Calculo de feriados

O sistema considera dia especial quando:

- a data e sabado ou domingo; ou
- existe um registro ativo para a data na tabela `holidays`.

Nao existe calculo automatico de feriados moveis. Os scripts encontrados
cadastram feriados de 2025, mas nao garantem o calendario de 2026.

Consequencias:

- 04/06/2026 e tratada como dia util se nao estiver em `holidays`;
- cadastrar a data depois nao recalcula automaticamente comissoes antigas;
- a listagem comum de comissoes classifica o tipo de dia apenas pelo dia da
  semana e pode divergir do calculo real;
- a listagem administrativa consulta `holidays`.

### Fluxo atual de estorno

Ao registrar um estorno, o endpoint:

- grava uma entrada em `sale_refunds`;
- reduz o total liquido da venda;
- recalcula a comissao;
- sobrescreve `sales.commission_amount`;
- sobrescreve os registros existentes em `commissions`.

O status da comissao nao e considerado nesse recálculo. Portanto, ate uma
comissao marcada como `pago` pode ter seu valor historico alterado.

### Fechamento e pagamento

A tabela `commissions` possui:

- `status`: `a_pagar`, `pago` ou `cancelado`;
- `payment_date`.

No entanto, antes desta demanda nao foi encontrado fluxo completo para:

- fechar uma competencia;
- registrar pagamento em lote;
- preservar o valor efetivamente pago;
- criar debitos posteriores;
- liquidar esses debitos em um pagamento futuro.

## Decisoes tecnicas iniciais

### Calendario

Criar migracao idempotente para:

- garantir a estrutura da tabela `holidays`;
- cadastrar o calendario nacional relevante de 2026;
- incluir 04/06/2026 como Corpus Christi;
- manter cadastro manual de feriados locais e futuras correcoes.

Observacao: Corpus Christi e ponto facultativo no calendario federal, mas sera
tratado pelo sistema como dia especial porque essa e a regra operacional
solicitada.

### Ajustes de comissao

Criar uma tabela separada de ajustes. Um ajuste negativo deve conter ao menos:

- atendente;
- venda;
- estorno que originou o ajuste;
- comissao original relacionada;
- competencia de origem;
- valor do estorno;
- valor da comissao a descontar;
- data de criacao;
- status pendente ou liquidado;
- competencia/data de liquidacao quando houver.

Motivo da tabela separada:

- nao alterar comissao ja paga;
- manter rastreabilidade;
- permitir mais de um estorno por venda;
- evitar duplicidade;
- exibir claramente o que sera abatido no proximo pagamento.

### Regra do estorno

- Se nenhuma comissao da venda estiver paga, recalcular as comissoes pendentes.
- Se existir comissao paga, preservar os registros pagos.
- Calcular a diferenca entre a comissao paga antes e a comissao devida depois
  do estorno.
- Registrar somente o incremento da diferenca ainda nao registrado por
  estornos anteriores.
- Exibir o ajuste como debito pendente, sem apagar o historico pago.

### Compatibilidade

A implementacao deve ser idempotente e tolerar ambientes em que a migracao
ainda nao foi executada, retornando uma mensagem clara em vez de corromper o
fluxo principal.

## Plano de execucao

- [x] Ler arquitetura e fluxo atual.
- [x] Rastrear regras de feriados.
- [x] Rastrear geracao e listagem de comissoes.
- [x] Rastrear estornos.
- [x] Criar este documento vivo.
- [x] Criar migracao de feriados e ajustes.
- [x] Criar API administrativa de feriados.
- [x] Corrigir classificacao de feriados na listagem comum.
- [x] Adaptar estorno para preservar comissoes pagas.
- [x] Criar API de consulta dos ajustes.
- [x] Criar visualizacao administrativa dos debitos.
- [x] Criar fluxo de fechamento/pagamento de competencia.
- [x] Validar build e testes direcionados.
- [x] Registrar resultado final e instrucoes de implantacao.

## Diario tecnico

### 12/06/2026 - Analise inicial

- Sistema identificado como Next.js 16, React 19 e PostgreSQL.
- Politica de dia especial depende de `holidays`.
- Scripts existentes possuem calendario de 2025.
- Estorno atual altera retroativamente comissao paga.
- Nao ha fechamento de competencia implementado.
- Documento vivo criado antes das alteracoes funcionais.

### 12/06/2026 - Confirmacao no banco da VPS

- O ambiente real e o PostgreSQL da VPS utilizado pelo Coolify.
- Nao havia nenhum feriado de 2026 cadastrado.
- Foram encontrados tres registros de comissao em 04/06/2026.
- Os tres registros estavam `a_pagar` e calculados com taxa de 2,5%.
- Os tres registros sao atendimentos do tipo `01`.
- As bases atuais sao R$ 355,00, R$ 280,00 e R$ 40,00. Depois da correcao
  para 10%, as comissoes esperadas sao R$ 35,50, R$ 28,00 e R$ 4,00.
- A politica especial ativa de fins de semana e feriados esta configurada em
  10%.
- As tabelas novas de ajustes e pagamentos ainda nao existem em producao.
- Nenhuma alteracao foi aplicada ao banco durante essa verificacao.

### 12/06/2026 - Fundacao de banco

- Criada a migracao `017_add_commission_adjustments_and_2026_holidays.sql`.
- Incluido o calendario operacional de 2026, incluindo Corpus Christi em
  04/06/2026.
- Criadas as tabelas `commission_adjustments`, `commission_payments` e
  `commission_payment_adjustments`.
- Ajustes suportam aplicacao parcial para carregar saldo quando o debito for
  maior que a comissao da proxima competencia.
- Criado helper compartilhado de autenticacao server-side para as novas APIs.
- A migracao corrige automaticamente as comissoes ainda `a_pagar` de
  04/06/2026 usando a politica aplicavel depois do cadastro do feriado.
- Comissoes ja pagas nao sao reescritas por essa correcao.

### 12/06/2026 - APIs administrativas

- Criada API de cadastro, edicao, listagem e desativacao de feriados.
- Criada API de consulta de ajustes com totais pendente, aplicado e acumulado.
- Criada API de pagamentos por competencia.
- O pagamento marca as comissoes da competencia como pagas e consome ajustes
  pendentes do atendente, dos mais antigos para os mais recentes.
- Quando o ajuste e maior que a comissao da competencia, o saldo restante
  continua pendente para o pagamento posterior.
- Criado recalculo administrativo de comissoes ainda nao pagas por periodo.
- Pagamentos registram como data prevista o dia 15 do mes seguinte, mantendo
  tambem a data efetiva informada pelo administrador.

### 12/06/2026 - Regra de estorno

- O endpoint de estorno passou a usar uma conexao transacional dedicada.
- Comissoes com status `pago` nao sao mais sobrescritas.
- A parcela ainda `a_pagar` e recalculada sem alterar o historico pago.
- Quando o novo valor devido e menor que o valor ja pago, a diferenca e
  registrada em `commission_adjustments`.
- Estornos sucessivos geram apenas o incremento do debito ainda nao registrado.
- O retorno da API informa o valor do ajuste criado.

### 12/06/2026 - Consistencia da visualizacao

- A listagem comum de comissoes passou a consultar `holidays`.
- Feriados ativos agora sao classificados como dia nao util em todas as telas.
- O nome do feriado e exibido junto da data de referencia.
- Corrigido o valor liquido exibido para nao subtrair o estorno duas vezes.

### 12/06/2026 - Interface administrativa

- Adicionada a area `Feriados` em Gestao de Comissoes.
- A area permite cadastrar, editar, desativar e listar as datas consideradas.
- Cada feriado possui uma acao para recalcular comissoes ainda pendentes.
- Adicionada a area `Ajustes/Pagamentos`.
- A nova area mostra debito pendente, total gerado e total ja abatido.
- A tabela de ajustes identifica atendente, venda, cliente, competencia de
  origem, estorno, debito e saldo restante.
- O formulario de pagamento permite selecionar atendente, competencia e data
  efetiva do pagamento.
- O historico apresenta valor bruto, ajustes abatidos e valor liquido pago.

### 12/06/2026 - Validacoes

- `npm run build`: aprovado, com as 88 rotas reconhecidas.
- ESLint direcionado aos arquivos desta demanda: aprovado sem ocorrencias.
- `git diff --check`: aprovado.
- TypeScript: aprovado. A chave obsoleta `eslint` e o bypass
  `ignoreBuildErrors` foram removidos de `next.config.ts`.
- A validacao visual em `localhost` foi descartada. O ambiente real e o
  Coolify/VPS e nao sera novamente tratado como uma aplicacao local.

## Implantacao no Coolify/VPS

### Ordem obrigatoria

1. Fazer backup do PostgreSQL da VPS.
2. Aplicar `database/migrations/017_add_commission_adjustments_and_2026_holidays.sql`
   no banco utilizado pelo Coolify.
3. Confirmar a criacao das tabelas e a correcao de 04/06/2026.
4. Publicar o codigo da branch `coolify-deploy`.
5. Aguardar o build Nixpacks do Coolify.
6. Validar as areas de Comissoes, Feriados e Ajustes/Pagamentos no dominio real.

A migracao deve vir antes do deploy da aplicacao. Caso o codigo seja publicado
sem a migracao, operacoes que dependem das tabelas novas retornarao erro 503 e o
estorno de uma comissao paga sera revertido pela transacao.

### Consultas de verificacao

Feriado:

```sql
SELECT date, name, is_active
FROM holidays
WHERE date = DATE '2026-06-04';
```

Comissoes corrigidas:

```sql
SELECT
  c.id,
  c.status,
  c.base_amount,
  c.commission_rate,
  c.commission_amount
FROM commissions c
WHERE c.reference_date::date = DATE '2026-06-04'
ORDER BY c.created_at;
```

Resultado esperado para os tres registros encontrados:

- base R$ 355,00: comissao R$ 35,50;
- base R$ 280,00: comissao R$ 28,00;
- base R$ 40,00: comissao R$ 4,00.

Estruturas:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'commission_adjustments',
    'commission_payments',
    'commission_payment_adjustments'
  );
```

## Observacao de seguranca fora do escopo

Foram encontrados scripts antigos com credenciais de banco gravadas diretamente
no repositorio. Os valores nao devem ser copiados para este documento. Recomenda-se
rotacionar as credenciais e migrar esses scripts para variaveis de ambiente em
uma demanda separada.

## Arquivos centrais da demanda

- `app/api/sales/refund/route.ts`
- `app/api/commissions/list/route.ts`
- `app/api/admin/commissions/list/route.ts`
- `app/dashboard/commissions/page.tsx`
- `app/dashboard/admin/commissions/page.tsx`
- `database/migrations/014_create_commissions.sql`
- `database/migrations/015_add_sale_type_to_commission_policies.sql`
- `database/migrations/012_add_sale_refunds.sql`

## Revisao funcional de 12/06/2026

Resultado: a primeira versao compila, mas ainda nao deve ser implantada como
concluida. A revisao encontrou os seguintes bloqueadores:

1. Nao existe fechamento efetivo da competencia. Depois de registrar um
   pagamento, ainda e possivel criar ou recalcular comissoes retroativas para o
   mesmo mes. Elas ficam `a_pagar`, mas um segundo pagamento da competencia e
   bloqueado pelo indice unico.
2. Alterar a data de uma venda apaga todas as comissoes, inclusive as pagas, e
   as recria como pendentes. A exclusao administrativa da venda tambem apaga os
   registros de comissao. Esses fluxos quebram a imutabilidade do historico.
3. O cancelamento de uma venda apenas cancela comissoes `a_pagar`. Se a
   comissao ja foi paga, nenhum ajuste negativo e criado.
4. O estorno recalcula a venda usando uma unica politica gravada em
   `sales.commission_policy_id`, enquanto a geracao normal e feita por item e
   pode usar politicas diferentes. Em especial, a funcao `fixed_per_unit`
   ignora o valor financeiro parcial do estorno e usa a quantidade total dos
   itens, podendo gerar debito incorreto.
5. O recalculo manual atualiza as linhas de `commissions`, mas nao sincroniza a
   politica gravada na venda. Um estorno posterior pode reutilizar uma politica
   antiga.
6. A interface mostra se um ajuste foi abatido, mas nao informa em qual
   pagamento/competencia ele foi consumido. O vinculo existe na tabela
   `commission_payment_adjustments`, porem nao e retornado pela API de ajustes.
7. O pagamento pode ser registrado para competencia ainda aberta ou com data
   anterior ao fechamento. Tambem nao ha uma previa de bruto, ajustes e liquido
   antes da confirmacao.
8. Existem valores antigos com mais de duas casas decimais. Em 04/06/2026, por
   exemplo, o total atual e R$ 16,875. As novas tabelas usam duas casas, portanto
   o arredondamento precisa ser definido e aplicado de forma uniforme.

Validacoes repetidas depois da revisao:

- `npm run build`: aprovado, 88 rotas;
- ESLint direcionado aos arquivos da demanda: aprovado;
- `git diff --check`: aprovado;
- consulta somente de leitura na VPS: 04/06/2026 continua sem feriado, as tres
  comissoes continuam em 2,5% e as tabelas novas ainda nao existem.

Conclusao da revisao: build aprovado nao significa regra financeira aprovada.
Os itens acima precisam ser corrigidos e testados antes da migracao/deploy.

## Correcoes aplicadas depois da revisao

### Fechamento e integridade

- `commission_payments` passou a representar o fechamento efetivo da
  competencia por atendente.
- Cada comissao paga recebe `commission_payment_id`, criando vinculo direto
  com o pagamento.
- Um gatilho no PostgreSQL impede:
  - excluir ou alterar os valores de uma comissao paga;
  - criar ou manter comissao `a_pagar` em competencia ja paga.
- A exclusao de venda foi bloqueada quando existe comissao paga. Nesse caso, o
  fluxo correto e cancelar a venda e gerar o ajuste.
- A alteracao de data foi bloqueada para vendas com comissao paga ou ajuste.
  Vendas ainda pendentes continuam podendo ser recalculadas em competencia
  aberta.

### Estorno e cancelamento

- O estorno deixou de depender de uma unica politica gravada na venda.
- A nova comissao devida e calculada proporcionalmente ao valor financeiro
  restante, preservando a distribuicao por item e suportando vendas mistas.
- Estornos sucessivos registram somente o incremento do debito.
- O cancelamento de venda com comissao paga preserva a comissao historica e
  cria um ajuste do tipo `cancellation`.
- Comissoes ainda pendentes sao canceladas normalmente.

### Pagamento

- O pagamento so pode ser registrado a partir do dia 15 do mes seguinte e nao
  aceita data futura.
- A API fornece previa com valor bruto, ajustes disponiveis, valor abatido,
  liquido e quantidade de comissoes.
- Valores financeiros sao arredondados uniformemente para duas casas.
- Ajustes maiores que o pagamento sao aplicados parcialmente e carregam saldo.
- A interface mostra a data prevista, data efetiva e os pagamentos em que cada
  ajuste foi consumido.

### Calendario e fuso

- Comparacoes de competencia, feriado e data de referencia passaram a usar
  explicitamente `America/Sao_Paulo`.
- Isso evita classificacao incorreta de atendimentos proximos da meia-noite.
- O recalculo atualiza tambem `commission_policy_id` em cada comissao.

### Compatibilidade confirmada na VPS

- O legado possui os tipos `percent`, `percentage` e `fixed_per_unit`.
- A migracao 017 foi ajustada para aceitar esses valores, alem de `fixed`.
- `sale_refunds`, `commission_policies`, `pgcrypto` e
  `sales.commission_policy_id` existem no ambiente real.
- Essa verificacao foi somente de leitura. A migracao ainda nao foi aplicada.

### Validacoes finais

- Build completo do Next.js: aprovado, 88 rotas.
- TypeScript completo: aprovado sem erros; o build voltou a validar tipos.
- ESLint direcionado aos arquivos novos e reescritos: aprovado.
- `git diff --check`: aprovado.
- Testes puros da matematica:
  - primeiro estorno: comissao de R$ 100,00 para R$ 70,00, debito R$ 30,00;
  - segundo estorno: comissao de R$ 70,00 para R$ 50,00, incremento R$ 20,00;
  - pagamento de R$ 15,00 contra debito de R$ 50,00: liquido zero e saldo
    remanescente para a proxima competencia;
  - pagamento de R$ 100,00 contra debito de R$ 30,00: liquido R$ 70,00.

## Estado de implantacao

Implementacao corrigida no workspace e aprovada nas validacoes disponiveis.

### Retomada de validacao

- Removidos avisos de lint nos arquivos tocados pela demanda, incluindo
  tipagem de erros e limpeza de variaveis mortas.
- `npm run build`: aprovado novamente, 88 rotas.
- ESLint direcionado aos arquivos da demanda: aprovado sem erros ou avisos.
- `git diff --check`: aprovado.

Ainda nao implantado:

- a migracao 017 nao foi aplicada ao PostgreSQL da VPS;
- nenhum commit ou push foi realizado;
- o Coolify ainda nao recebeu este codigo;
- as tres comissoes de 04/06/2026 continuam em 2,5% na producao ate a migracao.
