# TRACKen — Ambientes de Homologação e Produção

> **Documento vivo.** Registra a separação `sandbox` (Homologação) × `production` da integração FNVJ × TRACKen.
>
> **Última atualização:** 30/09/2026  
> **Estado:** código preparado localmente no branch `coolify-deploy`; migrations, credenciais, URLs e deploy **não aplicados em ambiente real**.  
> **Contrato canônico:** `APINOVA/TRACKEN_SOURCE_OF_TRUTH.md`.

## 1. Decisão

A URL antiga continua sendo **Homologação** e a URL nova será **Produção**. A mesma API de entrada atende os dois ambientes; a credencial usada pela TRACKen define o ambiente e nunca existe fallback entre eles.

| Ambiente | `environment` | Webhook FNVJ → TRACKen |
|---|---|---|
| Produção | `production` | `https://seller.tracken.app.br/api/ferramentas/controle-reputacao/webhooks/fnvj` |
| Homologação | `sandbox` | `https://homologasellercore.tracken.dev.br/api/ferramentas/controle-reputacao/webhooks/fnvj` |

API de entrada comum: `https://fiquenoverdeja.com.br/api/tracken/v1`.

## 2. Estratégia escolhida para as credenciais

**Opção B — preservar a Homologação atual.**

1. Auditar a credencial atual com `list`.
2. Se ela estiver marcada como `production`, reclassificá-la como `sandbox` **antes da migration 025**.
3. Manter nela a URL antiga de Homologação.
4. Criar uma credencial nova `production` e apontá-la para a URL nova.
5. Entregar a credencial nova ao ambiente de produção da TRACKen por canal seguro.

Assim, o histórico existente acompanha a Homologação e a produção começa limpa. A identidade real da credencial atual ainda precisa ser confirmada por consulta somente leitura; nenhuma consulta foi feita nesta implementação.

## 3. O que está implementado localmente

### Banco e isolamento

- `tracken_tickets.environment`, derivado da credencial de entrada e imutável.
- `tracken_outbox.environment`, copiado do ticket e protegido por FK composta.
- Idempotência por `(environment, shipment_id)`.
- `environment` obrigatório, sem default silencioso para produção.
- Um destino ativo configurado por ambiente.
- Migrations separadas:
  - `025_tracken_environment_isolation.sql`: fase aditiva; mantém temporariamente a UNIQUE global para o código antigo continuar funcionando.
  - `026_tracken_environment_cutover.sql`: depois do deploy novo, remove a UNIQUE global e libera IDs iguais nos dois ambientes.

### API e worker

- POST/GET M2M usam o ambiente da credencial autenticada.
- Ticket de outro ambiente responde 404.
- Worker só reivindica eventos do ambiente com destino utilizável.
- Worker e `/tracken/configuracoes` validam a combinação canônica ambiente→URL; alteração direta errada por SQL fica bloqueada.
- Produção nunca aceita localhost. Homologação local exige `TRACKEN_ALLOW_LOCAL_SANDBOX_WEBHOOK=true`.
- Falha de configuração em um ambiente não redireciona nem bloqueia o outro.

### Painel humano

- Produção é a seleção inicial, mas sempre aparece explicitamente.
- Não existe opção “Todos os ambientes”.
- Fila, KPIs, SLA, relatórios, histórico, exportação, transportadoras e atendentes ficam no ambiente escolhido.
- Detalhes, mudança de status e atribuição conferem o ambiente dentro da transação/lock.
- Troca de ambiente cancela/descarta respostas antigas para não exibir Produção sob o selo de Homologação.

### Scripts

- `tracken_credential.mjs create` exige nome e ambiente explícitos; não assume produção.
- `set-environment` reclassifica a credencial atual somente antes da 025.
- `list` mostra expiração, endpoint esperado, validade e usabilidade sem expor secrets/query strings.
- Secret da API vem de `TRACKEN_CREDENTIAL_SECRET`.
- Secret HMAC de saída vem de `TRACKEN_WEBHOOK_SECRET`; não é aceito como argumento do shell.
- `tracken_seed_demo.mjs` funciona somente com `TRACKEN_DEMO_ENVIRONMENT=sandbox` e nunca toca produção.

## 4. Estado comprovado nesta sessão

| Item | Estado |
|---|---|
| Branch/base | `coolify-deploy`, base `37c2392` |
| TypeScript (`npx tsc --noEmit`) | passou |
| ESLint direcionado aos arquivos alterados | passou |
| Sintaxe dos scripts Node | passou |
| Build Next.js | pendente na atualização deste registro |
| Migration 025 | criada, **não aplicada** |
| Migration 026 | criada, **não aplicada** |
| Banco real | **não acessado** |
| Webhook real | **não alterado** |
| Commit/push desta mudança | **não feito** |

## 5. Ordem obrigatória de ativação

### Preparação

- [ ] Confirmar com a TRACKen que a credencial atual pertence à Homologação.
- [ ] Confirmar se o secret HMAC do webhook é o mesmo secret da API ou outro valor.
- [ ] Configurar `TRACKEN_ENCRYPTION_KEY` idêntica à usada pela aplicação.
- [ ] Executar `list` (somente leitura) e conferir ambiente, expiração, URL e usabilidade.
- [ ] Conferir backlog `pending`/`failed` e fazer backup das tabelas `tracken_*`.
- [ ] Preparar commit, artefato e rollback antes de qualquer migration.

### Fase 1 — compatível com código antigo

- [ ] Se necessário, executar `set-environment <api_key_atual> sandbox` antes da 025.
- [ ] Garantir que a credencial sandbox use a URL antiga.
- [ ] Aplicar `025_tracken_environment_isolation.sql`.
- [ ] Rodar as consultas de verificação no final da 025.

A 025 mantém a UNIQUE global de `shipment_id`, então o código antigo continua criando tickets. Ainda não libere o segundo ambiente: IDs iguais continuam bloqueados globalmente até a 026.

### Deploy e corte

- [ ] Publicar o código novo.
- [ ] Verificar API/painel com o ambiente atual.
- [ ] Aplicar `026_tracken_environment_cutover.sql`.
- [ ] Confirmar que só resta a UNIQUE `(environment, shipment_id)`.
- [ ] Criar a credencial `production` nova.
- [ ] Configurar Produção com a URL nova e Homologação com a URL antiga.
- [ ] Conferir `/tracken/configuracoes`: ambos “Utilizável”, HMAC configurado e endpoints corretos.
- [ ] Liberar o ambiente de produção da TRACKen.

### Testes

- [ ] Homologação: criar ticket, consultar, mudar `em_atendimento → negado` com motivo e confirmar HTTP 2xx no webhook antigo.
- [ ] Produção: somente com autorização explícita, repetir no endpoint novo.
- [ ] Confirmar em `tracken_request_log` e `tracken_outbox` que ambiente e endpoint são correspondentes.

## 6. Comandos de referência

Rodar na raiz, somente com `DATABASE_URL` autorizado. Nunca registrar secrets neste arquivo, no Git ou em screenshot.

```powershell
# Somente leitura
node scripts/tracken_credential.mjs list

# ANTES da migration 025: preservar a credencial atual como Homologação
node scripts/tracken_credential.mjs set-environment <api_key_atual> sandbox

# Garantir a URL antiga na credencial sandbox; sem variável, preserva o secret atual
node scripts/tracken_credential.mjs webhook <api_key_sandbox> "https://homologasellercore.tracken.dev.br/api/ferramentas/controle-reputacao/webhooks/fnvj"

# DEPOIS do deploy/026: criar a credencial nova de produção
$env:TRACKEN_CREDENTIAL_SECRET = node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))"
node scripts/tracken_credential.mjs create "Tracken Producao" production

# Só definir se for gravar/substituir o HMAC de saída
$env:TRACKEN_WEBHOOK_SECRET = "<secret-confirmado-com-a-TRACKen>"
node scripts/tracken_credential.mjs webhook <api_key_production> "https://seller.tracken.app.br/api/ferramentas/controle-reputacao/webhooks/fnvj"

Remove-Item Env:TRACKEN_CREDENTIAL_SECRET -ErrorAction SilentlyContinue
Remove-Item Env:TRACKEN_WEBHOOK_SECRET -ErrorAction SilentlyContinue
```

## 7. Reversão

- Antes da 025: código local pode ser descartado; nada mudou no banco.
- Depois da 025 e antes da 026: o código antigo ainda é compatível; corrigir classificação/URL e reaplicar o deploy sem liberar o segundo ambiente.
- Depois da 026: não voltar ao código com `ON CONFLICT (shipment_id)`. Recriar a UNIQUE global só é possível se não houver IDs repetidos entre ambientes.
- Para parar um destino: `webhook <api_key> --clear` ou revogar a credencial.
- Nunca apontar production para Homologação como “fallback”.

## 8. Pendências externas

- Confirmar qual sistema da TRACKen usa a credencial atual.
- Confirmar o secret HMAC de cada webhook.
- Autorizar acesso ao banco real, migrations e deploy.
- Registrar data, responsável e resultado de cada etapa acima.

## 9. Histórico

| Data | Evento |
|---|---|
| 30/09/2026 | TRACKen pediu URL nova de produção e manutenção da URL antiga em Homologação. |
| 30/09/2026 | Isolamento por credencial/ticket/outbox, worker por ambiente e documentação inicial preparados localmente. |
| 30/09/2026 | Rollout dividido em 025/026; URL canônica passou a ser validada em worker/settings; painel e scripts foram isolados por ambiente. Nada aplicado em banco real. |
