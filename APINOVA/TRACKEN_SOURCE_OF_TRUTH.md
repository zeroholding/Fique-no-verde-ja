# FNVJ × TRACKen — Fonte Única de Verdade

> **Documento canônico e vivo.** Este arquivo define o contrato atualmente implementado e confirmado da integração entre Fique no Verde Já (FNVJ) e TRACKen.
>
> **Última atualização:** 25/09/2026  
> **Estado:** homologação ativa; alinhamento de status aplicado no banco de produção em 25/09/2026  
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

O FNVJ valida a credencial, valida cada item, cria o atendimento de forma idempotente por `shipment_id`, registra histórico e cria um evento de outbox.

### 2.2 Saída: FNVJ → TRACKen

Quando o FNVJ recebe ou altera o status de um atendimento, grava um evento em `tracken_outbox`. O worker envia um `POST` para a URL de webhook configurada pela TRACKen.

Eventos implementados e observados:

- `ticket.received`;
- `ticket.status_changed`.

Não presumir que eventos citados em documentos históricos (`ticket.assigned`, `ticket.finished`, pagamentos) estão implementados. Conferir o código e a outbox.

## 3. Ambientes e configuração

### 3.1 Aplicação

- Painel humano: `https://fiquenoverdeja.com.br/tracken`
- Documentação pública: `https://fiquenoverdeja.com.br/tracken/docapi`
- API v1: `https://fiquenoverdeja.com.br/api/tracken/v1`

### 3.2 Webhook de homologação da TRACKen

URL informada pela TRACKen em homologação:

```text
POST https://homologasellercore.tracken.dev.br/api/ferramentas/controle-reputacao/webhooks/fnvj
```

A URL não é segredo. O secret de assinatura é confidencial e não deve ser registrado aqui.

### 3.3 Onde a configuração fica

A URL e o secret do webhook ficam em `tracken_api_credentials`, vinculados à credencial ativa:

- `webhook_url`;
- `webhook_secret` preferencialmente cifrado; o worker ainda aceita texto puro apenas para compatibilidade com registros legados, que devem ser migrados;
- `is_active`;
- `expires_at`;
- `environment`.

A chave de criptografia fica em variável de ambiente. Secret cifrado configurado, mas indecifrável, bloqueia a entrega antes de reivindicar eventos; o sistema não faz downgrade silencioso para webhook sem HMAC. Não colocar secret em documentação, commit, screenshot ou log.

Administração operacional: `scripts/tracken_credential.mjs`. O comando `create` e fail-closed: sem `TRACKEN_ENCRYPTION_KEY` valida ele termina com erro antes do INSERT; com a chave, `secret_encrypted` e obrigatorio e toda credencial nova nasce com `require_signature=true`. Nao existe criacao silenciosa sem HMAC.

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

Eventos terminais (`sent`/`dead`) nao bloqueiam os seguintes. O envio permanece serial dentro de cada lote, mas a garantia por ticket vem do claim no banco, nao de memoria do processo.

### 8.2 Limite fail-closed depois de crash

`attempts` e incrementado no claim para que um processo morto em voo ainda consuma a tentativa. Ao recuperar o lease, se a linha chegar com `attempts > max_attempts`, o worker nao monta o corpo e nao abre HTTP: marca a linha `dead` em transacao e registra `webhook_failed` com a razao de lease/tentativas esgotadas. Portanto nao existe tentativa 9; a reivindicacao excedente serve apenas para fechar de forma duravel o envio abandonado.

A mudança de status não depende da disponibilidade da TRACKen: a transação grava o ticket, histórico e outbox; a entrega ocorre depois.

## 9. Entrada de tickets

A criação aceita item individual ou lote, conforme contrato da rota v1. O resultado é item a item:

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
| `tracken_tickets` | atendimento atual |
| `tracken_ticket_events` | histórico imutável |
| `tracken_outbox` | fila de saída |
| `tracken_request_log` | auditoria HTTP |

### 11.1 Fonte do status de saída

`lib/tracken/tickets.ts::changeTicketStatus` busca o destino em `tracken_status_map` e grava no payload:

```text
tracken_status: target.tracken_status
```

Por isso migration/configuração de `tracken_status_map` muda os próximos webhooks sem mudar o código da transição.

### 11.2 Auditoria

Para verificar uma ocorrência real, consultar ticket, mapa e outbox. Exemplo somente leitura:

```sql
SELECT
  t.shipment_id,
  t.order_id,
  t.status,
  t.denial_reason,
  sm.tracken_status
FROM tracken_tickets t
LEFT JOIN tracken_status_map sm ON sm.code = t.status
WHERE t.order_id = '<order_id>' OR t.shipment_id = '<shipment_id>';
```

```sql
SELECT
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
WHERE t.order_id = '<order_id>' OR t.shipment_id = '<shipment_id>'
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

### 13.1 Preparação

1. confirmar exatamente uma credencial ativa com webhook no ambiente;
2. confirmar URL de homologação;
3. confirmar secret/HMAC sem expô-lo;
4. confirmar transportadora do item de teste;
5. usar pedido/envio explicitamente autorizado para teste.

### 13.2 Cenário de status

1. TRACKen envia ticket;
2. FNVJ registra `recepcionado`;
3. alterar para `em_atendimento`;
4. alterar para `removido` ou `negado`;
5. se `negado`, escolher motivo;
6. conferir outbox;
7. confirmar HTTP 2xx;
8. pedir confirmação do payload recebido pela TRACKen.

### 13.3 Valores esperados depois da migration 024

| Ação | `to_status` | `tracken_status` | `denial_reason` |
|---|---|---|---|
| Recebimento | campo de status conforme evento | `recepcionado` | `null` |
| Em atendimento | `em_atendimento` | `em_atendimento` | `null` |
| Removido | `removido` | `removido` | `null` |
| Negado / venda analisada | `negado` | `negado` | `venda_analisada` |
| Negado / excesso | `negado` | `negado` | `excesso_contato` |
| Negado / bipagem | `negado` | `negado` | `bipagem_distante` |
| Cancelado | `cancelado` | `cancelado` | `null` |

### 13.4 Critério de aprovação

Um teste só está aprovado quando:

- ticket mudou no FNVJ;
- histórico foi gravado;
- outbox contém os campos esperados;
- outbox chegou a `sent`;
- `last_http_status` é 2xx;
- TRACKen confirmou o processamento;
- nenhum secret apareceu em log ou mensagem.

## 14. Diagnóstico rápido

A API `GET /api/tracken/settings` preserva `configured`, `signed` e `destinations` por compatibilidade e também informa `usable`/`blockedReason`, sem expor segredo nem a URL bruta (que pode conter token na query string). O conjunto de destinos exclui credenciais expiradas. O diagnóstico bloqueia zero destino, múltiplos destinos, URL inválida, HTTP fora de localhost e ausência de `webhook_secret` quando `require_signature=true`; a tela mostra `blockedReason` quando o webhook não é utilizável.

### Webhook não saiu

- conferir se a transição criou `tracken_outbox`;
- conferir se existe destino ativo e não expirado;
- conferir se há mais de um destino ativo, situação que bloqueia escolha ambígua;
- disparar/verificar worker de outbox.

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

## 17. Pendências

- publicar o código/documentação desta revisão na branch de deploy;
- executar teste pós-deploy cobrindo `ticket.received` e `em_atendimento -> negado`, confirmar `tracken_status` em português, entrega HTTP 2xx e recebimento pela TRACKen;
- depois da confirmação, marcar a decisão como homologada ponta a ponta;
- dívida não bloqueadora: settings valida presença de HMAC, cardinalidade, expiração e URL, mas a prova criptográfica final continua no `resolveTarget` do worker;
- dívida não bloqueadora: após eliminar todo `webhook_secret` legado em texto puro, remover a compatibilidade e aceitar somente formato cifrado versionado.

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
| Banco/pool | `lib/tracken/db.ts` |
| Migration base | `database/migrations/019_create_tracken_integration.sql` |
| Motivo de negativa | `database/migrations/023_tracken_denial_reason.sql` |
| Alinhamento de status | `database/migrations/024_align_tracken_status_codes.sql` |
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
