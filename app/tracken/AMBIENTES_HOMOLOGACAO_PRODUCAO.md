# TRACKen — Ambientes de Homologação e Produção

> **Documento vivo.** Registra a separação `sandbox` (Homologação) × `production` da integração FNVJ × TRACKen.
>
> **Última atualização:** 01/10/2026  
> **Estado:** **ativo em produção** desde 01/10/2026 (~22h44, -03:00). Código `843f004` publicado, migrations 025/026 aplicadas, credenciais e webhooks dos dois ambientes configurados e verificados na API real.  
> **Contrato canônico:** `APINOVA/TRACKEN_SOURCE_OF_TRUTH.md`.

## 1. Decisão

A URL antiga continua sendo **Homologação** e a URL nova é **Produção**. A mesma API de entrada atende os dois ambientes; a credencial usada pela TRACKen define o ambiente e nunca existe fallback entre eles.

| Ambiente | `environment` | Credencial | Webhook FNVJ → TRACKen |
|---|---|---|---|
| Produção | `production` | `TRACKen Producao` (nova, 01/10/2026) | `https://seller.tracken.app.br/api/ferramentas/controle-reputacao/webhooks/fnvj` |
| Homologação | `sandbox` | `TRACKen Homologacao` (a que a TRACKen já usava) | `https://homologasellercore.tracken.dev.br/api/ferramentas/controle-reputacao/webhooks/fnvj` |

API de entrada comum: `https://fiquenoverdeja.com.br/api/tracken/v1`.

Nos dois ambientes o webhook é assinado com o secret da própria credencial, no mesmo esquema HMAC da entrada. Os valores nunca são registrados neste arquivo.

## 2. Estratégia aplicada para as credenciais

**Opção B — preservar a Homologação atual.**

1. A auditoria encontrou uma única credencial, marcada `production` pelo default antigo, com webhook na URL de Homologação.
2. Ela foi reclassificada como `sandbox` **antes da migration 025** e renomeada para `TRACKen Homologacao`.
3. A URL antiga de Homologação foi mantida nela.
4. Uma credencial nova `production` foi criada e apontada para a URL nova.
5. A credencial nova é entregue ao ambiente de produção da TRACKen por canal privado.

O histórico existente acompanha a Homologação e a produção começa limpa.

## 3. O que está implementado

### Banco e isolamento

- `tracken_tickets.environment`, derivado da credencial de entrada e imutável.
- `tracken_outbox.environment`, copiado do ticket e protegido por FK composta.
- Idempotência por `(environment, shipment_id)`.
- `environment` obrigatório, sem default silencioso para produção.
- Um destino ativo configurado por ambiente.
- Migrations separadas:
  - `025_tracken_environment_isolation.sql`: fase aditiva; manteve temporariamente a UNIQUE global.
  - `026_tracken_environment_cutover.sql`: removeu a UNIQUE global e liberou IDs iguais nos dois ambientes.

### API e worker

- POST/GET M2M usam o ambiente da credencial autenticada.
- Ticket de outro ambiente responde 404.
- Worker só reivindica eventos do ambiente com destino utilizável.
- Worker e `/tracken/configuracoes` validam a combinação canônica ambiente→URL; alteração direta errada por SQL fica bloqueada.
- Produção nunca aceita localhost. Homologação local exige `TRACKEN_ALLOW_LOCAL_SANDBOX_WEBHOOK=true`.
- Falha de configuração em um ambiente não redireciona nem bloqueia o outro.

### Painel humano

- Produção é a seleção inicial, mas sempre aparece explicitamente. Os tickets de teste ficam em **Homologação**.
- Não existe opção “Todos os ambientes”.
- Fila, KPIs, SLA, relatórios, histórico, exportação, transportadoras e atendentes ficam no ambiente escolhido.
- Detalhes, mudança de status e atribuição conferem o ambiente dentro da transação/lock.
- Troca de ambiente cancela/descarta respostas antigas para não exibir Produção sob o selo de Homologação.

### Scripts

- `tracken_credential.mjs create` exige nome e ambiente explícitos; não assume produção.
- `set-environment` reclassifica uma credencial somente antes da 025 (depois dela o ambiente é imutável por trigger).
- `list` mostra expiração, endpoint esperado, validade e usabilidade sem expor secrets/query strings.
- Secret da API vem de `TRACKEN_CREDENTIAL_SECRET`.
- Secret HMAC de saída vem de `TRACKEN_WEBHOOK_SECRET`; não é aceito como argumento do shell.
- `tracken_seed_demo.mjs` funciona somente com `TRACKEN_DEMO_ENVIRONMENT=sandbox` e nunca toca produção.

## 4. Estado comprovado

| Item | Estado |
|---|---|
| Código | `843f004` publicado na `coolify-deploy` (deploy automático do Coolify) |
| TypeScript, ESLint direcionado, sintaxe dos scripts | passaram antes do commit |
| Backup das tabelas `tracken_*` | feito em JSON, fora do repositório, antes de qualquer escrita |
| Ensaio 025 + 026 com `ROLLBACK` | passou (depois de duas correções na 025) |
| Migration 025 | **aplicada** em 01/10/2026 |
| Migration 026 | **aplicada** em 01/10/2026 |
| Tickets / outbox | 275 tickets e 51 eventos em `sandbox`, zero incoerências |
| Índice de idempotência | só `uq_tracken_tickets_environment_shipment_id` |
| Credenciais | as duas ativas, sem expiração, HMAC obrigatório, webhook utilizável |
| API real (GET assinado) | 200 nos dois ambientes; Homologação lista 275, Produção lista 0 |
| Entrega real de webhook em produção | **pendente** (primeiro ticket da TRACKen em produção) |
| Painel com sessão logada | não testado |

## 5. Ordem de ativação executada

### Preparação

- [x] Auditar a credencial atual (somente leitura): era a de Homologação.
- [x] Confirmar o secret HMAC: o webhook usa o mesmo secret da credencial.
- [x] Confirmar que a `TRACKEN_ENCRYPTION_KEY` local é a da aplicação (decifra a credencial e o hash confere).
- [x] Conferir backlog: nenhum evento `pending`/`failed`.
- [x] Backup das tabelas `tracken_*`.

### Fase 1

- [x] `set-environment <api_key_atual> sandbox` antes da 025.
- [x] Credencial sandbox mantida na URL antiga.
- [x] Aplicar `025_tracken_environment_isolation.sql` e verificar.

### Deploy e corte

- [x] Código novo publicado (antes da 025, por deploy automático; ver histórico).
- [x] Aplicar `026_tracken_environment_cutover.sql`.
- [x] Confirmar que só resta a UNIQUE `(environment, shipment_id)`.
- [x] Criar a credencial `production` nova.
- [x] Configurar Produção com a URL nova e Homologação com a URL antiga.
- [x] Verificar a API real nos dois ambientes.
- [ ] Liberar o ambiente de produção da TRACKen (entregar a credencial nova).

### Testes

- [ ] Homologação: criar ticket, consultar, mudar `em_atendimento → negado` com motivo e confirmar HTTP 2xx no webhook antigo.
- [ ] Produção: primeiro ticket real da TRACKen e webhook 2xx no endpoint novo.
- [ ] Confirmar em `tracken_request_log` e `tracken_outbox` que ambiente e endpoint são correspondentes.

## 6. Comandos de referência

Rodar na raiz, somente com `DATABASE_URL` autorizado. Nunca registrar secrets neste arquivo, no Git ou em screenshot.

```powershell
# Somente leitura
node scripts/tracken_credential.mjs list

# Trocar/limpar destino de uma credencial (sem variável, preserva o secret atual)
node scripts/tracken_credential.mjs webhook <api_key> "<url canônica do ambiente>"
node scripts/tracken_credential.mjs webhook <api_key> --clear

# Revogar uma credencial
node scripts/tracken_credential.mjs revoke <api_key>
```

## 7. Reversão

- Depois da 026: não voltar ao código com `ON CONFLICT (shipment_id)`. Recriar a UNIQUE global só é possível se não houver IDs repetidos entre ambientes.
- Para parar um destino: `webhook <api_key> --clear` ou revogar a credencial.
- Nunca apontar production para Homologação como “fallback”.

## 8. Pendências

- Entregar a credencial de produção à TRACKen e acompanhar o primeiro ticket + webhook em produção.
- Rodar o teste de status em Homologação descrito em 5.

## 9. Histórico

| Data | Evento |
|---|---|
| 30/09/2026 | TRACKen pediu URL nova de produção e manutenção da URL antiga em Homologação. |
| 30/09/2026 | Isolamento por credencial/ticket/outbox, worker por ambiente, rollout 025/026, painel e scripts preparados localmente. |
| 01/10/2026 22h02 | Push de `843f004` na `coolify-deploy` disparou deploy automático antes da 025; módulo Tracken com erro de ~22h05 a ~22h42. Nenhuma chamada da TRACKen registrada no intervalo. |
| 01/10/2026 ~22h40 | Backup, ensaio com `ROLLBACK`, reclassificação da credencial atual, 025 e 026 aplicadas. A 025 recebeu duas correções achadas no ensaio: `ADD COLUMN`/`DROP DEFAULT` separados e classificação do seed demo de 29/08 como sandbox. |
| 01/10/2026 22h44 | Credencial `TRACKen Producao` criada com webhook de produção; API real verificada nos dois ambientes. |
