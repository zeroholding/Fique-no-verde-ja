# Integração FNVJ + Tracken — Especificação Técnica

> **Documento vivo.** Deve ser atualizado a cada decisão, resposta da Tracken e
> etapa concluída. Nasceu da análise do briefing
> `20260817 - INTEGRAÇÃO FNVJ x TRACKEN.pdf` cruzada com a leitura completa do
> sistema FNVJ atual.
>
> **Status:** análise concluída. Nada implementado.
> **Referência do briefing:** Sebastião | DEV ZERO (FNVJ)
> **Reunião alvo:** 19/08

---

## 1. Sumário executivo

### O que a demanda realmente pede

Três entregas distintas, que costumam ser tratadas como uma só e não são:

1. **Um módulo interno novo de atendimentos** (Kanban/lista) para o atendente
   ver o que a Tracken mandou e mudar status manualmente.
2. **Uma API FNVJ + webhook** para receber atendimentos da Tracken e devolver
   as mudanças de status, com autenticação, mais a documentação para o time
   deles plugar.
3. **Uma integração com o Asaas** (webhook de pagamento e saldo de carteira),
   repassando essas informações para a Tracken **sem** entregar nosso token do
   Asaas.

### A conclusão mais importante da análise

**Isso não é uma extensão do sistema atual. É um módulo novo.**

O sistema FNVJ hoje não tem nenhuma das fundações que essa integração exige:

| Fundação necessária | Existe hoje? |
|---|---|
| Entidade "atendimento" separada de "venda" | **Não** |
| Autenticação máquina-a-máquina (API key/HMAC) | **Não** |
| Receptor de webhook (rota que aceita POST de terceiro) | **Não** |
| Fila/retry para envio de webhook | **Não** |
| Idempotência de eventos recebidos | **Não** |
| Registro de eventos de integração | **Não** |
| Documentação de API (OpenAPI/Swagger) | **Não** |
| Componente de Kanban/board | **Não** |
| Integração de pagamento (qualquer gateway) | **Não** |

A integração com Mercado Livre, que existe, é **pull** (o dashboard puxa quando
o usuário clica), autenticada com o **JWT do próprio usuário**. Não serve de
molde para uma integração server-to-server que recebe chamadas de fora.

Ou seja: o trabalho é maior do que "criar um endpoint". A boa notícia é que o
sistema atual **não precisa mudar** — o módulo novo é aditivo e isolado.

### Bloqueador crítico que precisa ser resolvido antes

Há um **bug de concorrência** em `lib/db.ts` que hoje é tolerável e, com
webhooks, deixa de ser. Detalhado na seção 4.1. **Precisa ser corrigido antes
de qualquer receptor de webhook entrar em produção.**

---

## 2. Interpretação do briefing

### 2.1 Fluxo declarado

```
Tracken → Cliente solicita atendimento → WhatsApp FNVJ → Atendente FNVJ
        → Atualização de status → API → Tracken
```

Traduzindo em responsabilidades de sistema:

```
┌──────────┐   (A) cria atendimento    ┌──────────────────┐
│ TRACKEN  │ ────────────────────────► │  FNVJ            │
│          │                           │  (intermediário) │
│          │ ◄──────────────────────── │                  │
└──────────┘   (B) status mudou        └──────────────────┘
                                              ▲
                                              │ (C) atendente muda status
                                              │     manualmente na tela
                                       ┌──────────────┐
                                       │ Atendente    │
                                       │ (WhatsApp +  │
                                       │  módulo FNVJ)│
                                       └──────────────┘
```

- **(A) Entrada:** a Tracken envia o atendimento para nós. É a Tracken que
  chama a nossa API (ou nós puxamos da deles — **ponto a definir**, ver 11.1).
- **(C) Operação:** o atendimento continua sendo feito no WhatsApp,
  manualmente. Nosso módulo é só **espelho + controle de status**. Não é um
  chat, não é um CRM.
- **(B) Saída:** quando o atendente muda o status, nós **notificamos a Tracken**
  automaticamente.

### 2.1-B Fluxo detalhado pelo cliente (anotação — 18/08)

Esclarecimento passado verbalmente. **Substitui a interpretação genérica acima**
e responde parte das perguntas da seção 11.

```
1. O vendedor (cliente da Tracken) está DENTRO da plataforma Tracken.
2. Ele vê um atraso e decide TERCEIRIZAR a remoção para a FNVJ.
3. Clica em um botão de terceirização dentro da Tracken.
4. Esse clique dispara DUAS AÇÕES SIMULTÂNEAS:

   4a. CHAMA A NOSSA API  ─────────► cria o atendimento
                                     e ele aparece no painel FNVJ

   4b. ABRE O WHATSAPP DA FNVJ ────► o cliente inicia a conversa,
       (link simples, tipo wa.me,    já com os detalhes dos
        SEM API do WhatsApp)         pedidos atrasados

5. O atendimento criado no FNVJ tem um ID.
   Esse ID amarra a conversa do WhatsApp ao registro no painel.

6. O atendente, ao começar a conversa no WhatsApp, encontra o
   atendimento pelo ID e marca no sistema: em andamento,
   concluído, etc.
```

**Pontos que isso define (e que estavam em aberto):**

| Ponto | Definição |
|---|---|
| Direção da entrada | **PUSH da Tracken.** Eles chamam nossa API. Não precisamos fazer pull. |
| WhatsApp | **Link simples, mensagem normal. NÃO precisa de API do WhatsApp.** Continua manual, como hoje. |
| Papel do módulo | Só **monitorar e alterar status**. Não é chat, não é CRM. |
| Escopo do módulo | **Módulo novo e ISOLADO**, exclusivo para esses atendimentos. Não mistura com vendas/pacotes atuais. |
| Gatilho | Ação do **cliente final** dentro da Tracken (não é a Tracken operando). |

**Consequência de projeto — correlação WhatsApp ↔ atendimento:**

Como o WhatsApp é um canal separado e manual, o **ID precisa viajar dentro da
mensagem pré-preenchida** do link do WhatsApp. Sem isso o atendente recebe uma
conversa solta e não sabe qual registro do painel corresponde a ela.

Duas alternativas:

1. A Tracken monta o link do WhatsApp usando o **ID que a nossa API devolve**
   na resposta da criação do atendimento (mais confiável, mas exige que eles
   esperem nossa resposta antes de abrir o WhatsApp).
2. A Tracken usa o **ID dela** na mensagem, e nós resolvemos pelo `tracken_id`
   (mais simples para eles, e já suportado pelo modelo proposto).

**A opção 2 é a recomendada** — não bloqueia a abertura do WhatsApp e o modelo
de dados já guarda `tracken_id` como chave de correlação. Confirmar com eles.

A mensagem pré-preenchida deveria conter, no mínimo: o protocolo/ID, o nome do
vendedor e a lista dos pedidos atrasados.

**Ponto de atenção operacional:** as duas ações podem se dessincronizar. Casos a
tratar no módulo:
- atendimento chegou pela API mas o cliente **nunca** abriu o WhatsApp
  (registro órfão, precisa de visibilidade na tela);
- cliente chamou no WhatsApp mas a API **falhou** (atendimento sem registro —
  precisa de criação manual pelo atendente).

### 2.2 O que o briefing deixa explícito

- Atendimento **continua manual** via WhatsApp. Não automatizar atendimento.
- O módulo interno é **simples**: "Kanban, cards ou lista com botões".
- Status definitivos **ainda serão alinhados** com a Tracken.
- Exemplo inicial de fluxo:
  `ENVIADO PELA TRACKEN → EM ATENDIMENTO → [DEMAIS] → FINALIZADO`
- Preferência da Tracken: **webhook**, quando aplicável.
- Asaas: **não** entregar nosso token principal para a Tracken.

### 2.3 O que o briefing NÃO define (e precisa ser definido)

Estas lacunas são o principal insumo da reunião de 19/08. Detalhadas na
seção 11.

- Quem chama quem na entrada (A): push da Tracken ou pull nosso?
- Lista final de status e quais transições são válidas.
- Qual campo é a chave de identificação do atendimento entre os dois sistemas.
- Que dados vêm no atendimento (cliente, pedido, tipo de problema, prazo?).
- O atendimento da Tracken vira **venda** no FNVJ? Gera **comissão**?
- Quem é o "cliente" desses atendimentos: a Tracken (um cliente único) ou cada
  cliente final dela?
- Como o pagamento se relaciona com o atendimento (pré-pago? pós? por
  atendimento? saldo de carteira?).
- Ambiente de homologação/sandbox da Tracken.

---

## 3. Estado atual do sistema FNVJ (diagnóstico)

Levantamento feito diretamente no código, para embasar as decisões.

### 3.1 Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- PostgreSQL acessado via `pg` (`lib/db.ts`), com um *mock* do client Supabase
  por cima (legado)
- Deploy: GitHub → Coolify na VPS; branch de deploy `coolify-deploy`
- Tailwind 4, tema escuro/glassmorphism

### 3.2 Autenticação hoje

Duas bibliotecas coexistem:

- `lib/auth.ts` — `jose`, payload `{ userId, email, isAdmin }`, expiração 7d
- `lib/server-auth.ts` — `jsonwebtoken`, com `authenticateRequest()` e
  `requireAdmin()`

O token vem do cookie `token` **ou** do header `Authorization: Bearer`.

**Problema de padrão:** a maioria das rotas **replica o código de autenticação
inline** (`const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-..."`
+ `jwt.verify` + `SELECT ... FROM users`), em vez de usar o helper. Isso
aparece em ~25 arquivos.

**O middleware NÃO protege `/api`.** Apesar do matcher casar com `/api/*`, para
esses caminhos ele apenas injeta um header e segue. Toda autorização de API é
feita dentro de cada `route.ts`.

> **Consequência para esta demanda:** qualquer rota nova de webhook fica
> **acessível publicamente por padrão**. A validação tem de ser explícita no
> próprio `route.ts`. Nunca depender do middleware.

### 3.3 Precedentes de autenticação sem JWT de usuário

Já existem padrões aproveitáveis (nenhum é API key de verdade):

| Padrão | Onde | Uso |
|---|---|---|
| JWT com escopo | `api/packages/public-link` → `public-statement` | `jwt.sign({ clientId, scope })`, 30d |
| Slug persistido | `clients.statement_slug` | extrato público por URL |
| Hash de parceiro | `api/parceiros/cupons/[hash]` | rota explicitamente pública |
| Código curto | `users.ml_invite_code` | convite de integração ML |
| **Shared secret em header** | `api/admin/migrate` | `Bearer ${CRON_SECRET}` |

O último é o mais próximo de autenticação de máquina — mas com
`|| "admin123"` como fallback, o que é inseguro.

**Não existe:** tabela de API keys, rate limiting, verificação de assinatura
HMAC, rotação de credencial.

### 3.4 Integração Mercado Livre (o único precedente de integração)

- Credenciais em `mercado_livre_credentials` (`access_token`, `refresh_token`,
  `expires_at`), **em texto puro, sem criptografia**
- OAuth com PKCE; o `state` é um JWT de 1h
- Refresh de token com margem de 5 min, **copiado em ~6 rotas** sem helper
- Chamadas com `fetch` nativo, **sem retry/backoff**
- Padrão de erro é **degradação silenciosa** (`return null` + `console.warn`)
- **É pull:** o sync é disparado pelo dashboard com o JWT do usuário
- **Não há nenhum receptor de webhook no sistema**

### 3.5 Logs e auditoria

Só existe `evidence_logs`, e com problemas:

- Não tem migration; é criada em runtime dentro das rotas (antipadrão)
- `evidence_id` sem foreign key
- `user_id VARCHAR` que aceita a string `'public'`
- `app/api/setup-logs/route.ts` é um **GET sem autenticação** que roda DDL

Não existe log/auditoria genérica de vendas, comissões ou integrações.

### 3.6 Banco: o que existe e o que falta

**Padrão das migrations** (`database/migrations/001..018`):
numeração sequencial, idempotência obrigatória (`IF NOT EXISTS`, blocos
`DO $$`, `ON CONFLICT DO NOTHING`), `gen_random_uuid()`, `TIMESTAMPTZ`,
trigger `update_updated_at_column()`, `COMMENT ON`.
**A próxima migration é a `019`.**

Não há tabela de controle de migrations aplicadas nem runner oficial — a
aplicação é manual (psql/pgAdmin).

**Tabelas relevantes:** `sales`, `sale_items` (com `sale_type` 01/02/03),
`clients` (com `client_type` common/package), `services`,
`service_price_ranges`, `client_packages` (carteira de créditos),
`package_consumptions`, `commissions` e correlatas, `cupons`, `evidences`,
`mercado_livre_credentials`, `mercado_livre_claims`, `ml_delays`.

> **"Atendimento" NÃO existe como entidade.** No FNVJ, "atendimento" é apenas
> o vocabulário de interface para uma **venda** (`sales`). O dashboard conta
> `salesCount` e rotula "Atendimentos". A coisa mais parecida com um ticket é
> `mercado_livre_claims` (espelho de reclamações do ML).
>
> Isso é central: o atendimento da Tracken **não cabe** em `sales` sem
> distorcer o modelo financeiro (uma venda gera comissão, tem valor, tem
> política de preço). Precisa de tabela própria. Ver 6.2.

### 3.7 UI

- Menu lateral: `components/Sidebar.tsx`, arrays `defaultMenuItems` e
  `adminMenuItems`. **Adicionar item = inserir um objeto no array.**
- Componentes reutilizáveis: `Button`, `Card`, `Modal`, `Select`, `Toast`,
  `Sidebar`, `ProtectedRoute`, `CommissionReportTemplate`, `ui/button`
- **Não existe Kanban nem biblioteca de drag-and-drop** (`dnd-kit`,
  `react-beautiful-dnd`) no `package.json`. Listagens são tabelas/cards.

### 3.8 Variáveis de ambiente

Em uso: `JWT_SECRET`, `DATABASE_URL`, `DATABASE_SSL`, `NEXT_PUBLIC_APP_URL`,
`MERCADO_LIVRE_APP_ID`, `MERCADO_LIVRE_SECRET_KEY`, `ALLOWED_SIGNUP_CODES`,
`CRON_SECRET`, além das do Supabase (legado).

**Não existe `.env.example` nem documentação de env.** Há um
`app/api/debug-env/route.ts` (endpoint de debug de env) que deve ser revisto.

### 3.9 Documentação de API

**Nenhuma.** Sem OpenAPI/Swagger, sem coleção Postman, sem doc de endpoints.
Como a demanda exige entregar documentação para a Tracken, isso é trabalho
100% novo.

---

## 4. Riscos e bloqueadores técnicos encontrados

Esta seção é a mais importante do documento. São problemas reais no código
atual que impactam diretamente esta integração.

### 4.1 BLOQUEADOR — `lib/db.ts` compartilha transação entre requisições

**O problema:**

```ts
// lib/db.ts
let transactionClient: PoolClient | null = null;   // ← variável de MÓDULO

export async function query(text, params) {
  if (trimmedText === 'BEGIN') {
    transactionClient = await pool.connect();       // ← global
    ...
  }
  const client = transactionClient || pool;         // ← qualquer query entra
  ...                                               //   na transação alheia
}
```

`transactionClient` é uma **variável de módulo**, ou seja, **compartilhada por
todas as requisições** do mesmo processo Node.

Se duas requisições rodarem ao mesmo tempo e uma delas abrir uma transação:

- as queries da **outra** requisição entram na transação da primeira;
- um `ROLLBACK` da primeira **desfaz o trabalho da segunda**;
- um `COMMIT` da segunda **confirma o trabalho pela metade** da primeira.

**Por que hoje "funciona":** o volume é baixo e as operações transacionais
(criar venda, estornar, excluir) são disparadas manualmente por poucos
usuários. A chance de colisão é pequena — mas já existe.

**Por que com webhook deixa de funcionar:** webhook é chamada concorrente por
natureza. Asaas e Tracken podem disparar vários eventos simultâneos, com
retentativas em rajada. Colisão deixa de ser exceção e passa a ser rotina, com
**risco de corromper dados financeiros**.

**Mitigação obrigatória:** todo código novo desta integração deve usar
`pool.connect()` com client dedicado (`client.query('BEGIN')` …
`client.release()`), **nunca** `query("BEGIN")`. O ideal é refatorar `lib/db.ts`
para expor um `withTransaction(fn)`, mas isso mexe em código em produção e
deve ser tarefa própria, priorizada.

> Precedente: `app/api/sales/refund/route.ts` já usa conexão transacional
> dedicada (feito na demanda de comissões). É o modelo a seguir.

### 4.2 Segurança — segredos com fallback e credenciais no repositório

- `JWT_SECRET` tem fallback `"your-secret-key-change-this"` em ~25 arquivos.
  Se a env faltar, o sistema **passa a assinar tokens com um segredo público**.
- `CRON_SECRET` tem fallback `"admin123"`.
- Tokens do Mercado Livre são gravados **em texto puro**.
- Existem **connection strings de produção hardcoded** em `scripts/*.js` e um
  arquivo `keys.txt` na raiz do repositório.

**Regra para esta integração:** credenciais Asaas e Tracken **somente** via
variável de ambiente ou coluna cifrada, **sem nenhum fallback default**. Se a
env não existir, a rota deve falhar explicitamente (erro 500 controlado), nunca
assumir um valor padrão.

**Recomendação separada:** rotacionar as credenciais já expostas e remover
`keys.txt` do repositório. Fora do escopo desta demanda, mas registrado.

### 4.3 Ausência de idempotência e retry

Webhook exige as duas coisas e o sistema não tem nenhuma:

- **Idempotência (entrada):** provedores reenviam o mesmo evento. Sem controle,
  um pagamento pode ser creditado duas vezes.
- **Retry (saída):** se a Tracken estiver fora do ar quando o atendente muda o
  status, a notificação é **perdida para sempre** no modelo atual
  (`fetch` + `return null` silencioso).

Ambos entram no escopo (seções 6.2 e 9).

### 4.4 Serverless e fila

O Coolify roda a aplicação Next.js como processo Node. Isso permite retry
in-process, mas **não sobrevive a restart/deploy**. Para não perder eventos, a
fila deve ser **persistida em tabela** e processada por um disparador
(endpoint de cron protegido, chamado por agendador externo).

**Decisão pendente:** existe agendador disponível no Coolify (cron/scheduled
task)? Ver 12.4.

### 4.5 Fuso horário

O sistema tem histórico de inconsistência de fuso (`sales-schema.sql` usa
`TIMESTAMP` sem timezone; migrations novas usam `TIMESTAMPTZ`; houve script de
migração de fuso). A demanda de comissões teve de tratar `America/Sao_Paulo`
explicitamente.

**Regra para esta integração:** tudo em `TIMESTAMPTZ`, e toda troca com
Tracken/Asaas em **ISO 8601 com offset** (ex.: `2026-08-19T14:30:00-03:00`).
Nunca enviar ou aceitar data sem fuso.

---

## 5. Arquitetura proposta

### 5.1 Princípio de isolamento

```
┌──────────────────────────────────────────────────────────────┐
│                     SISTEMA FNVJ ATUAL                       │
│  vendas · comissões · pacotes · cupons · ML · evidências     │
│                    (NÃO MUDA NADA)                           │
└──────────────────────────────────────────────────────────────┘
                              ▲
                              │ (integração opcional, decisão 11.5)
                              │
┌──────────────────────────────────────────────────────────────┐
│                   MÓDULO TRACKEN (NOVO)                      │
│                                                              │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────────┐  │
│  │ API pública│  │ Módulo      │  │ Motor de saída       │  │
│  │ (ingestão) │  │ interno     │  │ (webhook + retry)    │  │
│  │            │  │ (Kanban)    │  │                      │  │
│  └────────────┘  └─────────────┘  └──────────────────────┘  │
│         │               │                     │              │
│         └───────────────┴─────────────────────┘              │
│                         │                                    │
│              ┌──────────────────────┐                        │
│              │ tracken_tickets      │                        │
│              │ tracken_events       │                        │
│              │ tracken_outbox       │                        │
│              │ api_credentials      │                        │
│              └──────────────────────┘                        │
└──────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌──────────────────────────────────────────────────────────────┐
│                    MÓDULO ASAAS (NOVO)                       │
│  receptor de webhook · consulta de saldo · espelho de        │
│  cobranças                                                   │
└──────────────────────────────────────────────────────────────┘
```

Tudo novo vive em `app/api/tracken/*`, `app/api/asaas/*`,
`app/dashboard/tracken/*` e `lib/tracken/*`. Nenhuma alteração nas rotas de
venda/comissão/pacote existentes.

### 5.2 Padrão outbox para a saída (webhook para a Tracken)

Não chamar a Tracken direto dentro do request do atendente. Motivo: se a
Tracken estiver lenta ou fora, o atendente fica travado ou a notificação se
perde.

```
Atendente clica "Em atendimento"
        │
        ├─► UPDATE tracken_tickets (status)          ┐ mesma
        ├─► INSERT tracken_events (histórico)        │ transação
        └─► INSERT tracken_outbox (pendente)         ┘
        │
        └─► resposta imediata para a tela ✅

        (assíncrono)
        Worker lê tracken_outbox pendentes
        → POST no webhook da Tracken
        → sucesso: marca entregue
        → falha:   incrementa tentativa, agenda retry (backoff exponencial)
```

Ganhos: a tela nunca travа, nenhuma notificação é perdida, e há trilha de
auditoria de cada tentativa.

### 5.3 Autenticação da nossa API (a Tracken chamando nós)

Proposta: **API key + assinatura HMAC**, que é o padrão de mercado e o que a
Tracken provavelmente já usa.

```
Authorization: Bearer <api_key>
X-FNVJ-Timestamp: 1755561234
X-FNVJ-Signature: sha256=<hex>

assinatura = HMAC_SHA256(secret, timestamp + "." + corpo_bruto)
```

Validações obrigatórias na rota:

1. API key existe, está ativa e não expirou
2. Timestamp dentro de uma janela de ±5 min (barra replay)
3. Assinatura confere (comparação *timing-safe*)
4. Corpo é JSON válido e passa validação de schema
5. Rate limit por credencial

O `secret` é gravado com **hash** no banco (nunca em texto puro) e mostrado uma
única vez na criação.

**Alternativa mais simples** (se a Tracken preferir): apenas API key estática
em header, com allowlist de IP. Menos seguro, mas aceitável se o volume for
baixo e a Tracken não suportar HMAC. **Decisão depende da resposta deles
(11.4).**

### 5.4 Autenticação do webhook do Asaas (Asaas chamando nós)

O Asaas envia um token configurável no header `asaas-access-token`. Validação:

1. Header presente e igual a `ASAAS_WEBHOOK_TOKEN` (comparação timing-safe)
2. `event.id` do Asaas gravado para **idempotência** (rejeitar duplicado)
3. Persistir o evento **bruto** antes de processar (para reprocesso)
4. Responder `200` rápido; processar de forma assíncrona se necessário

> Atenção operacional: o Asaas **desativa a fila de webhook** após uma
> sequência de falhas, e os eventos ficam retidos. Monitoramento é obrigatório.

---

## 6. Modelo de dados proposto (migration 019)

Segue o padrão do projeto: idempotente, `gen_random_uuid()`, `TIMESTAMPTZ`,
trigger de `updated_at`, `COMMENT ON`.

### 6.1 `api_credentials` — credenciais de máquina

```
id               UUID PK
name             TEXT NOT NULL          -- "Tracken Produção"
partner          TEXT NOT NULL          -- 'tracken'
api_key          TEXT NOT NULL UNIQUE   -- identificador público
secret_hash      TEXT NOT NULL          -- hash do secret (nunca texto puro)
scopes           TEXT[] NOT NULL        -- ['tickets:write','tickets:read']
is_active        BOOLEAN DEFAULT true
last_used_at     TIMESTAMPTZ
expires_at       TIMESTAMPTZ
created_by       UUID → users(id)
created_at / updated_at TIMESTAMPTZ
```

### 6.2 `tracken_tickets` — o atendimento

Tabela nova, **separada de `sales`**. Justificativa em 3.6.

```
id                  UUID PK
tracken_id          TEXT NOT NULL UNIQUE   -- id do atendimento na Tracken
                                           -- (chave de correlação, ver 11.2)
status              TEXT NOT NULL          -- status interno FNVJ
tracken_status      TEXT                   -- último status conhecido lá
priority            TEXT
-- dados do atendimento (payload da Tracken)
customer_name       TEXT
customer_document   TEXT
customer_phone      TEXT
order_reference     TEXT                   -- pedido/nota na Tracken
subject             TEXT
description         TEXT
payload_raw         JSONB NOT NULL         -- payload original íntegro
-- operação
assigned_user_id    UUID → users(id)
sale_id             UUID → sales(id)       -- opcional, ver decisão 11.5
-- controle
received_at         TIMESTAMPTZ NOT NULL
first_response_at   TIMESTAMPTZ
finished_at         TIMESTAMPTZ
due_at              TIMESTAMPTZ            -- se a Tracken mandar SLA
created_at / updated_at TIMESTAMPTZ
```

Guardar `payload_raw` é proposital: no começo da integração o contrato muda, e
sem o payload original não há como reprocessar.

### 6.3 `tracken_ticket_events` — histórico imutável

```
id            UUID PK
ticket_id     UUID → tracken_tickets(id) ON DELETE CASCADE
event_type    TEXT NOT NULL     -- 'received' | 'status_changed'
                                -- | 'assigned' | 'note' | 'sync_failed'
from_status   TEXT
to_status     TEXT
actor_type    TEXT NOT NULL     -- 'tracken' | 'user' | 'system'
actor_user_id UUID → users(id)
note          TEXT
metadata      JSONB
created_at    TIMESTAMPTZ
```

Nunca sofre UPDATE/DELETE. É a trilha de auditoria: quem mudou, quando, de que
status para qual.

### 6.4 `tracken_outbox` — fila de saída

```
id              UUID PK
ticket_id       UUID → tracken_tickets(id)
event_type      TEXT NOT NULL
payload         JSONB NOT NULL       -- corpo exato a enviar
status          TEXT NOT NULL        -- 'pending'|'sent'|'failed'|'dead'
attempts        INT DEFAULT 0
max_attempts    INT DEFAULT 8
next_attempt_at TIMESTAMPTZ
last_error      TEXT
last_http_status INT
sent_at         TIMESTAMPTZ
created_at / updated_at TIMESTAMPTZ
```

Backoff exponencial sugerido: 10s, 30s, 2min, 5min, 15min, 1h, 6h, 24h. Depois
de esgotar, vira `dead` e gera alerta na tela.

### 6.5 `tracken_status_map` — mapa de status configurável

```
id              UUID PK
fnvj_status      TEXT NOT NULL UNIQUE
tracken_status   TEXT NOT NULL
label            TEXT NOT NULL      -- rótulo exibido na tela
color            TEXT
sort_order       INT
is_initial       BOOLEAN
is_final         BOOLEAN
allowed_next     TEXT[]             -- transições permitidas
is_active        BOOLEAN DEFAULT true
```

**Por que tabela e não enum no código:** o briefing diz que "os status
definitivos ainda serão alinhados". Com tabela, ajustar o fluxo é configuração,
não deploy. Isso protege o cronograma — mudança de status pela Tracken não
vira retrabalho.

### 6.6 `asaas_webhook_events` — eventos recebidos (idempotência)

```
id             UUID PK
asaas_event_id TEXT NOT NULL UNIQUE   -- chave de idempotência
event_type     TEXT NOT NULL          -- PAYMENT_CONFIRMED, etc.
payload_raw    JSONB NOT NULL
processed      BOOLEAN DEFAULT false
processed_at   TIMESTAMPTZ
process_error  TEXT
received_at    TIMESTAMPTZ
```

### 6.7 `asaas_payments` — espelho de cobranças

```
id                 UUID PK
asaas_payment_id   TEXT NOT NULL UNIQUE
asaas_customer_id  TEXT
external_reference TEXT               -- nosso vínculo (ticket/cliente)
ticket_id          UUID → tracken_tickets(id)
client_id          UUID → clients(id)
billing_type       TEXT               -- PIX | BOLETO | CREDIT_CARD
status             TEXT               -- PENDING | CONFIRMED | RECEIVED ...
value              NUMERIC(12,2)
net_value          NUMERIC(12,2)
due_date           DATE
confirmed_at       TIMESTAMPTZ
payload_raw        JSONB
created_at / updated_at TIMESTAMPTZ
```

### 6.8 `integration_request_log` — auditoria de chamadas

```
id             UUID PK
direction      TEXT NOT NULL     -- 'inbound' | 'outbound'
partner        TEXT NOT NULL     -- 'tracken' | 'asaas'
endpoint       TEXT NOT NULL
http_method    TEXT
http_status    INT
credential_id  UUID → api_credentials(id)
request_body   JSONB             -- com dados sensíveis mascarados
response_body  JSONB
duration_ms    INT
error          TEXT
created_at     TIMESTAMPTZ
```

Sem isso, depurar integração vira adivinhação. Deve ter política de retenção
(ex.: 90 dias) para não crescer sem limite.

---

## 7. API FNVJ — especificação preliminar

> Esta é a base do documento que será entregue à Tracken. Os campos finais
> dependem das respostas da seção 11.

Base: `https://fiquenoverdeja.com.br/api/tracken/v1`

Versionar na URL desde o começo (`/v1`) é decisão consciente: permite evoluir
sem quebrar a integração deles.

### 7.1 Autenticação

Todos os endpoints exigem:

```
Authorization: Bearer <api_key>
X-FNVJ-Timestamp: <unix seconds>
X-FNVJ-Signature: sha256=<HMAC_SHA256(secret, timestamp + "." + body)>
Content-Type: application/json
```

### 7.2 `POST /tickets` — Tracken cria atendimento no FNVJ

Requisição:

```json
{
  "tracken_id": "TRK-2026-000123",
  "created_at": "2026-08-19T10:15:00-03:00",
  "customer": {
    "name": "Nome do Cliente",
    "document": "00000000000",
    "phone": "+5511900000000"
  },
  "order_reference": "PED-99887",
  "subject": "Reclamação de entrega",
  "description": "Texto livre do caso",
  "priority": "normal",
  "due_at": "2026-08-21T18:00:00-03:00",
  "metadata": {}
}
```

Resposta `201`:

```json
{
  "id": "9f1c...",
  "tracken_id": "TRK-2026-000123",
  "status": "enviado_pela_tracken",
  "received_at": "2026-08-19T10:15:02-03:00"
}
```

**Idempotência:** reenvio do mesmo `tracken_id` retorna `200` com o registro
existente, **não** cria duplicado nem devolve erro. Isso torna o retry deles
seguro.

### 7.3 `GET /tickets/{tracken_id}` — consultar situação

```json
{
  "tracken_id": "TRK-2026-000123",
  "status": "em_atendimento",
  "status_label": "Em atendimento",
  "assigned_to": "Nome do Atendente",
  "received_at": "...",
  "first_response_at": "...",
  "finished_at": null,
  "history": [
    { "at": "...", "from": "enviado_pela_tracken",
      "to": "em_atendimento", "by": "Nome do Atendente" }
  ]
}
```

### 7.4 `GET /tickets` — listagem com filtros

Query params: `status`, `from`, `to`, `page`, `page_size` (máx. 100).
Resposta paginada com `total`, `page`, `page_size`, `items[]`.

### 7.5 `GET /statuses` — catálogo de status

Devolve o conteúdo de `tracken_status_map`. Permite que a Tracken descubra os
status disponíveis sem hardcode do lado deles.

### 7.6 `GET /payments/{reference}` e `GET /wallet/balance`

Repasse das informações do Asaas **sem expor nosso token**. Ver seção 8.4.

### 7.7 Webhook FNVJ → Tracken (saída)

Nós chamamos a URL que a Tracken fornecer:

```
POST <url_da_tracken>
X-FNVJ-Event: ticket.status_changed
X-FNVJ-Delivery: <uuid único da tentativa>
X-FNVJ-Timestamp / X-FNVJ-Signature: (assinatura, se eles quiserem validar)
```

```json
{
  "event": "ticket.status_changed",
  "occurred_at": "2026-08-19T11:02:00-03:00",
  "data": {
    "tracken_id": "TRK-2026-000123",
    "from_status": "enviado_pela_tracken",
    "to_status": "em_atendimento",
    "changed_by": "Nome do Atendente",
    "note": null
  }
}
```

Eventos previstos: `ticket.received`, `ticket.status_changed`,
`ticket.assigned`, `ticket.finished`, e os de pagamento
(`payment.confirmed`, `wallet.balance_changed`) se eles quiserem receber por
push.

**Contrato de retry:** consideramos entregue com HTTP `2xx`. Qualquer outro
código ou timeout entra em backoff, até 8 tentativas. Precisamos que a Tracken
trate o `X-FNVJ-Delivery` como chave de idempotência.

### 7.8 Padrão de erros

```json
{
  "error": {
    "code": "INVALID_STATUS_TRANSITION",
    "message": "Transição de 'finalizado' para 'em_atendimento' não permitida",
    "details": { "from": "finalizado", "to": "em_atendimento" }
  }
}
```

| HTTP | Quando |
|---|---|
| 400 | payload inválido |
| 401 | credencial ausente/inválida |
| 403 | credencial sem o escopo necessário |
| 404 | atendimento não encontrado |
| 409 | conflito (ex.: transição inválida) |
| 422 | semanticamente inválido |
| 429 | rate limit |
| 5xx | erro interno (a Tracken deve reenviar) |

---

## 8. Integração Asaas

### 8.1 Escopo pedido

- Confirmação de pagamento
- Status do pagamento
- Identificação do pagamento
- Saldo da carteira

### 8.2 Receptor de webhook

`POST /api/asaas/webhook` — rota pública protegida por token de header.

Eventos relevantes: `PAYMENT_CREATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`,
`PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_DELETED`,
`PAYMENT_CHARGEBACK_REQUESTED`.

Processamento:

1. Valida `asaas-access-token`
2. Grava em `asaas_webhook_events` (rejeita `asaas_event_id` repetido)
3. Faz upsert em `asaas_payments`
4. Se houver vínculo com atendimento, enfileira notificação para a Tracken
5. Responde `200` mesmo em erro de processamento interno — mas registra o erro,
   para o Asaas não desativar a fila

> **Cuidado documentado:** `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` **não são a
> mesma coisa** no Asaas (confirmado ≠ dinheiro liquidado). Precisamos definir
> com o negócio qual dos dois libera o atendimento. Ver 12.1.

### 8.3 Saldo da carteira

`GET /api/asaas/balance` (interno) consultando `/v3/finance/balance`.

Nunca consultar o Asaas a cada request da Tracken: **cachear** (1 a 5 min) para
não estourar rate limit deles.

### 8.4 Repasse para a Tracken

Regra do briefing: **não** entregar nosso token do Asaas.

```
Asaas → (webhook) → FNVJ → (nossa API/webhook) → Tracken
```

A Tracken consome só a nossa API, autenticada com a credencial dela. O token
Asaas nunca sai do servidor FNVJ. Devolvemos uma visão reduzida: identificador,
status, valor, data de confirmação — sem dados sensíveis do gateway.

### 8.5 Necessário do Asaas

- Conta e **ambiente sandbox** para homologar
- API key de produção e de sandbox (via env, sem fallback)
- Token do webhook definido por nós
- Definição de qual conta/carteira representa o saldo relevante

---

## 9. Módulo interno de atendimentos

### 9.1 Tela

Rota: `/dashboard/tracken` (item novo em `defaultMenuItems` do
`components/Sidebar.tsx`).

**Recomendação: começar por LISTA com botões de status, não Kanban.**

Justificativa técnica: não existe biblioteca de drag-and-drop no projeto;
Kanban com DnD é significativamente mais caro em desenvolvimento e teste
(especialmente em mobile) e entrega o mesmo resultado operacional nesta fase. O
briefing aceita explicitamente "lista com botões de alteração de status".

Proposta de evolução:
- **Fase 1:** lista/tabela com filtro por status + botão de mudança de status
- **Fase 2 (opcional):** visão em colunas (board) somente leitura por coluna,
  com mudança por botão — sem drag
- **Fase 3 (opcional):** drag-and-drop, se houver demanda real

### 9.2 Funcionalidades da Fase 1

- Lista de atendimentos com: recebido em, cliente, referência, assunto, status,
  responsável, tempo em aberto
- Filtros: status, período, responsável, busca por `tracken_id`/cliente/pedido
- Ação de mudar status (respeitando `allowed_next`)
- Ação de assumir o atendimento
- Detalhe com o histórico completo e o payload original
- **Indicador de falha de sincronismo:** se o outbox estiver `failed`/`dead`,
  mostrar aviso e botão "reenviar"
- Contador por status no topo

### 9.3 Permissões

- Atendente: vê e movimenta atendimentos
- Admin: tudo, mais reenvio manual e gestão de credenciais/status

Decisão pendente: atendente vê **todos** os atendimentos ou só os seus? (12.5)

---

## 10. Entregáveis

| # | Entregável | Destinatário |
|---|---|---|
| 1 | Migration 019 (tabelas do módulo) | interno |
| 2 | Correção de transação em `lib/db.ts` | interno |
| 3 | Camada de auth de máquina (API key + HMAC) | interno |
| 4 | API `/api/tracken/v1/*` | Tracken |
| 5 | Worker de outbox + retry | interno |
| 6 | Receptor de webhook Asaas | interno |
| 7 | Consulta de saldo + cache | interno |
| 8 | Módulo interno de atendimentos | atendentes |
| 9 | Tela admin de credenciais e status | admin |
| 10 | **Documentação da API (OpenAPI + guia)** | **Tracken** |
| 11 | Coleção Postman / exemplos `curl` | Tracken |
| 12 | `.env.example` documentado | interno |
| 13 | Roteiro de homologação | ambos |

---

## 11. Perguntas para a Tracken

> **Este é o insumo direto da reunião de 19/08.** Sem estas respostas, boa
> parte do desenvolvimento fica em suposição e vira retrabalho.

### 11.1 Direção da integração de entrada — ✅ RESPONDIDA (18/08)

**É PUSH da Tracken.** O botão de terceirização dentro da plataforma deles
chama a nossa API. Não precisamos fazer pull. Ver seção 2.1-B.

Resta confirmar apenas:
- eles esperam a nossa resposta antes de abrir o WhatsApp, ou disparam as duas
  ações em paralelo? (define a alternativa de correlação de ID — ver 2.1-B)
- qual o comportamento de retry deles se a nossa API estiver fora no momento do
  clique? O cliente perde o pedido de terceirização?

### 11.2 Chave de identificação — CRÍTICA

- Qual é o identificador único do atendimento no lado deles? (`id`, `protocolo`,
  `número`?) É estável e imutável?
- Precisamos devolver **algum id nosso** para eles guardarem, ou basta usarmos
  sempre o id deles como chave?

### 11.3 Status — CRÍTICA

- Qual é a **lista definitiva** de status?
- Quais transições são válidas? (ex.: pode voltar de "finalizado"?)
- Existe status de cancelamento, pendência com o cliente, aguardando terceiros?
- Os nomes dos status deles são iguais aos nossos, ou precisamos de tradução?
- Quem é a fonte da verdade se os dois lados mudarem o status ao mesmo tempo?

### 11.4 Segurança e contrato técnico

- Eles preferem **HMAC** ou API key simples?
- Eles conseguem validar nossa assinatura, ou preferem só receber?
- Vão enviar de **IPs fixos** (para allowlist)?
- Qual a URL do webhook deles (produção e homologação)?
- Eles tratam **idempotência** por header de entrega?
- Qual o comportamento de retry deles se a nossa API falhar?

### 11.5 Modelo de negócio (impacta o modelo de dados) — CRÍTICA

- O atendimento vindo da Tracken **gera venda** no FNVJ?
- **Gera comissão** para o atendente? Se sim, com qual política/valor?
  (Hoje comissão é calculada por `sale_type` + data + política.)
- O "cliente" desses atendimentos é a **Tracken** (um cliente único) ou cada
  **cliente final** dela? Precisamos cadastrar os clientes finais em `clients`?
- Esses atendimentos entram nos **dashboards e relatórios** atuais, ou ficam
  num módulo à parte?
- Vão consumir **pacote de créditos** como os clientes atuais?

### 11.6 Volume e SLA

- Quantos atendimentos por dia/mês esperados? (dimensiona rate limit e fila)
- Existe SLA de resposta? A Tracken manda prazo no payload?
- Precisam de notificação em **tempo real** ou minutos são aceitáveis?

### 11.7 Pagamento

- O pagamento é **por atendimento** ou por **saldo/carteira** pré-pago?
- Quem cria a cobrança no Asaas: FNVJ ou Tracken?
- Que informação exatamente eles precisam ver: status da cobrança, saldo
  disponível, extrato?
- "Saldo da carteira" é o saldo da **conta Asaas da FNVJ**, ou o saldo de
  crédito **da Tracken conosco**? (São coisas diferentes — atenção.)
- O pagamento **libera** o atendimento (bloqueia se não pago)?

### 11.8 Homologação

- Existe **ambiente de teste/sandbox** da Tracken?
- Como fazemos testes ponta a ponta sem sujar dados de produção?
- Qual o contato técnico direto do time deles?

---

## 12. Decisões internas pendentes

### 12.1 `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED`?
Qual evento do Asaas caracteriza "pago" para a operação. Confirmado não
significa liquidado.

### 12.2 Atendimento vira venda?
Depende de 11.5, mas a decisão técnica é nossa: manter `tracken_tickets`
totalmente separado (recomendado) ou criar `sales` vinculada.
**Recomendação:** começar separado, com a coluna `sale_id` nullable já prevista
para vincular depois, se necessário. Evita contaminar o modelo financeiro antes
de entender o negócio.

### 12.3 Correção do `lib/db.ts`
Refatorar para `withTransaction()` (mexe em produção) ou apenas usar client
dedicado no código novo?
**Recomendação:** client dedicado no código novo **agora**, refatoração geral
como tarefa própria priorizada.

### 12.4 Como rodar o worker de outbox
Cron do Coolify chamando endpoint protegido? Processo separado? Disparo
oportunista a cada request?
**Recomendação:** endpoint protegido por `CRON_SECRET` (sem fallback) chamado
por agendador, com disparo oportunista como rede de segurança.

### 12.5 Visibilidade dos atendimentos
Todo atendente vê todos, ou só os atribuídos a ele?

### 12.6 Retenção de log
Por quanto tempo guardar `integration_request_log` e `payload_raw`.

### 12.7 Domínio da API
Usar `fiquenoverdeja.com.br/api/tracken/v1` ou subdomínio dedicado
(`api.fiquenoverdeja.com.br`)? O subdomínio é mais profissional e facilita
rate limit/WAF separados, mas exige configuração de DNS/proxy no Coolify.

---

## 13. Estimativa de prazo

> **Premissas:** um desenvolvedor; horas dedicadas a esta demanda; contrato de
> API definido pela Tracken **antes** do início da Fase 3. Estimativa em
> **dias úteis de desenvolvimento**, sem contar espera por terceiros.

| Fase | Escopo | Estimativa |
|---|---|---|
| 0 | Fundação: migration 019, auth de máquina (API key + HMAC), correção de transação, log de integração | 4 – 6 d |
| 1 | Ingestão: `POST /tickets`, idempotência, validação, `GET` de consulta e listagem | 3 – 4 d |
| 2 | Módulo interno (lista + filtros + troca de status + histórico + detalhe) | 4 – 6 d |
| 3 | Saída: outbox, worker, retry com backoff, reenvio manual | 3 – 5 d |
| 4 | **Documentação da API** (OpenAPI, guia, Postman, exemplos) | 2 – 3 d |
| 5 | Asaas: receptor de webhook, idempotência, espelho de cobranças, saldo com cache | 4 – 6 d |
| 6 | Repasse de pagamento/saldo para a Tracken | 2 – 3 d |
| 7 | Homologação ponta a ponta, ajustes de contrato, correções | 3 – 5 d |
| — | **Total** | **25 – 38 dias úteis** |

### Recorte por prioridade da Tracken

A Tracken pediu especificamente duas coisas. Elas podem ser entregues antes do
resto:

| Pedido deles | Fases | Estimativa |
|---|---|---|
| **1. Documentação da API de status (com webhook)** | 0 + 1 + 3 + 4 | **12 – 18 d** |
| **2. Webhook de pagamento + saldo (Asaas)** | 5 + 6 | **6 – 9 d** |

> **Atalho possível para destravar a Tracken:** a **documentação da API**
> (contrato) pode ser escrita e entregue **antes** da implementação estar
> pronta, em **2 a 3 dias**, desde que as perguntas 11.1 a 11.4 sejam
> respondidas. Assim o time deles começa a desenvolver em paralelo, enquanto
> implementamos. Recomendo fortemente esse caminho — é o que mais acelera o
> projeto como um todo.

### O que pode furar o prazo

1. Demora nas respostas da seção 11 (maior risco)
2. Mudança do contrato depois do início (mitigado por status em tabela)
3. Ausência de sandbox da Tracken (testar em produção é lento e arriscado)
4. Aprovação/configuração da conta Asaas
5. Escopo virar Kanban com drag-and-drop (+3 a 5 d)
6. Atendimento virar venda com comissão (+3 a 5 d, e mexe em área sensível)

---

## 14. Fora de escopo

Registrado para evitar mal-entendido:

- Automatizar o atendimento (segue manual, no WhatsApp)
- Integração com a API do WhatsApp
- Chat dentro do sistema FNVJ
- Migrar/alterar o sistema atual de vendas, comissões ou pacotes
- Emissão de nota fiscal
- Conciliação financeira automática
- App mobile
- Refatoração geral do `lib/db.ts` (recomendada, mas tarefa própria)
- Rotação das credenciais já expostas no repositório (recomendada, tarefa
  própria)

---

## 15. Recomendação de sequenciamento

1. **Levar a seção 11 para a reunião de 19/08.** É o que destrava tudo.
2. **Entregar o contrato da API em 2–3 dias** após as respostas, para o time da
   Tracken trabalhar em paralelo.
3. **Corrigir o problema de transação** antes de qualquer webhook em produção.
4. **Fase 0 → 1 → 2** para ter valor operacional cedo (o atendente já usa a
   tela, mesmo antes do webhook de saída existir).
5. **Fase 3** liga a saída automática.
6. **Asaas (5 → 6)** em paralelo, se houver folga, pois é independente.
7. **Homologar com dados de teste** antes de ligar em produção.

---

## 15-B. Descoberta relevante: o modelo de transportadora já existe

Anotação da análise completa do sistema (18/08). **Pode reduzir o escopo.**

O sistema já possui o conceito de **transportadora**: `clients.client_type =
'package'` (o próprio comentário da coluna diz "transportadora"). Hoje é assim
que FLEXBOYS, J3 e outras operam:

1. A transportadora **compra um pacote de créditos** (venda tipo 02) →
   `client_packages` recebe saldo;
2. Cada atendimento **consome 1 crédito** (venda tipo 03) →
   `package_consumptions`, e o registro já guarda **quem é o cliente final
   atendido**;
3. O saldo cai em `client_packages.available_quantity`;
4. A transportadora acompanha por **link de extrato público**
   (`/packages/extrato/[slug]`), sem login.

Ou seja: **carteira pré-paga, consumo por atendimento, cliente final vinculado e
extrato para o parceiro já existem e estão em produção.**

**Implicação sobre "saldo da carteira":** o briefing associa isso ao Asaas, mas
pode ser o saldo de **créditos de atendimento** da transportadora, que já é
calculado hoje. São coisas diferentes e precisam ser desambiguadas
(pergunta 11.7).

**O que muda no escopo se a Tracken for modelada como transportadora:**

| Item | Situação |
|---|---|
| Carteira/saldo de créditos | **Já existe** |
| Consumo por atendimento | **Já existe** (tipo 03) |
| Vínculo com cliente final | **Já existe** |
| Extrato para o parceiro | **Já existe** |
| Faturamento/preço por volume | **Já existe** (`service_price_ranges`) |
| Entidade de atendimento (ticket) | **Falta** |
| Máquina de status | **Falta** |
| API de entrada (push) | **Falta** |
| Webhook de saída | **Falta** |
| Auth máquina-a-máquina | **Falta** |

**Riscos identificados nesse reaproveitamento:**

1. **Saldo negativo é permitido de propósito.** A validação de saldo
   insuficiente está **comentada em dois lugares**: em
   `app/api/sales/route.ts` (`// if (pkgRow.available_quantity < ...)`) e dentro
   da função SQL `consume_package`. Hoje isso é decisão operacional consciente.
   Com um parceiro externo disparando consumo por API, **vira risco de crédito
   descontrolado**. Precisa de decisão de negócio antes do código.
2. **O saldo não é um ledger.** `available_quantity` é coluna mutável, editável
   por rota admin (`/api/packages/update`), e os extratos calculam um "saldo de
   abertura" para fechar a conta. Frágil para conciliação com terceiro.
3. **Uma carteira por (cliente, serviço)**, sem sub-contas. Se a Tracken precisar
   segregar por filial ou por cliente final dela, o modelo não acomoda.
4. **Credencial do Mercado Livre pertence ao atendente (`users`), não ao
   cliente.** Não existe vínculo entre `mercado_livre_credentials` e
   `clients`. Se cada vendedor da Tracken precisar ter a conta ML conectada,
   isso é modelagem nova.
5. **Evidências são indexadas por data**, sem vínculo com venda ou cliente. Se a
   Tracken exigir comprovação por atendimento, o módulo atual não serve.

**Decisão registrada (18/08):** o cliente definiu que será um **módulo novo e
isolado**, exclusivo para gerir esses atendimentos. Portanto o ticket **não**
será uma extensão de `sales`. A eventual ligação com carteira/faturamento fica
como decisão posterior (campo `sale_id` já previsto como nullable em
`tracken_tickets`).

---

## 16. Diário técnico

### Análise inicial (a partir do briefing de 17/08)

- PDF do briefing lido e conferido com o texto passado pelo cliente.
- Sistema FNVJ analisado por completo nos pontos afetados: autenticação,
  middleware, integração ML, logs, migrations, modelo de dados, UI e env vars.
- **Constatado que não existe entidade "atendimento"** separada de `sales`.
  Atendimento é apenas o vocabulário de interface para venda.
- **Constatado que não existe nenhum receptor de webhook** no sistema. A
  integração ML é pull, autenticada com JWT de usuário.
- **Constatado que não existe autenticação máquina-a-máquina.** O mais próximo
  é o `Bearer ${CRON_SECRET}` de `/api/admin/migrate`, com fallback inseguro.
- **Identificado bloqueador crítico:** `lib/db.ts` mantém o client de transação
  em variável de módulo, compartilhada entre requisições concorrentes. Com
  webhooks isso passa a corromper dados. Precisa ser tratado antes do go-live.
- Confirmado que não existe Kanban nem biblioteca de drag-and-drop —
  recomendada a abordagem de lista com botões na Fase 1.
- Confirmado que não existe documentação de API alguma; o entregável 10 é
  trabalho inteiramente novo.
- Próxima migration disponível: **019**.
- Documento criado antes de qualquer alteração de código. **Nada implementado.**

### 18/08 — Leitura completa do sistema e esclarecimento do fluxo

Segunda passada, agora cobrindo o sistema inteiro (clientes, carteira de
créditos, cupons/parceiros, evidências, módulos Mercado Livre, landing,
configurações).

Descobertas que mudam o entendimento:

- **O negócio da FNVJ** é remoção de impacto de reputação no Mercado Livre
  (atrasos, reclamações, cancelados), executada **manualmente** pela equipe
  dentro do painel do ML. O sistema é o ERP de faturamento; ele **não executa** o
  serviço, só dá o diagnóstico (sync de atrasos/reclamações é somente leitura).
- **O modelo de transportadora com carteira pré-paga já existe** e está em
  produção. Detalhado na seção 15-B. Pode reduzir bastante o escopo.
- **Não existe registro anterior à venda.** O formulário da landing não grava
  nada (`action="#"`), o canal real é o WhatsApp flutuante, e o primeiro
  registro no sistema é a **venda já concluída**. Confirma que a entidade de
  atendimento é trabalho novo.
- **`sales` nasce direto como `'confirmada'`** (status hardcoded no INSERT).
  O status `'aberta'` é estado morto. Portanto `sales.status` **não pode** ser
  reaproveitado como máquina de estados do Kanban.
- **Saldo negativo é permitido de propósito** (validação comentada em dois
  lugares). Risco relevante para consumo via API por parceiro externo.

Esclarecimento do fluxo passado pelo cliente (seção 2.1-B):

- entrada é **push** da Tracken, disparada por um botão que o **cliente final**
  clica dentro da plataforma deles;
- o mesmo clique **abre o WhatsApp da FNVJ por link simples** — **não** há
  integração com API do WhatsApp, a conversa segue manual;
- o **ID precisa viajar na mensagem do WhatsApp** para o atendente conseguir
  amarrar a conversa ao registro do painel;
- o módulo será **novo e isolado**, apenas para gerir esses atendimentos;
- pergunta 11.1 (direção da integração) fica **respondida**.

**Nada implementado nesta etapa. Somente documentação.**
