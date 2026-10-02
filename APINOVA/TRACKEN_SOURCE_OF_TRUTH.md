# FNVJ × TRACKen — Fonte Única de Verdade

> **Documento canônico e vivo.** Este arquivo define o contrato atualmente implementado e confirmado da integração entre Fique no Verde Já (FNVJ) e TRACKen.
>
> **Última atualização:** 30/09/2026
> **Estado:** migration 024 aplicada historicamente; isolamento production/sandbox validado localmente no código e preparado nas migrations 025/026, ainda não aplicado, publicado ou configurado em ambiente real.
> **Responsabilidade:** atualizar este documento na mesma alteração de código, banco ou configuração que mude o contrato.

## 1. Como usar este documento

Antes de responder dúvida, corrigir incidente ou alterar a integração:

1. conferir este documento;
2. conferir o código executável citado no mapa de arquivos;
3. se a dúvida for sobre uma chamada já realizada, consultar o evento real em `tracken_outbox` e o resultado HTTP;
4. distinguir contrato confirmado, comportamento implementado e decisão pendente;
5. atualizar este documento se qualquer um desses pontos mudar.

### 1.1 Ordem de autoridade

Quando houver divergência:

1. decisão escrita e confirmada pela TRACKen no registro de decisões deste documento;
2. contrato canônico deste documento;
3. código executável e migration mais recente;
4. documentação pública `/tracken/docapi`;
5. documentos históricos `PAINEL_FNVJ_TRACKEN.md` e `INTEGRACAO_FNVJ_TRACKEN.md`;
6. mensagens antigas, screenshots e exemplos isolados.

O código e o banco precisam ser corrigidos quando divergirem do contrato confirmado. Um comportamento observado não vira contrato só porque já ocorreu.

## 2. Visão geral e direção dos fluxos

A integração tem duas direções distintas.

### 2.1 Entrada: TRACKen → FNVJ

A TRACKen cria acionamentos no FNVJ pela API de máquina:

```text
POST /api/tracken/v1/tickets
```

O FNVJ valida a credencial, deriva dela o ambiente, valida cada item, cria o atendimento de forma idempotente por `(environment, shipment_id)`, registra histórico e cria um evento de outbox no mesmo ambiente. Production e sandbox podem usar o mesmo `shipment_id` sem compartilhar o ticket.

### 2.2 Saída: FNVJ → TRACKen

Quando o FNVJ recebe ou altera o status de um atendimento, grava um evento em `tracken_outbox` com o ambiente imutavel copiado do ticket. O worker resolve exatamente um destino utilizavel por ambiente e envia o `POST` correspondente. Configuracao quebrada em sandbox nao bloqueia production, e vice-versa; ambiente desconhecido nunca recebe fallback nem e enviado.

Eventos implementados e observados:

- `ticket.received`;
- `ticket.status_changed`.

Não presumir que eventos citados em documentos históricos (`ticket.assigned`, `ticket.finished`, pagamentos) estão implementados. Conferir o código e a outbox.

## 3. Ambientes e configuração

### 3.1 Aplicação e API de entrada

- Painel humano: `https://fiquenoverdeja.com.br/tracken`
- Documentação pública: `https://fiquenoverdeja.com.br/tracken/docapi`
- API v1: `https://fiquenoverdeja.com.br/api/tracken/v1`

A URL da API FNVJ e comum. O ambiente e determinado exclusivamente pela credencial autenticada (`production` ou `sandbox`), nunca por parametro do cliente. POST, GET de lista e GET por `shipment_id` ficam sempre no ambiente dessa credencial; consultar um identificador que existe apenas no outro ambiente devolve 404.

### 3.2 Endpoints de webhook da TRACKen

| Ambiente | Endpoint outbound canonico |
|---|---|
| Production | `https://seller.tracken.app.br/api/ferramentas/controle-reputacao/webhooks/fnvj` |
| Sandbox / Homologacao | `https://homologasellercore.tracken.dev.br/api/ferramentas/controle-reputacao/webhooks/fnvj` |

O script, o worker e o diagnóstico do painel exigem exatamente a URL canônica do ambiente. Alterar a coluna diretamente por SQL não cria fallback: a configuração fica bloqueada antes do claim. Somente sandbox pode usar localhost para desenvolvimento, e ainda exige `TRACKEN_ALLOW_LOCAL_SANDBOX_WEBHOOK=true`; production nunca aceita localhost.

### 3.3 Fronteira de isolamento

- `tracken_tickets.environment` e derivado da credencial de entrada e imutavel;
- a idempotencia e `(environment, shipment_id)`, nao global;
- `tracken_outbox.environment` e copiado do ticket e protegido por FK composta;
- o claim considera apenas eventos de ambientes com target utilizavel;
- o batch maximo continua global por execucao, somando os dois ambientes;
- FIFO, lease e retry continuam por ticket;
- linhas com ambiente ausente/desconhecido falham no schema e, como defesa adicional, nunca sao enviadas pelo worker;
- nao existe fallback de sandbox para production nem de production para sandbox.

### 3.4 Onde a configuração fica

A URL e o secret do webhook ficam em `tracken_api_credentials`, vinculados a uma credencial ativa do mesmo ambiente:

- `webhook_url`;
- `webhook_secret` preferencialmente cifrado; texto puro permanece aceito no worker apenas para compatibilidade legada;
- `is_active`;
- `expires_at`;
- `environment`.

Existe no maximo um destino ativo configurado por ambiente, garantido tambem por indice parcial. Uma credencial expirada com `is_active=true` deve ser revogada ou ter o destino limpo antes da substituicao, pois expiracao nao pode integrar o predicado temporal do indice.

A chave de criptografia fica em variavel de ambiente. Secret cifrado configurado, mas indecifravel, bloqueia somente o ambiente correspondente antes do claim; o sistema nao faz downgrade silencioso para webhook sem HMAC.

Administracao operacional: `scripts/tracken_credential.mjs`. `create` exige nome e ambiente explícitos, `TRACKEN_ENCRYPTION_KEY` e `TRACKEN_CREDENTIAL_SECRET`; não existe default silencioso para production. `set-environment` só funciona antes da migration 025. O comando `webhook` lê um novo secret em `TRACKEN_WEBHOOK_SECRET` (nunca em argumento), preserva o atual quando a variável é omitida, valida ambiente/URL e recusa outro destino ativo no mesmo ambiente.

O painel humano também exige ambiente explícito em toda leitura/mutação: abre em production, nunca oferece “todos” e filtra fila, KPI, SLA, relatório, histórico, exportação e contagens. PATCH de status/atendente valida o ambiente dentro do mesmo lock do ticket.

> **Rollout pendente em duas fases:** aplicar a 025 aditiva, publicar o código composto, aplicar a 026 que remove a UNIQUE global e somente depois liberar a segunda credencial. Este documento não afirma que migrations, URLs ou credenciais tenham sido aplicadas em ambiente real.

## 4. Autenticação

### 4.1 Painel humano

O painel usa o JWT de sessão do FNVJ. A API interna relê o usuário no PostgreSQL e verifica se está ativo.

### 4.2 API de máquina

A TRACKen autentica com credencial de máquina. Formas aceitas dependem do helper `authenticateMachineRequest`, incluindo Bearer e headers específicos.

Nunca enviar ou registrar aqui:

- API key completa;
- secret;
- chave de criptografia;
- cookie de sessão;
- senha de banco.

### 4.3 Assinatura HMAC

Quando existe secret de webhook, o FNVJ envia:

```text
X-FNVJ-Timestamp: <unix-seconds>
X-FNVJ-Signature: sha256=<hmac>
```

A assinatura é calculada com o secret compartilhado sobre a mensagem definida em `lib/tracken/crypto.ts`/`lib/tracken/webhook.ts`. Não enviar o secret puro no header.

## 5. Contrato de status

### 5.1 Decisão vigente desde 25/09/2026

A TRACKen confirmou que o campo `tracken_status` deve usar **os mesmos códigos portugueses publicados na documentação**.

Para `ticket.status_changed`:

```text
to_status      = código interno FNVJ
tracken_status = mesmo código documentado
```

Não usar mais os aliases ingleses `received`, `in_progress`, `removed`, `denied` ou `cancelled` no campo `tracken_status`.

### 5.2 Tabela canônica

| Rótulo | `to_status` | `tracken_status` | Inicial | Final | Conta no SLA |
|---|---|---|---:|---:|---:|
| Recepcionado | `recepcionado` | `recepcionado` | sim | não | sim |
| Em Atendimento | `em_atendimento` | `em_atendimento` | não | não | sim |
| Removido | `removido` | `removido` | não | sim | sim |
| Negado | `negado` | `negado` | não | sim | sim |
| Cancelado | `cancelado` | `cancelado` | não | sim | não |

Fonte no banco: `tracken_status_map`.

Migration da decisão: `database/migrations/024_align_tracken_status_codes.sql`. Alem do mapa, ela normaliza apenas eventos ainda entregaveis (`pending`/`failed`): em `ticket.status_changed`, copia `to_status` para `tracken_status` quando o codigo e um dos cinco canônicos; em `ticket.received`, copia `status`. Eventos `sent`/`dead`, outros tipos e os demais campos do payload nao sao alterados. A migration e idempotente.

### 5.3 Transições

| Origem | Destinos permitidos |
|---|---|
| `recepcionado` | `em_atendimento`, `cancelado` |
| `em_atendimento` | `removido`, `negado`, `cancelado` |
| `removido` | `em_atendimento` (reabertura administrativa) |
| `negado` | `em_atendimento` (reabertura administrativa) |
| `cancelado` | `em_atendimento` (reabertura administrativa) |

O banco guarda `allowed_next`. Não hardcodar outra máquina de estados no cliente.

## 6. Motivos de negativa

`negado` exige exatamente um motivo da lista fechada:

| Código enviado em `denial_reason` | Rótulo enviado em `denial_reason_label` |
|---|---|
| `venda_analisada` | Venda já analisada anteriormente |
| `excesso_contato` | Excesso de contato |
| `bipagem_distante` | Bipagem muito longe do local de entrega |

Fonte executável: `lib/tracken/denial.ts`.

Regras:

- negativa sem motivo: recusada;
- motivo desconhecido: recusado;
- motivo em status diferente de `negado`: recusado;
- ao sair de `negado`, `denial_reason` atual é limpo;
- o histórico preserva o motivo antigo em metadata;
- o webhook de negativa envia código e rótulo.

## 7. Payload de saída

### 7.1 Envelope HTTP

```http
POST <webhook_url_configurada>
Content-Type: application/json
User-Agent: FNVJ-Webhook/1
X-FNVJ-Event: ticket.status_changed
X-FNVJ-Delivery: <uuid>
X-FNVJ-Timestamp: <unix-seconds>
X-FNVJ-Signature: sha256=<hmac>
```

### 7.2 Envelope JSON

```json
{
  "event": "ticket.status_changed",
  "delivery_id": "uuid-da-entrega",
  "occurred_at": "2026-09-25T13:14:45.654Z",
  "attempt": 1,
  "data": {
    "shipment_id": "47937005976",
    "order_id": "2000018290498920",
    "tracken_ref": null,
    "from_status": "em_atendimento",
    "to_status": "negado",
    "status_label": "Negado",
    "tracken_status": "negado",
    "is_final": true,
    "finished_at": "2026-09-25T13:14:45.000Z",
    "changed_by": "Nome do Atendente",
    "ml_claim_id": null,
    "note": null,
    "denial_reason": "venda_analisada",
    "denial_reason_label": "Venda já analisada anteriormente"
  }
}
```

O valor de `tracken_ref` depende do item recebido da TRACKen.

### 7.3 Semântica dos identificadores

- `delivery_id`: identifica a entrega do webhook e deve ser usado para deduplicar reenvios;
- `shipment_id`: envio do marketplace e idempotência do acionamento;
- `order_id`: venda/pedido associado;
- `tracken_ref`: referência do atendimento no sistema TRACKen, quando fornecida;
- `event`: tipo do fato;
- `occurred_at`: momento em que o fato foi criado no FNVJ; permite que o consumidor detecte e descarte evento antigo, mas essa proteção depende da implementação da TRACKen e ainda precisa ser confirmada;
- `attempt`: número da tentativa atual.

## 8. Retry, ordem e idempotência

O evento é entregue quando o destino responde qualquer HTTP `2xx`.

Política atual:

- rede, timeout, HTTP 408, 429 e 5xx: retentáveis;
- demais 4xx: falha permanente/dead conforme implementação;
- máximo padrão: 8 tentativas;
- reenvio mantém o mesmo `delivery_id`;
- a TRACKen deve ignorar duplicatas pelo `delivery_id`;
- `occurred_at` continua permitindo ao consumidor rejeitar uma entrega antiga.

### 8.1 FIFO global por ticket

O claim usa `FOR UPDATE SKIP LOCKED` e so pode selecionar uma candidata quando nao existe predecessor do mesmo `ticket_id`, com status `pending`/`failed` e `(created_at,id)` menor. O predecessor bloqueia mesmo quando `next_attempt_at` esta no futuro por lease ou backoff. Assim, apenas o evento nao terminal mais antigo de cada ticket pode ser reclamado, inclusive entre dispatches concorrentes; tickets diferentes continuam progredindo.

Eventos terminais (`sent`/`dead`) nao bloqueiam os seguintes. O envio permanece serial dentro de cada lote, mas a garantia por ticket vem do claim no banco, nao de memoria do processo. O claim recebe apenas a lista de ambientes com target utilizavel e aplica um unico limite total; por isso uma configuracao quebrada nao consome tentativas nem impede o outro ambiente de progredir.

### 8.2 Limite fail-closed depois de crash

`attempts` e incrementado no claim para que um processo morto em voo ainda consuma a tentativa. Ao recuperar o lease, se a linha chegar com `attempts > max_attempts`, o worker nao monta o corpo e nao abre HTTP: marca a linha `dead` em transacao e registra `webhook_failed` com a razao de lease/tentativas esgotadas. Portanto nao existe tentativa 9; a reivindicacao excedente serve apenas para fechar de forma duravel o envio abandonado.

A mudança de status não depende da disponibilidade da TRACKen: a transação grava o ticket, histórico e outbox; a entrega ocorre depois.

## 9. Entrada de tickets

A criação aceita item individual ou lote, conforme contrato da rota v1. A credencial define o ambiente, e a chave idempotente e `(environment, shipment_id)`: retry no mesmo ambiente retorna `duplicated`, enquanto o mesmo `shipment_id` pode existir de forma independente no outro. O resultado é item a item:

- `created`: criado;
- `duplicated`: `shipment_id` já existia;
- `rejected`: item recusado com código/mensagem.

HTTP 200 não significa que todos os itens entraram. Sempre conferir `results`.

Limites vigentes devem ser conferidos em `app/tracken/docapi/page.tsx` e na validação da rota.

Datas (`sale_date`, `shipping_deadline` e `shipped_at`) exigem datetime ISO 8601 com hora e offset explícito `Z` ou `±HH:MM`. Segundos e fração são opcionais; date-only e datetime sem offset são rejeitados antes da conversão para `Date`, evitando interpretação pelo fuso do servidor.

## 10. Transportadoras

Transportadoras ficam em `tracken_carriers`. O código/nome recebido é associado a uma transportadora existente quando possível; quando não há correspondência nos índices ativos, o helper tenta inserir dentro do savepoint do item e retorna separadamente a linha resolvida e `created`.

Somente `created=true`, isto e, somente quando o INSERT deste item realmente venceu, autoriza a metadata `carrier_auto_created`, a mensagem de autocadastro e o cleanup de linha órfã no caminho `duplicated`. Se o `ON CONFLICT` encontrar linha preexistente, inclusive inativa, ela e reutilizada e indexada para o restante do lote sem ser anunciada como autocadastrada e sem risco de ser apagada pelo duplicate. O erro `UNKNOWN_CARRIER` pertence ao comportamento antigo e não deve ser prometido como resposta atual.

A interface administrativa permite ajustar nome, cor e atividade do cadastro realmente criado automaticamente. Conferir `lib/tracken/tickets.ts` antes de afirmar comportamento.

Transportadoras usadas na homologação incluem `FLEX_BOYS` e `TRANSMOTO`. Não tratar essa lista como enum fechado sem conferir o banco.

## 11. Persistência

Tabelas principais:

| Tabela | Responsabilidade |
|---|---|
| `tracken_carriers` | transportadoras |
| `tracken_status_map` | status, vocabulário e transições |
| `tracken_api_credentials` | autenticação e webhook |
| `tracken_tickets` | atendimento atual, com ambiente imutavel e idempotencia composta |
| `tracken_ticket_events` | histórico imutável |
| `tracken_outbox` | fila de saída com snapshot/FK do ambiente do ticket |
| `tracken_request_log` | auditoria HTTP |

### 11.1 Migrations 025/026 e compatibilidade de escrita

`025_tracken_environment_isolation.sql` é aditiva: remove o default production da credencial, adiciona `environment` sem default a tickets/outbox, faz backfill credencial → ticket → outbox e aborta se alguma linha não puder ser classificada. Aplica `NOT NULL`, checks, chave composta, FK composta, índices e triggers de imutabilidade, mas mantém temporariamente a UNIQUE global de `shipment_id`. Assim, o código antigo e o novo permanecem compatíveis durante o deploy.

Depois do código novo estar publicado, `026_tracken_environment_cutover.sql` verifica a chave composta e remove somente a UNIQUE global. A partir daí, o mesmo `shipment_id` pode existir uma vez em cada ambiente e não se pode voltar ao SQL antigo `ON CONFLICT (shipment_id)`.

A 025 também valida a URL canônica das credenciais já configuradas e limita a um destino ativo por ambiente. Nenhuma das duas migrations foi executada nesta alteração local.

### 11.2 Fonte do status de saída

`lib/tracken/tickets.ts::changeTicketStatus` busca o destino em `tracken_status_map` e grava no payload:

```text
tracken_status: target.tracken_status
```

Por isso migration/configuração de `tracken_status_map` muda os próximos webhooks sem mudar o código da transição.

### 11.3 Auditoria

Para verificar uma ocorrência real, consultar ticket, mapa e outbox. Exemplo somente leitura:

```sql
SELECT
  t.environment,
  t.shipment_id,
  t.order_id,
  t.status,
  t.denial_reason,
  sm.tracken_status
FROM tracken_tickets t
LEFT JOIN tracken_status_map sm ON sm.code = t.status
WHERE t.environment = '<production|sandbox>'
  AND (t.order_id = '<order_id>' OR t.shipment_id = '<shipment_id>');
```

```sql
SELECT
  o.environment,
  o.event_type,
  o.status,
  o.last_http_status,
  o.attempts,
  o.payload->>'to_status' AS to_status,
  o.payload->>'tracken_status' AS tracken_status,
  o.payload->>'denial_reason' AS denial_reason,
  o.payload->>'denial_reason_label' AS denial_reason_label,
  o.created_at,
  o.sent_at
FROM tracken_outbox o
JOIN tracken_tickets t ON t.id = o.ticket_id
WHERE o.environment = '<production|sandbox>'
  AND (t.order_id = '<order_id>' OR t.shipment_id = '<shipment_id>')
ORDER BY o.created_at DESC;
```

Nunca copiar URL/senha do banco para este documento.

## 12. Evidência de homologação

### 12.1 Pedido `2000018290498920`

Envio: `47937005976`.

Evento real antes do alinhamento 024:

```text
event_type: ticket.status_changed
outbox status: sent
HTTP: 200
attempts: 1
to_status: negado
tracken_status: denied
denial_reason: venda_analisada
denial_reason_label: Venda já analisada anteriormente
```

Esse evento provou a divergência entre documentação e mapa antigo. A TRACKen respondeu em 25/09/2026:

> Pode mandar como `negado` mesmo. Os outros status podem seguir o que está na documentação.

Decisão resultante: alinhar todos os valores de `tracken_status` ao código português documentado. Eventos antigos não são reescritos; webhooks criados depois da aplicação da migration 024 usam o novo contrato.

### 12.2 Sequência confirmada

Para o mesmo pedido, a outbox registrou e entregou:

1. `ticket.received` com `tracken_status` antigo `received`;
2. `ticket.status_changed` para `em_atendimento` com alias antigo `in_progress`;
3. `ticket.status_changed` para `negado` com alias antigo `denied` e motivo `venda_analisada`.

Todos foram entregues com HTTP 200 na primeira tentativa. Essa sequência é evidência histórica, não o contrato novo.

## 13. Teste ponta a ponta

### 13.1 Rollout seguro do isolamento por ambiente

1. confirmar que a credencial atual pertence à Homologação e, antes da 025, reclassificá-la como `sandbox` se necessário;
2. aplicar `025_tracken_environment_isolation.sql` e verificar o backfill; a UNIQUE global continua presente;
3. publicar o código que usa `ON CONFLICT (environment, shipment_id)` e exige ambiente no painel;
4. aplicar `026_tracken_environment_cutover.sql` e confirmar que só resta a UNIQUE composta;
5. criar/configurar a credencial production nova com a URL nova e manter sandbox na URL antiga;
6. confirmar `webhook.byEnvironment`, `outbox.byEnvironment`, constraints e backlog;
7. liberar cada ambiente e testar Homologação antes de Produção.

A divisão elimina a janela em que o código publicado ficaria sem índice compatível: a 025 aceita os dois SQLs; a 026 só roda depois do deploy. Até a 026, não se libera o segundo ambiente porque a UNIQUE global ainda impede IDs iguais.

Nenhuma dessas etapas foi executada nesta alteração local. Em especial, nenhum banco real foi acessado e os endpoints continuam pendentes de configuração operacional.

### 13.2 Preparação

1. escolher explicitamente `production` ou `sandbox` para o teste;
2. confirmar exatamente uma credencial/target utilizavel nesse ambiente;
3. confirmar que o endpoint sanitizado corresponde ao canonico do ambiente;
4. confirmar secret/HMAC sem expo-lo;
5. confirmar transportadora do item de teste;
6. usar pedido/envio explicitamente autorizado para teste e inexistente no ambiente escolhido.

### 13.3 Cenário de status

1. TRACKen envia ticket;
2. FNVJ registra `recepcionado`;
3. alterar para `em_atendimento`;
4. alterar para `removido` ou `negado`;
5. se `negado`, escolher motivo;
6. conferir outbox;
7. confirmar HTTP 2xx;
8. pedir confirmação do payload recebido pela TRACKen.

### 13.4 Valores esperados depois da migration 024

| Ação | `to_status` | `tracken_status` | `denial_reason` |
|---|---|---|---|
| Recebimento | campo de status conforme evento | `recepcionado` | `null` |
| Em atendimento | `em_atendimento` | `em_atendimento` | `null` |
| Removido | `removido` | `removido` | `null` |
| Negado / venda analisada | `negado` | `negado` | `venda_analisada` |
| Negado / excesso | `negado` | `negado` | `excesso_contato` |
| Negado / bipagem | `negado` | `negado` | `bipagem_distante` |
| Cancelado | `cancelado` | `cancelado` | `null` |

### 13.5 Critério de aprovação

Um teste só está aprovado quando:

- ticket mudou no FNVJ;
- histórico foi gravado;
- outbox contém os campos esperados;
- outbox chegou a `sent`;
- `last_http_status` é 2xx;
- TRACKen confirmou o processamento;
- nenhum secret apareceu em log ou mensagem.

## 14. Diagnóstico rápido

A API `GET /api/tracken/settings` preserva os agregados legados `configured`, `signed`, `destinations`, `usable` e `blockedReason`. Tambem informa `webhook.byEnvironment` e `outbox.byEnvironment`, e cada item recente da outbox inclui `environment`. O endpoint exibido por ambiente contem somente `origin + pathname`: segredo, userinfo e query string nao atravessam para o navegador.

O diagnostico valida cada ambiente isoladamente. Zero/multiplos destinos, URL/protocolo invalido ou HMAC ausente bloqueiam somente aquele ambiente; o outro pode continuar sendo entregue. A verificacao de decifragem final permanece no worker.

### Webhook não saiu

- conferir se a transição criou `tracken_outbox` no ambiente esperado;
- conferir `webhook.byEnvironment[environment]` e o endpoint sanitizado;
- conferir se existe exatamente um destino ativo e nao expirado no ambiente;
- conferir se o ambiente esta entre os elegiveis do worker; desconhecido nao tem fallback;
- disparar/verificar worker de outbox apenas quando formalmente autorizado.

### Webhook falhou

- conferir `last_http_status`, `last_error`, `attempts` e resposta truncada;
- 401/403: assinatura/credencial no destino;
- 404: URL incorreta;
- 408/429/5xx: aguardar retry;
- 400/422: comparar payload com contrato.

### Status divergente

- consultar `tracken_status_map`;
- conferir migration 024;
- comparar `to_status` e `tracken_status` na outbox;
- não confiar apenas na label visual.

### Negativa sem motivo

- conferir body PATCH (`denialReason`);
- conferir validação em `lib/tracken/denial.ts`;
- conferir coluna `tracken_tickets.denial_reason`;
- conferir payload da outbox.

## 15. Checklist obrigatório de mudança

Ao alterar a integração:

- [ ] atualizar código;
- [ ] atualizar migration/configuração, se houver dado persistido;
- [ ] atualizar este documento;
- [ ] atualizar `/tracken/docapi`;
- [ ] atualizar exemplos de payload;
- [ ] validar TypeScript e lint;
- [ ] validar transição no banco de teste/produção autorizada;
- [ ] conferir outbox e HTTP;
- [ ] confirmar com TRACKen;
- [ ] registrar decisão e data;
- [ ] garantir que nenhum segredo foi versionado.

## 16. Registro de decisões

### 25/09/2026 — códigos de `tracken_status`

**Contexto:** documentação pública listava códigos portugueses, enquanto o mapa do banco enviava aliases ingleses.

**Evidência:** pedido `2000018290498920` enviou `to_status=negado` e `tracken_status=denied`.

**Confirmação TRACKen:** enviar `negado`; demais status seguem a documentação.

**Decisão:** `tracken_status` passa a ser igual a `code` para os cinco status.

**Implementação:** migration 024, aplicada no banco de produção em 25/09/2026. A execução atualizou cinco linhas de `tracken_status_map`; não havia eventos `pending/failed` a converter. A verificação posterior confirmou `code = tracken_status` nos cinco registros.

**Retroatividade:** não reescrever eventos históricos já enviados.

### 25/09/2026 — revisão dos findings de robustez

**Achados corrigidos no código:** claim FIFO global por ticket mesmo durante lease/backoff; fechamento fail-closed pós-crash sem HTTP além do máximo; normalização idempotente dos payloads `pending/failed` na migration 024; criação de credencial sempre cifrada e com HMAC obrigatório; validação de datas somente com datetime e offset; distinção entre transportadora realmente criada e linha existente/inativa; diagnóstico de settings para expiração, cardinalidade, URL, HTTPS e assinatura.

**Garantias operacionais:** o claim mantém `FOR UPDATE SKIP LOCKED`; nenhum evento `sent/dead` é reescrito pela migration; duplicate nunca limpa transportadora preexistente; `blockedReason` não contém segredo; a linha pós-crash é encerrada em `dead` e ganha histórico `webhook_failed`.

**Escopo e validação desta revisão:** build Next 16 concluído com 97 rotas/páginas, TypeScript e ESLint aprovados, migration 024 validada em banco temporário com mapa + payloads pending/failed/sent e aplicada em produção após confirmação de uma credencial ativa, não expirada, com HMAC obrigatório e secrets presentes. A fila estava sem eventos `pending/failed` no momento da aplicação.

### 25/09/2026 — aplicação da migration 024 em produção

**Antes:** `received`, `in_progress`, `removed`, `denied`, `cancelled`.

**Depois:** `recepcionado`, `em_atendimento`, `removido`, `negado`, `cancelado`.

**Resultado SQL:** cinco linhas atualizadas no mapa, zero eventos pendentes/fracassados convertidos e verificação `code = tracken_status` verdadeira para todos os status.

**Impacto:** somente eventos criados depois da aplicação usam o novo mapa; eventos `sent/dead` históricos permanecem intactos.

**Rollback, se formalmente autorizado:** restaurar os cinco aliases antigos no mapa. Não executar rollback por tentativa; confirmar primeiro o contrato com a TRACKen.

### Isolamento production/sandbox — preparado, rollout pendente

**Contexto:** credenciais ja distinguiam `production|sandbox`, mas tickets/outbox nao persistiam o ambiente, `shipment_id` era UNIQUE global, GETs M2M cruzavam dados e o worker exigia um unico destino global.

**Decisao:** persistir ambiente imutavel no ticket/outbox, usar idempotencia composta, filtrar leituras pela credencial e resolver exatamente um target por ambiente sem fallback.

**Implementacao local:** tipo compartilhado, backend M2M, worker com validação canônica, painel humano isolado, settings/UI, scripts seguros e migrations `025_tracken_environment_isolation.sql` + `026_tracken_environment_cutover.sql`.

**Decisão operacional:** preservar a URL/credencial atual como Homologação (`sandbox`) e criar uma credencial nova para Produção (`production`). A classificação real da credencial atual ainda precisa ser auditada antes da 025.

**Estado operacional:** PENDENTE. As migrations 025/026 não foram executadas, o código não foi deployado e endpoints/secrets não foram aplicados. Não interpretar este registro como confirmação de produção.

## 17. Pendências

- auditar a credencial atual e reclassificá-la como sandbox antes da 025, se necessário;
- aplicar e verificar a migration 025 aditiva no ambiente autorizado;
- publicar o código na branch/deploy autorizados;
- aplicar a migration 026 e verificar a remoção da UNIQUE global;
- criar/configurar exatamente um target production novo e manter o sandbox no endpoint antigo, com secrets confirmados pela TRACKen;
- verificar constraints, `webhook.byEnvironment`, `outbox.byEnvironment` e backlog antes de liberar os dois ambientes;
- executar teste pos-deploy isolado em sandbox cobrindo `ticket.received` e `em_atendimento -> negado`, confirmar `tracken_status`, HTTP 2xx e recebimento pela TRACKen;
- executar teste production apenas com autorizacao explicita; depois da confirmacao, registrar o estado real sem retroagir este documento;
- divida nao bloqueadora: settings valida presenca de HMAC, cardinalidade, expiracao e URL, mas a prova criptografica final continua no worker;
- divida nao bloqueadora: apos eliminar todo `webhook_secret` legado em texto puro, remover a compatibilidade e aceitar somente formato cifrado versionado.

## 18. Mapa de arquivos

| Assunto | Arquivo |
|---|---|
| Documentação pública | `app/tracken/docapi/page.tsx` |
| Entrada v1 | `app/api/tracken/v1/tickets/route.ts` |
| Consulta individual | `app/api/tracken/v1/tickets/[shipmentId]/route.ts` |
| Catálogo de status | `app/api/tracken/v1/statuses/route.ts` |
| Alteração de ticket | `app/api/tracken/tickets/[id]/route.ts` |
| Regra/transição/outbox | `lib/tracken/tickets.ts` |
| Motivos de negativa | `lib/tracken/denial.ts` |
| Entrega de webhook | `lib/tracken/webhook.ts` |
| Assinatura/cripto | `lib/tracken/crypto.ts` |
| Autenticação | `lib/tracken/auth.ts` |
| Tipos/ambientes compartilhados | `lib/tracken/types.ts`, `lib/tracken/environments.ts` |
| Banco/pool | `lib/tracken/db.ts` |
| Migration base | `database/migrations/019_create_tracken_integration.sql` |
| Motivo de negativa | `database/migrations/023_tracken_denial_reason.sql` |
| Alinhamento de status | `database/migrations/024_align_tracken_status_codes.sql` |
| Isolamento por ambiente (aditivo) | `database/migrations/025_tracken_environment_isolation.sql` |
| Corte da UNIQUE global | `database/migrations/026_tracken_environment_cutover.sql` |
| Gestão de credencial | `scripts/tracken_credential.mjs` |
| Diagnóstico de configurações | `app/api/tracken/settings/route.ts` |

## 19. Regra de segurança

Este documento pode conter URLs públicas, nomes de campos, IDs de teste autorizados e consultas sem credenciais. Nunca deve conter:

- senha de banco;
- URL de banco com senha;
- API secret;
- webhook secret;
- chave de criptografia;
- JWT/cookie;
- token Mercado Livre;
- dados pessoais desnecessários.
