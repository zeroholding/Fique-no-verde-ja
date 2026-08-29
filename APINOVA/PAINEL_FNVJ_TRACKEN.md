# PAINEL FNVJ × TRACKEN — Documento Mestre

> **ESTE É O DOCUMENTO PRINCIPAL DO PROJETO.**
> Ler antes de qualquer implementação. Atualizar a cada decisão, resposta da
> Tracken e etapa concluída.
>
> **Status:** especificação. **Nada implementado.**
> **URL do painel:** `https://fiquenoverdeja.com.br/tracken`
> **Documento complementar:** `APINOVA/INTEGRACAO_FNVJ_TRACKEN.md` (análise
> técnica do sistema atual — segue válido)
> **Briefing original:** `APINOVA/20260817 - INTEGRAÇÃO FNVJ x TRACKEN.pdf`

---

## ÍNDICE

1. [O que é a Tracken](#1-o-que-é-a-tracken)
2. [O negócio da parceria](#2-o-negócio-da-parceria)
3. [O fluxo completo](#3-o-fluxo-completo)
4. [Decisões já tomadas](#4-decisões-já-tomadas)
5. [Os dados que recebemos](#5-os-dados-que-recebemos)
6. [Status do atendimento](#6-status-do-atendimento)
7. [Modelo de dados](#7-modelo-de-dados)
8. [API FNVJ (a Tracken chamando nós)](#8-api-fnvj)
9. [Webhook FNVJ → Tracken](#9-webhook-fnvj--tracken)
10. [O painel: telas e comportamento](#10-o-painel-telas-e-comportamento)
11. [Design system](#11-design-system)
12. [Autenticação e login compartilhado](#12-autenticação-e-login-compartilhado)
13. [Riscos e bloqueadores](#13-riscos-e-bloqueadores)
14. [Fases de implementação e prazo](#14-fases-de-implementação-e-prazo)
15. [Perguntas abertas](#15-perguntas-abertas)
16. [Diário do projeto](#16-diário-do-projeto)

---

## 1. O QUE É A TRACKEN

Plataforma SaaS de gestão logística (`tracken.com.br`), usada pelas
transportadoras **FLEX** do Brasil. Integra direto com **Mercado Livre, Shopee,
Magalu e Amazon**.

Números divulgados por eles:
- +41.322.299 pedidos realizados
- +23.256 lojas virtuais e físicas
- +5.817 entregadores
- +23 postos de coleta e entrega

Cobrança deles: **R$ 0,25 por etiqueta bipada**. Sem mensalidade, sem fidelidade.

Módulos: gestão de entregas, app mobile (vendedor / entregador / gestor),
faturamento automatizado, painel de performance, integrações com ERPs.

Público: **vendedores** (sellers), **transportadoras**, **marketplaces** e
**motoristas**.

**Por que isso importa:** a Tracken já tem, dentro do painel dela, todos os dados
do pedido do Mercado Livre — inclusive **ID de envio, nº da venda, comprador,
seller e limite de envio**. Exatamente o que a FNVJ precisa para abrir o chamado
de remoção de atraso.

---

## 2. O NEGÓCIO DA PARCERIA

- Dentro do painel da Tracken, o usuário (transportadora ou seller) vê uma venda
  **atrasada**.
- Ele quer **terceirizar** a remoção desse atraso para a FNVJ.
- Clica no botão **"Fique no Verde"**, que estará em cada venda.
- Nossa API recebe os dados e o atendimento cai no **nosso painel novo**.
- A FNVJ abre o chamado no Mercado Livre **do jeito que já faz hoje**
  (manualmente, dentro do painel do ML).
- O atendente atualiza o status no nosso painel.
- A Tracken é notificada da atualização.

**O serviço em si não muda.** Continua sendo remoção de impacto de reputação no
ML, feita manualmente pela equipe. O que muda é **de onde vem a solicitação**:
antes só WhatsApp, agora também via API.

### Escala

+23 mil lojas e +41 milhões de pedidos processados. Mesmo uma fração pequena vira
volume relevante. O mockup já mostra 256 atendimentos em um dia e 32 páginas de
paginação. **O painel precisa suportar volume real.**

---

## 3. O FLUXO COMPLETO

```
┌─────────────────────────────────────────────────────────────────┐
│  PAINEL DA TRACKEN                                              │
│  Lista de vendas/envios da transportadora                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ ☐  Venda 2000012345678901  ATRASADA  [Fique no Verde] ←───┼──┼─ botão
│  │ ☑  Venda 2000012345678902  ATRASADA  [Fique no Verde]     │  │  por venda
│  │ ☑  Venda 2000012345678903  ATRASADA  [Fique no Verde]     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                  [Enviar selecionados para FNVJ] ←──────────────┼─ ação
└─────────────────────────────────────────────────────────────────┘  em lote
                              │
                              │  POST /api/tracken/v1/tickets
                              │  (1 venda OU várias de uma vez)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  API FNVJ                                                       │
│  · valida credencial (API key + assinatura)                     │
│  · valida payload                                               │
│  · idempotência por ID de envio                                 │
│  · grava em tracken_tickets (status = "Recepcionado")           │
│  · grava payload bruto                                          │
│  · registra evento no histórico                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PAINEL FNVJ × TRACKEN   (fiquenoverdeja.com.br/tracken)        │
│  · atendimento aparece na lista                                 │
│  · atendente assume, abre o chamado no ML manualmente           │
│  · atualiza status: Em Atendimento → Removido / Negado          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │  webhook (assíncrono, com retry)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  TRACKEN recebe a atualização de status                         │
└─────────────────────────────────────────────────────────────────┘
```

### Ponto novo e importante: ENVIO EM LOTE

O usuário pode **selecionar várias vendas** e enviar de uma vez. Isso muda o
desenho da API:

- o endpoint aceita **um array** de envios em uma única chamada;
- a resposta é **por item** (aceito / duplicado / rejeitado) — em um lote de 50,
  alguns podem falhar e outros não;
- **não pode ser tudo-ou-nada**: se 1 item estiver inválido, os outros 49 entram
  normalmente;
- precisa de **limite de itens por lote** (sugestão: 200) para não estourar
  memória e timeout.

### Sobre o WhatsApp

Antes foi mencionado que o clique também abriria o WhatsApp da FNVJ. Isso precisa
ser confirmado (pergunta 15.1): com botão por venda **e** envio em lote, abrir
WhatsApp a cada clique não faz sentido para lote. O mais provável:

- **envio unitário:** pode abrir WhatsApp para o cliente detalhar o caso;
- **envio em lote:** não abre nada, os atendimentos só caem no painel.

Se abrir, a mensagem deve carregar o **ID de envio** para o atendente achar o
registro. Sem API do WhatsApp — link simples (`wa.me`), como já é hoje.

---

## 4. DECISÕES JÁ TOMADAS

**Não revisitar sem motivo.**

| # | Decisão | Detalhe |
|---|---|---|
| 1 | **URL do painel** | `https://fiquenoverdeja.com.br/tracken` |
| 2 | **Painel separado** | Não é uma aba do dashboard atual. Menu próprio, layout próprio. |
| 3 | **Tabelas novas no MESMO banco** | Sem banco separado. Tabelas novas com prefixo `tracken_`. |
| 4 | **NÃO MEXER nos dados do FNVJ atual** | Regra absoluta. Nenhum `ALTER`/`UPDATE`/`DELETE` em `sales`, `sale_items`, `clients`, `commissions`, `client_packages`, `services`. Só leitura, se necessário. |
| 5 | **Login compartilhado** | Os atendentes de hoje entram nos **dois** painéis com o **mesmo e-mail e senha**. Reusa `users` e o mesmo JWT. |
| 6 | **O serviço não muda** | O chamado no ML continua sendo aberto manualmente. |
| 7 | **Botão no painel da Tracken** | Por venda **e** com seleção múltipla (lote). |
| 8 | **Fonte** | Google Sans ou DM Sans. Local por enquanto está ok. |
| 9 | **Tema do painel novo** | **Claro** (conforme mockup), diferente do dashboard atual, que é escuro. |
| 10 | **Tela de login própria** | `/tracken/login`, com a identidade do painel. Mesmas credenciais, mesmo endpoint, mesma sessão. Detalhe na seção 12. |

### Por que a decisão 3 está certa

- **Mesmo banco** permite reusar `users` para o login compartilhado (decisão 5).
  Com banco separado, seria preciso replicar/sincronizar usuários — complexidade
  e risco sem retorno.
- **Tabelas novas** (em vez de colunas em tabelas existentes) mantêm o isolamento
  da decisão 4. Colunas em `sales` misturariam os dois mundos e contaminariam
  relatórios e comissões que já existem.
- O atendimento da Tracken **não é uma venda**. Nasce antes de haver cobrança,
  tem ciclo de vida próprio e pode terminar em "Negado" (sem faturamento).
  Forçar isso em `sales` distorceria o financeiro.

---

## 5. OS DADOS QUE RECEBEMOS

Extraídos das colunas do mockup e do fluxo descrito.

| Campo (nosso nome) | Exemplo no mockup | O que é | Obrigatório? |
|---|---|---|---|
| `carrier_code` (Transportadora) | TM, J3, PEX, TRANSMOTO | Transportadora dona do envio | **Sim** |
| `shipment_id` (ID de envio) | `47785466514` | ID do envio no ML | **Sim** — é a chave |
| `order_id` (Nº da venda) | `2000012345678901` | Nº do pedido no ML (16 dígitos) | **Sim** |
| `buyer_nickname` (Apelido) | `JoaoCompras` | Apelido do comprador no ML | Sim |
| `buyer_name` (Nome completo) | `João da Silva Oliveira` | Nome do comprador | Sim |
| `seller_name` (Seller) | `Loja Top Imports` | Nome do vendedor (loja) no ML | **Sim** |
| `sale_date` (Data da venda) | `18/08/2026 10:32` | Data/hora da venda | **Sim** |
| `shipping_deadline` (Limite de envio) | `20/08/2026 23:59` | Prazo limite de envio no ML | **Sim** — dirige o SLA |
| `received_at` (Recebido em) | `19/08/2026 08:15` | Quando **nós** recebemos | Gerado por nós |

### Campos que provavelmente também precisamos (confirmar — 15.3)

| Campo | Por quê |
|---|---|
| `seller_ml_id` | Identificar a conta do seller para abrir o chamado |
| `pack_id` | Pedidos ML agrupados em pack; o chamado pode ser no pack |
| `tracking_number` | Rastreio do envio |
| `shipping_status` | Status do envio no ML no momento do clique |
| `delay_reason` | Motivo do atraso, se a Tracken souber |
| `service_type` | Se é **atraso**, **reclamação** ou **cancelado** (ver 15.2) |
| `requested_by` | Quem clicou (usuário/loja na Tracken) |
| `tracken_ref` | ID do registro no lado deles, se existir |

### Sobre o "Limite de Envio"

No mockup aparece **destacado em laranja/vermelho**. Faz sentido: é o campo mais
crítico da operação. Depois do limite de envio, o atraso já foi contabilizado
pelo ML e a janela de contestação muda.

**Isso deve dirigir a ordenação padrão do painel** — o atendimento com limite
mais próximo aparece primeiro — e ganhar destaque visual quando faltarem poucas
horas.

---

## 6. STATUS DO ATENDIMENTO

Os status do mockup. **Oficiais até a Tracken confirmar (15.4).**

```
   ┌──────────────┐
   │ RECEPCIONADO │  ← estado inicial, criado pela API
   └──────┬───────┘
          │  atendente assume
          ▼
   ┌──────────────────┐
   │ EM ATENDIMENTO   │  ← chamado sendo aberto/tratado no ML
   └────┬────────┬────┘
        │        │
        ▼        ▼
  ┌──────────┐ ┌────────┐
  │ REMOVIDO │ │ NEGADO │  ← estados finais
  └──────────┘ └────────┘
```

| Status | Cor no mockup | Significado |
|---|---|---|
| **Recepcionado** | Azul | Chegou pela API, ninguém pegou ainda |
| **Em Atendimento** | Âmbar | Atendente assumiu, está tratando no ML |
| **Removido** | Verde | Atraso removido com sucesso |
| **Negado** | Vermelho | ML negou a remoção |

### A validar na máquina de estados

- Pode voltar de **Removido/Negado** para **Em Atendimento** (corrigir erro)?
  Recomendação: permitir só para admin, sempre com registro no histórico.
- Falta **Cancelado** (transportadora desistiu / venda cancelada)? Provavelmente
  sim.
- Falta **Aguardando ML** (chamado aberto, esperando resposta)? Operacionalmente
  útil, porque "Em Atendimento" pode durar dias esperando a plataforma.

**Os status vão morar em tabela de configuração** (`tracken_status_map`), não
hardcoded. Ajustar o fluxo passa a ser configuração, não deploy.

---

## 7. MODELO DE DADOS

Migration **019** (a última aplicada é a 018 — Cancelados). Padrão do projeto:
idempotente, `gen_random_uuid()`, `TIMESTAMPTZ`, trigger de `updated_at`,
`COMMENT ON`.

> **REGRA:** todas as tabelas com prefixo `tracken_`. Nenhuma alteração em tabela
> existente do FNVJ.

### 7.1 `tracken_carriers` — transportadoras da Tracken

```
id            UUID PK
code          TEXT NOT NULL UNIQUE   -- 'TM', 'J3', 'PEX', 'TRANSMOTO'
name          TEXT NOT NULL          -- nome completo
color         TEXT                   -- cor do badge no painel
tracken_ref   TEXT                   -- id da transportadora no lado deles
is_active     BOOLEAN DEFAULT true
created_at / updated_at TIMESTAMPTZ
```

**Por que não reusar `clients`:** as transportadoras da Tracken não são clientes
da FNVJ no sentido financeiro atual. Criar em `clients` misturaria com
FLEXBOYS/J3 do modelo de pacotes e violaria a decisão 4. Se depois for preciso
ligar ao faturamento, adiciona-se um `client_id` nullable aqui.

### 7.2 `tracken_tickets` — o atendimento (tabela central)

```
id                  UUID PK

-- identificação (vinda da Tracken)
shipment_id         TEXT NOT NULL UNIQUE  -- ID de envio ML — IDEMPOTÊNCIA
order_id            TEXT NOT NULL         -- nº da venda ML
carrier_id          UUID → tracken_carriers(id)
tracken_ref         TEXT                  -- id do registro no lado deles

-- comprador
buyer_nickname      TEXT
buyer_name          TEXT

-- vendedor (seller)
seller_name         TEXT NOT NULL
seller_ml_id        TEXT                  -- ML user id, se vier

-- datas
sale_date           TIMESTAMPTZ NOT NULL  -- data da venda
shipping_deadline   TIMESTAMPTZ           -- LIMITE DE ENVIO (dirige o SLA)
received_at         TIMESTAMPTZ NOT NULL  -- quando chegou na nossa API

-- operação
status              TEXT NOT NULL         -- FK lógica → tracken_status_map
assigned_user_id    UUID → users(id)      -- atendente responsável
started_at          TIMESTAMPTZ           -- quando virou "Em Atendimento"
finished_at         TIMESTAMPTZ           -- quando virou Removido/Negado
resolution_note     TEXT                  -- observação do atendente
ml_claim_id         TEXT                  -- nº do chamado aberto no ML

-- rastreio de origem
service_type        TEXT                  -- 'atraso'|'reclamacao'|'cancelado'
requested_by        TEXT                  -- quem clicou no botão lá
payload_raw         JSONB NOT NULL        -- payload original íntegro
credential_id       UUID → tracken_api_credentials(id)

created_at / updated_at TIMESTAMPTZ
```

Índices necessários:

```
UNIQUE (shipment_id)          -- idempotência
INDEX (status)                -- filtro do painel
INDEX (carrier_id)            -- filtro por transportadora
INDEX (shipping_deadline)     -- ordenação padrão + SLA
INDEX (received_at DESC)      -- listagem
INDEX (assigned_user_id)      -- "meus atendimentos"
INDEX (order_id)              -- busca
```

**Por que `payload_raw`:** no começo de qualquer integração o contrato muda. Sem
o payload original não há como reprocessar.

**Por que `shipment_id` é a chave:** identificador natural do envio no ML, único
e imutável. Serve de idempotência sem depender de um ID que a Tracken possa
mudar.

### 7.3 `tracken_ticket_events` — histórico imutável

```
id              UUID PK
ticket_id       UUID → tracken_tickets(id) ON DELETE CASCADE
event_type      TEXT NOT NULL  -- 'received'|'status_changed'|'assigned'
                               -- |'note'|'webhook_sent'|'webhook_failed'
from_status     TEXT
to_status       TEXT
actor_type      TEXT NOT NULL  -- 'tracken'|'user'|'system'
actor_user_id   UUID → users(id)
note            TEXT
metadata        JSONB
created_at      TIMESTAMPTZ
```

Nunca sofre UPDATE nem DELETE. Alimenta a tela **Histórico de Status**.

### 7.4 `tracken_status_map` — status configuráveis

```
id             UUID PK
code           TEXT NOT NULL UNIQUE  -- 'recepcionado','em_atendimento',
                                     -- 'removido','negado'
label          TEXT NOT NULL         -- "Recepcionado"
tracken_status TEXT                  -- como a Tracken chama esse status
color          TEXT NOT NULL         -- 'blue'|'amber'|'green'|'red'
sort_order     INT NOT NULL
is_initial     BOOLEAN DEFAULT false
is_final       BOOLEAN DEFAULT false
counts_as_sla  BOOLEAN DEFAULT true  -- entra no cálculo de SLA?
allowed_next   TEXT[]                -- transições permitidas
is_active      BOOLEAN DEFAULT true
```

Seed inicial:

```
recepcionado    | Recepcionado    | blue  | 1 | inicial | → em_atendimento
em_atendimento  | Em Atendimento  | amber | 2 |         | → removido, negado
removido        | Removido        | green | 3 | final   | → (admin) em_atendimento
negado          | Negado          | red   | 4 | final   | → (admin) em_atendimento
```

### 7.5 `tracken_outbox` — fila de saída para a Tracken

```
id               UUID PK
ticket_id        UUID → tracken_tickets(id)
event_type       TEXT NOT NULL
payload          JSONB NOT NULL
status           TEXT NOT NULL   -- 'pending'|'sent'|'failed'|'dead'
attempts         INT DEFAULT 0
max_attempts     INT DEFAULT 8
next_attempt_at  TIMESTAMPTZ
last_error       TEXT
last_http_status INT
sent_at          TIMESTAMPTZ
created_at / updated_at TIMESTAMPTZ
```

Backoff: 10s, 30s, 2min, 5min, 15min, 1h, 6h, 24h. Esgotado → `dead` + alerta no
painel.

**Por que fila e não chamada direta:** se a Tracken estiver fora do ar quando o
atendente clica em "Removido", a notificação não pode ser perdida e a tela não
pode travar esperando.

### 7.6 `tracken_api_credentials` — credencial da Tracken

```
id                UUID PK
name              TEXT NOT NULL         -- "Tracken Produção"/"Tracken Sandbox"
api_key           TEXT NOT NULL UNIQUE  -- identificador público
secret_hash       TEXT NOT NULL         -- SHA-256 do secret
secret_encrypted  TEXT                  -- secret cifrado (AES-256-GCM)
scopes            TEXT[] NOT NULL       -- ['tickets:write','tickets:read']
environment       TEXT NOT NULL         -- 'production'|'sandbox'
allowed_ips       TEXT[]                -- allowlist opcional
require_signature BOOLEAN DEFAULT true  -- exige HMAC?
webhook_url       TEXT                  -- destino das notificações
webhook_secret    TEXT
is_active         BOOLEAN DEFAULT true
last_used_at      TIMESTAMPTZ
expires_at        TIMESTAMPTZ
created_by        UUID → users(id)
created_at / updated_at TIMESTAMPTZ
```

O secret é exibido **uma única vez**, na criação.

### Por que existem duas colunas de secret

Só hash não resolve, e vale explicar porque é uma contradição fácil de cometer:

- **`secret_hash` (SHA-256)** serve para conferir o secret que a Tracken
  apresenta na requisição. Hash é suficiente: comparamos o hash do que veio com
  o guardado.
- **`secret_encrypted` (AES-256-GCM)** é necessário para validar **assinatura
  HMAC**, porque HMAC exige a chave em claro no momento do cálculo. Com hash não
  há como recalcular a assinatura.

A cifra usa `TRACKEN_ENCRYPTION_KEY` (32 bytes). **Sem essa env, a credencial é
criada com `require_signature = false`** — o script avisa em voz alta em vez de
gerar uma credencial que nunca autentica.

### 7.7 `tracken_request_log` — auditoria de chamadas

```
id             UUID PK
direction      TEXT NOT NULL   -- 'inbound'|'outbound'
endpoint       TEXT NOT NULL
http_method    TEXT
http_status    INT
credential_id  UUID → tracken_api_credentials(id)
ticket_id      UUID → tracken_tickets(id)
request_body   JSONB           -- dados sensíveis mascarados
response_body  JSONB
duration_ms    INT
error          TEXT
ip_address     TEXT
created_at     TIMESTAMPTZ
```

Retenção sugerida: 90 dias (definir — 15.10). Sem isso, depurar a integração vira
adivinhação.

---

## 8. API FNVJ

Base: `https://fiquenoverdeja.com.br/api/tracken/v1`

Versionada na URL desde o início, para evoluir sem quebrar a integração deles.

### 8.1 Autenticação

```http
Authorization: Bearer <api_key>.<secret>
X-FNVJ-Timestamp: <unix seconds>
X-FNVJ-Signature: sha256=<HMAC_SHA256(secret, timestamp + "." + corpo_bruto)>
Content-Type: application/json
```

Forma alternativa, se o cliente HTTP deles não aceitar o formato composto:

```http
X-FNVJ-Api-Key: <api_key>
X-FNVJ-Api-Secret: <secret>
```

Validações obrigatórias, nesta ordem:

1. API key existe, está ativa, não expirou
2. IP na allowlist (se configurada)
3. Timestamp dentro de ±5 min (barra replay)
4. Assinatura confere (comparação *timing-safe*)
5. Escopo permite a operação
6. Rate limit por credencial
7. Payload válido contra schema

> **Alternativa simplificada:** se a Tracken não suportar HMAC, aceitar só API key
> em header + allowlist de IP. Menos seguro, mas viável. Depende da resposta
> deles (15.6).

> **ATENÇÃO:** o middleware do projeto **não protege `/api`**. Toda validação tem
> de estar dentro do `route.ts`. Nunca depender do middleware.

### 8.2 `POST /tickets` — criar atendimento(s)

Aceita **um ou vários** envios. Sempre array, mesmo para 1 item — simplifica o
lado deles.

Requisição:

```json
{
  "items": [
    {
      "shipment_id": "47785466514",
      "order_id": "2000012345678901",
      "carrier_code": "TM",
      "service_type": "atraso",
      "buyer": {
        "nickname": "JoaoCompras",
        "name": "João da Silva Oliveira"
      },
      "seller": {
        "name": "Loja Top Imports",
        "ml_id": "123456789"
      },
      "sale_date": "2026-08-18T10:32:00-03:00",
      "shipping_deadline": "2026-08-20T23:59:00-03:00",
      "tracking_number": "ML123456789BR",
      "requested_by": "usuario@transportadora.com",
      "metadata": {}
    }
  ]
}
```

Resposta `200` (multi-status por item):

```json
{
  "received": 3,
  "created": 2,
  "duplicated": 1,
  "rejected": 0,
  "results": [
    {
      "shipment_id": "47785466514",
      "status": "created",
      "ticket_id": "9f1c...",
      "ticket_status": "recepcionado"
    },
    {
      "shipment_id": "47785322173",
      "status": "duplicated",
      "ticket_id": "7a2b...",
      "ticket_status": "em_atendimento",
      "message": "Envio já recebido anteriormente"
    },
    {
      "shipment_id": "47785199732",
      "status": "created",
      "ticket_id": "3c4d...",
      "ticket_status": "recepcionado"
    }
  ]
}
```

Regras:

- **Idempotência por `shipment_id`.** Reenvio do mesmo envio não cria duplicado
  nem devolve erro — devolve `duplicated` com o registro existente. Isso torna o
  retry deles seguro.
- **Falha parcial é permitida.** Item inválido vira `rejected` com o motivo; os
  demais entram normalmente.
- Limite de **200 itens** por chamada. Acima disso, `413`.
- Toda gravação usa **conexão transacional dedicada** (ver risco 13.1).

### 8.3 `GET /tickets/{shipment_id}` — consultar um atendimento

```json
{
  "shipment_id": "47785466514",
  "order_id": "2000012345678901",
  "status": "em_atendimento",
  "status_label": "Em Atendimento",
  "carrier_code": "TM",
  "assigned_to": "Nome do Atendente",
  "received_at": "2026-08-19T08:15:00-03:00",
  "started_at": "2026-08-19T09:02:00-03:00",
  "finished_at": null,
  "ml_claim_id": null,
  "history": [
    {
      "at": "2026-08-19T09:02:00-03:00",
      "from": "recepcionado",
      "to": "em_atendimento",
      "by": "Nome do Atendente"
    }
  ]
}
```

### 8.4 `GET /tickets` — listagem

Query params: `status`, `carrier_code`, `from`, `to`, `page`, `page_size`
(máx. 100). Resposta paginada com `total`, `page`, `page_size`, `items[]`.

### 8.5 `GET /statuses` — catálogo de status

Devolve `tracken_status_map` ativo. Permite que a Tracken descubra os status sem
hardcode do lado deles.

### 8.6 Padrão de erro

```json
{
  "error": {
    "code": "INVALID_SHIPMENT_ID",
    "message": "shipment_id é obrigatório",
    "details": { "field": "items[2].shipment_id" }
  }
}
```

| HTTP | Quando |
|---|---|
| 400 | payload inválido |
| 401 | credencial ausente/inválida/assinatura errada |
| 403 | credencial sem escopo, ou IP fora da allowlist |
| 404 | atendimento não encontrado |
| 413 | lote acima do limite |
| 422 | semanticamente inválido |
| 429 | rate limit |
| 5xx | erro nosso — a Tracken deve reenviar |

---

## 9. WEBHOOK FNVJ → TRACKEN

Quando o atendente muda o status, notificamos a Tracken.

```http
POST <url_configurada_pela_tracken>
X-FNVJ-Event: ticket.status_changed
X-FNVJ-Delivery: <uuid único desta tentativa>
X-FNVJ-Timestamp: <unix>
X-FNVJ-Signature: sha256=<hmac>
Content-Type: application/json
```

```json
{
  "event": "ticket.status_changed",
  "occurred_at": "2026-08-19T11:02:00-03:00",
  "data": {
    "shipment_id": "47785466514",
    "order_id": "2000012345678901",
    "from_status": "recepcionado",
    "to_status": "em_atendimento",
    "status_label": "Em Atendimento",
    "changed_by": "Nome do Atendente",
    "ml_claim_id": null,
    "note": null
  }
}
```

Eventos: `ticket.received`, `ticket.status_changed`, `ticket.assigned`,
`ticket.finished`.

Contrato de entrega:

- HTTP `2xx` = entregue.
- Qualquer outra coisa (ou timeout) = retry com backoff, até 8 tentativas.
- A Tracken **deve** tratar `X-FNVJ-Delivery` como chave de idempotência, porque
  o retry pode entregar o mesmo evento duas vezes.

---

## 10. O PAINEL: TELAS E COMPORTAMENTO

Baseado no mockup aprovado. Rota base: `/tracken`.

### 10.1 Estrutura geral

```
┌──────────────┬──────────────────────────────────────────────────────┐
│              │  Painel de Atendimento Fique no Verde Já x TRACKen   │
│  [LOGO]      │  Gestão central dos atendimentos de remoção de       │
│  Fique no    │  atraso recebidos via TRACKen                        │
│  VERDE já    │                    [ período ]   [ Atualizar ]       │
│              ├──────────────────────────────────────────────────────┤
│ ▸ Painel de  │  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                 │
│   Atendimento│  │ 256│ │ 142│ │  68│ │  32│ │  14│  ← KPIs         │
│ ▸ Atendimen. │  └────┘ └────┘ └────┘ └────┘ └────┘                 │
│ ▸ Transporta.│  ┌──────┐┌────────┐┌────────┐┌──────┐               │
│ ▸ Relatórios │  │donut ││ barras ││ linha  ││gauge │  ← gráficos   │
│ ▸ Histórico  │  └──────┘└────────┘└────────┘└──────┘               │
│ ▸ SLA & Perf.│  [filtros: período|transp.|status|limite|busca]      │
│ ▸ Config.    │  ┌──────────────────────────────────────────────┐   │
│              │  │  TABELA DE ATENDIMENTOS                      │   │
│ ┌──────────┐ │  └──────────────────────────────────────────────┘   │
│ │ Equipe   │ │  Mostrando 1 a 8 de 256    [1][2][3]...[32]         │
│ │ Admin    │ │  Dica...                 [ Exportar Relatório ]     │
│ └──────────┘ │                                                      │
└──────────────┴──────────────────────────────────────────────────────┘
```

### 10.2 Menu lateral (7 itens)

| Item | Rota | O que faz |
|---|---|---|
| **Painel de Atendimento** | `/tracken` | Dashboard com KPIs, gráficos e a tabela principal (tela do mockup) |
| **Atendimentos** | `/tracken/atendimentos` | Lista completa, sem gráficos, foco em operação e filtros avançados |
| **Transportadoras** | `/tracken/transportadoras` | Cadastro/gestão de TM, J3, PEX, TRANSMOTO, cores dos badges, volume por transportadora |
| **Relatórios** | `/tracken/relatorios` | Relatórios exportáveis (PDF/Excel) por período, transportadora, status, seller |
| **Histórico de Status** | `/tracken/historico` | Trilha de auditoria de `tracken_ticket_events` — quem mudou o quê e quando |
| **SLA & Performance** | `/tracken/sla` | SLA por transportadora/atendente, tempo médio, atendimentos fora do prazo |
| **Configurações** | `/tracken/configuracoes` | Credenciais de API, URL do webhook da Tracken, mapa de status, fila de saída |

Rodapé do menu: card do usuário logado com nome e papel ("Equipe Fique no Verde
Já / Administrador").

### 10.3 KPIs (5 cards)

| Card | Valor | Sublinha | Cor |
|---|---|---|---|
| Total Recebidos | 256 | `+18 hoje` | verde |
| Recepcionados | 142 | `55,5% do total` | azul |
| Em Atendimento | 68 | `26,6% do total` | âmbar |
| Removidos | 32 | `12,5% do total` | verde |
| Negados | 14 | `5,4% do total` | vermelho |

Regras:

- Percentuais sempre relativos ao **Total Recebidos** do período filtrado.
- "+18 hoje" é contagem de hoje, independente do filtro de período.
- Card clicável → aplica o filtro de status correspondente na tabela.

### 10.4 Gráficos (4 painéis)

**1. Por Transportadora** — donut com total no centro (256) e legenda com valor e
percentual:

```
TM         92 (35,9%)   verde
J3         78 (30,5%)   azul
PEX        53 (20,7%)   âmbar
TRANSMOTO  33 (12,9%)   roxo
```

**2. Atendimentos por Status** — barras horizontais:

```
Recepcionados   ████████████████████  142
Em Atendimento  ██████████             68
Removidos       █████                  32
Negados         ██                     14
```

**3. Tendência dos últimos 7 dias** — linha, eixo X com as datas (13/08 →
19/08), tooltip com valor + data, escala Y automática.

**4. SLA de Atendimento** — gauge radial: `92%`, rótulo "Dentro do prazo",
"Meta: 90%". Verde quando ≥ meta, vermelho quando abaixo.

> **Definir:** o que conta como "dentro do prazo"? Ver pergunta 15.5. Provável:
> atendimento **finalizado antes do `shipping_deadline`**.

### 10.5 Filtros

| Filtro | Tipo | Padrão |
|---|---|---|
| Período | date range | hoje |
| Transportadora | select | Todas |
| Status Atendimento | select | Todos |
| Limite de Envio | select | Todos (opções: vence hoje, vencido, próximas 24h, próximas 48h) |
| Buscar | texto livre | — (ID de envio, nº da venda, comprador, seller) |
| Botão "Filtros" | abre painel de filtros avançados | — |

### 10.6 Tabela principal

| Coluna | Conteúdo | Observações |
|---|---|---|
| TRANSPORTADORA | badge colorido com a sigla | cor de `tracken_carriers.color` |
| ID DE ENVIO | número + **ícone de copiar** | copiar é essencial — o atendente usa esse número no ML |
| Nº DA VENDA | nº do pedido ML | também com copiar |
| COMPRADOR | `Apelido \| Nome Completo` em duas linhas | cabeçalho: "Apelido \| Nome Completo" |
| SELLER | nome da loja | cabeçalho: "Nome do Vendedor (ML)" |
| DATA DA VENDA | `dd/MM/yyyy` + hora em linha menor | |
| LIMITE DE ENVIO | `dd/MM/yyyy` + hora | **destacado em laranja/vermelho** — quanto mais perto, mais forte |
| STATUS ATENDIMENTO | badge colorido | Recepcionado / Em Atendimento / Removido / Negado |
| RECEBIDO EM | `dd/MM/yyyy` + hora | quando chegou pela API |
| AÇÕES | botão **Detalhes** com dropdown | dropdown: mudar status, assumir, ver histórico, abrir no ML |

**Ordenação padrão:** `shipping_deadline` ascendente (mais urgente primeiro).
Cabeçalhos clicáveis para reordenar.

**Rodapé:** "Mostrando 1 a 8 de 256 registros" + paginação numérica com
reticências. O mockup mostra 8 por página — provavelmente configurável (15.9).

**Barra de dica:** "Dica: Utilize os filtros acima para visualizar os
atendimentos específicos."

**Botão "Exportar Relatório"** (verde, canto inferior direito).

### 10.7 Ação de mudar status

Na mesma transação:

1. `UPDATE tracken_tickets` (status, `started_at`/`finished_at`,
   `assigned_user_id`)
2. `INSERT tracken_ticket_events` (histórico)
3. `INSERT tracken_outbox` (notificação pendente)
4. `COMMIT` → resposta imediata para a tela

Depois, assíncrono: worker lê o outbox e chama a Tracken com retry.

**A tela nunca espera a Tracken responder.**

Validação: só permite transições em `allowed_next`. Transição inválida → erro
claro, não silencioso.

---

## 11. DESIGN SYSTEM

### 11.1 Diferença fundamental do sistema atual

| | Dashboard FNVJ atual | Painel Tracken (novo) |
|---|---|---|
| Tema | **Escuro** (`#121113`) | **Claro** (branco / cinza claro) |
| Estilo | Glassmorphism, `bg-white/10 backdrop-blur` | Cards sólidos com borda leve |
| Sidebar | Escura, colapsável | Clara, item ativo em verde |

**Isso é intencional** (conforme mockup). Os dois painéis coexistem com
identidades visuais distintas. Não tentar unificar.

### 11.2 Paleta

```
Verde primário (marca)     #16A34A / #22C55E
Verde claro (fundo ativo)  #F0FDF4
Fundo da página            #F8FAFC
Card                       #FFFFFF
Borda                      #E2E8F0
Texto principal            #0F172A
Texto secundário           #64748B

STATUS
Recepcionado    azul     #3B82F6   fundo #EFF6FF
Em Atendimento  âmbar    #F59E0B   fundo #FFFBEB
Removido        verde    #22C55E   fundo #F0FDF4
Negado          vermelho #EF4444   fundo #FEF2F2

TRANSPORTADORAS (badge)
TM         verde     #22C55E
J3         azul      #3B82F6
PEX        âmbar     #F59E0B
TRANSMOTO  roxo      #A855F7

DESTAQUE
Limite de envio próximo   #F97316 (laranja)
Limite de envio vencido   #EF4444 (vermelho)
```

### 11.3 Tipografia

**Google Sans** ou **DM Sans**. Local por enquanto (decisão 8).

DM Sans está no Google Fonts e pode ser carregada via `next/font/google`, mais
robusto que arquivo local. Google Sans **não** é distribuída publicamente — se a
escolha for ela, precisa do arquivo de fonte. **Recomendação: DM Sans via
`next/font/google`.**

### 11.4 Componentes

Reaproveitar do projeto onde fizer sentido, mas com **variante clara**:

- `components/Select.tsx` — já tem busca e dropdown em portal
- `components/Modal.tsx`, `components/Toast.tsx`, `components/Button.tsx`

Novos, específicos do painel:

- `TrackenSidebar` — menu claro com 7 itens
- `KpiCard` — ícone, valor, sublinha
- `StatusBadge` — badge por status, cor vinda do mapa
- `CarrierBadge` — badge da transportadora
- `DonutChart`, `HBarChart`, `LineChart`, `GaugeChart`
- `DeadlineCell` — limite de envio com destaque por urgência
- `CopyableId` — número com botão de copiar
- `TicketsTable` — tabela com ordenação e paginação
- `DateRangePicker`

**Biblioteca de gráficos:** o projeto **não tem nenhuma** hoje. Precisa escolher
(15.8). Sugestão: **Recharts** (leve, React-first, cobre os 4 tipos
necessários).

---

## 12. AUTENTICAÇÃO E LOGIN COMPARTILHADO

**Decisão 5:** os usuários de hoje entram nos dois painéis com o mesmo e-mail e
senha.

**Decisão 10 (25/08):** o painel tem **tela de login própria** em
`/tracken/login`, com a identidade visual dele. As credenciais continuam as
mesmas — o que muda é só a porta de entrada.

### Como fica

- Reusa a tabela **`users`** e o mesmo **JWT** (cookie `token`).
- Reusa `/api/auth/signin` — **sem alteração**. Não existe base de usuários
  separada nem segunda senha para manter.
- Sessão única: quem entra por `/tracken/login` também está logado no
  `/dashboard`, e vice-versa.

### Duas portas, uma sessão

| Área | Porta de entrada | Tema |
|---|---|---|
| `/dashboard` | `/login` | Escuro |
| `/tracken` | `/tracken/login` | Claro |

O middleware manda cada área para a sua porta, preservando o destino em
`?redirect=`. Quem já tem sessão e abre `/tracken/login` vai direto para o
painel. O logout do painel volta para `/tracken/login`, não para o login do
sistema completo.

### Por que a tela de login fica fora do route group

Um layout no App Router protege **tudo** abaixo dele. Se a página de login
ficasse sob o mesmo layout que faz a checagem de sessão, ela se redirecionaria
para si mesma em loop infinito. Daí a estrutura:

```
app/tracken/
├── layout.tsx          ← só tema claro + DM Sans (sem checagem)
├── login/page.tsx      ← /tracken/login, público
└── (painel)/
    ├── layout.tsx      ← portão de sessão + sidebar
    ├── page.tsx        ← /tracken
    └── ...             ← as outras 6 telas
```

O grupo `(painel)` está entre parênteses, então **não aparece na URL**: as rotas
seguem `/tracken`, `/tracken/atendimentos` e assim por diante.

### Como o destino é preservado

O Next não expõe o pathname a um layout server-side. O middleware injeta o
header `x-pathname`, e o layout do painel usa isso para montar
`/tracken/login?redirect=<origem>`. No cliente, o `AuthContext` só aceita
destino que comece com uma única `/` e não contenha `\`, o que barra
redirecionamento para fora do domínio.

### Lacuna conhecida

**Não há proteção contra força bruta em `/api/auth/signin`** — sem rate limit,
sem bloqueio após N tentativas, sem captcha. Isso já era assim antes; a tela
nova não piora (usa o mesmo endpoint), mas continua sendo uma exposição real,
agora com duas telas apontando para ela.

### O que precisa decidir

**Todo usuário do FNVJ pode acessar o painel Tracken?** Ou só um grupo?

Hoje `users` só tem `is_admin` (booleano). Não há papéis granulares.

- **A) Todos acessam** — mais simples, zero mudança em `users`
- **B) Coluna nova `can_access_tracken`** — mas isso **altera** `users`, o que
  roça na decisão 4

**Recomendação:** opção **A** na Fase 1. Se depois precisar restringir, criar
tabela `tracken_user_access` (aditiva, sem alterar `users`). Ver pergunta 15.7.

### Estrutura de pastas

```
app/
├── dashboard/          ← painel atual (escuro), intocado
└── tracken/            ← painel novo (claro)
    ├── layout.tsx      ← valida sessão + TrackenSidebar
    ├── page.tsx        ← Painel de Atendimento
    ├── atendimentos/
    ├── transportadoras/
    ├── relatorios/
    ├── historico/
    ├── sla/
    └── configuracoes/
```

```
app/api/tracken/
├── v1/                 ← API pública (a Tracken chama) — auth por API key
│   ├── tickets/
│   └── statuses/
├── tickets/            ← API interna (o painel chama) — auth por JWT
├── carriers/
├── stats/
├── outbox/
└── credentials/
```

**Separação importante:** `/api/tracken/v1/*` é autenticado por **API key da
Tracken**. `/api/tracken/*` (sem `v1`) é autenticado por **JWT do usuário**. Não
misturar.

---

## 13. RISCOS E BLOQUEADORES

### 13.1 BLOQUEADOR — `lib/db.ts` compartilha transação entre requisições

```ts
let transactionClient: PoolClient | null = null;  // variável de MÓDULO
// ...
const client = transactionClient || pool;         // qualquer query entra
                                                  // na transação alheia
```

`transactionClient` é **global do processo**. Se duas requisições rodarem juntas e
uma abrir transação, as queries da outra entram nela. Um `ROLLBACK` desfaz o
trabalho alheio.

Hoje passa batido porque o volume é baixo e as transações são disparadas
manualmente. **Com API recebendo lotes e webhooks concorrentes, colisão vira
rotina.**

**Regra obrigatória para este projeto:** todo código novo usa `pool.connect()`
com client dedicado (`client.query('BEGIN')` … `client.release()`). **Nunca**
`query("BEGIN")`.

Precedente correto no projeto: `app/api/sales/refund/route.ts`.

### 13.2 Segredos com fallback

`JWT_SECRET` tem fallback `"your-secret-key-change-this"` em ~25 arquivos.
`CRON_SECRET` tem fallback `"admin123"`.

**Regra:** credenciais da Tracken **somente** via env ou tabela com hash. **Sem
fallback default.** Se a env faltar, falhar explicitamente.

### 13.3 Volume

- lote de 200 itens sem batch insert → timeout
- tabela crescendo rápido sem índice → painel lento
- `tracken_request_log` sem retenção → banco inflado

Mitigações: índices da seção 7.2, limite de lote, retenção de log, `maxDuration`
adequado nas rotas.

### 13.4 Fuso horário

O projeto tem histórico de inconsistência (`TIMESTAMP` sem tz no schema legado).

**Regra:** tudo em `TIMESTAMPTZ`. Toda troca com a Tracken em **ISO 8601 com
offset** (`2026-08-19T14:30:00-03:00`). Nunca data sem fuso — `shipping_deadline`
é crítico demais para ambiguidade.

### 13.5 Sem biblioteca de gráficos

O projeto não tem nenhuma. Adicionar dependência nova. Decisão 15.8.

### 13.6 Conta do Mercado Livre

Para abrir o chamado, a FNVJ precisa de acesso à conta ML do **seller**. Hoje as
credenciais ML pertencem ao **atendente** (`mercado_livre_credentials.user_id`),
não ao cliente. **Não existe** vínculo entre conta ML e cliente/seller.

Se cada seller da Tracken precisar ter a conta conectada, isso é modelagem nova e
fluxo de consentimento novo. **Pergunta 15.11** — pode ser o maior risco de
escopo escondido do projeto.

---

## 14. FASES DE IMPLEMENTAÇÃO E PRAZO

> Estimativa em **dias úteis de desenvolvimento**, um desenvolvedor, sem contar
> espera por terceiros.

| Fase | Escopo | Estimativa |
|---|---|---|
| **0** | Migration 019 (7 tabelas + seeds + índices), auth de máquina (API key + HMAC), helper de transação segura, log de requisições | 4 – 6 d |
| **1** | `POST /tickets` com lote e idempotência, `GET /tickets`, `GET /statuses`, validação de schema | 3 – 4 d |
| **2** | Shell do painel: rota `/tracken`, layout claro, sidebar de 7 itens, sessão compartilhada, fonte, design system base | 3 – 4 d |
| **3** | Painel de Atendimento: 5 KPIs, 4 gráficos, filtros, tabela, paginação, ordenação, copiar ID | 5 – 7 d |
| **4** | Ação de status: transição validada, histórico, atribuição, detalhe do atendimento | 3 – 4 d |
| **5** | Outbox + worker + retry + reenvio manual + tela de fila | 3 – 5 d |
| **6** | Telas restantes: Atendimentos, Transportadoras, Histórico, SLA & Performance | 4 – 6 d |
| **7** | Relatórios + exportação (PDF/Excel) | 3 – 4 d |
| **8** | Configurações: credenciais, webhook, mapa de status | 2 – 3 d |
| **9** | **Documentação da API para a Tracken** (OpenAPI + guia + Postman) | 2 – 3 d |
| **10** | Homologação ponta a ponta com a Tracken, ajustes de contrato | 3 – 5 d |
| — | **TOTAL** | **35 – 51 dias úteis** |

### Caminho mínimo para funcionar (MVP)

Fases **0 + 1 + 2 + 3 + 4** = **18 – 25 dias úteis**.

Com isso: a Tracken já envia, o atendimento aparece no painel, o atendente
trabalha e muda status. Falta a notificação automática de volta (Fase 5), que
pode ser suprida temporariamente por consulta deles no `GET /tickets`.

### Atalho que destrava a Tracken imediatamente

A **documentação/contrato da API** (Fase 9) pode ser escrita e entregue **antes**
da implementação, em **2 a 3 dias**, desde que as perguntas 15.1 a 15.6 sejam
respondidas. Assim o time deles desenvolve em paralelo.

**Recomendação forte: fazer isso primeiro.**

---

## 15. PERGUNTAS ABERTAS

> Marcar ✅ quando respondida e registrar a resposta aqui mesmo.

### Sobre o fluxo

**15.1 — O clique abre o WhatsApp?**
Foi mencionado antes. Com botão por venda **e** envio em lote, isso ainda faz
sentido? Sugestão: abre no envio unitário, não abre no lote.

**15.2 — Só atraso, ou os três serviços?**
O painel diz "remoção de **atraso**". Mas a FNVJ tem três serviços: **Atrasos**,
**Reclamação** e **Cancelados**. A Tracken vai mandar só atraso, ou os três? Se
os três, precisa do campo `service_type` e de filtro por serviço no painel.

**15.3 — Lista final de campos do payload.**
Os do mockup estão claros. Faltam confirmar: `seller_ml_id`, `pack_id`,
`tracking_number`, `shipping_status`, `delay_reason`, `requested_by`.
**Sem `seller_ml_id` pode ser impossível abrir o chamado.**

**15.4 — Os 4 status são finais?**
Recepcionado → Em Atendimento → Removido / Negado. Falta **Cancelado** (a
transportadora desistiu)? Falta **Aguardando ML** (chamado aberto, esperando
resposta)? Pode voltar de Removido/Negado?

**15.5 — Como se calcula o SLA de 92%?**
Sugestão: atendimento finalizado **antes** do `shipping_deadline`. Confirmar,
porque é o número que a Tracken vai cobrar da gente.

**15.6 — Segurança: HMAC ou API key simples?**
Eles conseguem assinar as chamadas? Têm IP fixo para allowlist? Qual a URL do
webhook deles (produção e homologação)? Eles tratam idempotência por header?

### Sobre o nosso lado

**15.7 — Todo usuário FNVJ acessa o painel Tracken?** Ou só um grupo? (impacta se
precisa de controle de acesso — seção 12)

**15.8 — Biblioteca de gráficos: aprovar Recharts?** O projeto não tem nenhuma
hoje. Precisa adicionar dependência.

**15.9 — Quantos registros por página?** O mockup mostra 8. Parece pouco para
operação. Sugestão: 25 por padrão, configurável.

**15.10 — Retenção de log.** Por quanto tempo guardar `tracken_request_log` e
`payload_raw`? Sugestão: 90 dias para log, indefinido para payload.

**15.11 — Conta do Mercado Livre do seller (RISCO ALTO).**
Para abrir o chamado precisamos de acesso à conta ML do seller. Hoje não existe
vínculo entre conta ML e cliente no sistema. Como vai funcionar?

- A Tracken tem acesso às contas e repassa?
- Cada seller conecta a conta pra gente (como o fluxo `/ml/[code]` de hoje)?
- A FNVJ opera com login/senha do seller?

**Pode ser o maior trabalho escondido do projeto. Responder antes da Fase 1.**

### Sobre negócio

**15.12 — Como é a cobrança?** Por atendimento? Só quando "Removido"? Quem paga:
a Tracken ou o seller? Entra na carteira de créditos que já existe?

**15.13 — Gera comissão para o atendente?** Se sim, com qual regra? (Hoje
comissão vem de `sales` + política + data.) **Atenção:** se gerar comissão,
precisa tocar o financeiro — o que conflita com a decisão 4. Precisa desenho
específico.

**15.14 — Volume esperado?** Atendimentos por dia/mês. Dimensiona rate limit,
índices e paginação.

**15.15 — TM, J3, PEX, TRANSMOTO são as mesmas transportadoras de hoje?**
O FNVJ já tem clientes tipo transportadora (FLEXBOYS, J3...). São as mesmas
empresas? Se sim, vincular ou manter separado?

---

## 16. DIÁRIO DO PROJETO

### 18/08 — Briefing inicial e análise do sistema

- PDF do briefing lido e conferido.
- Sistema FNVJ analisado por completo. Registrado em
  `APINOVA/INTEGRACAO_FNVJ_TRACKEN.md`.
- Constatado: **não existe** entidade de atendimento separada de `sales`, **não
  existe** receptor de webhook, **não existe** auth máquina-a-máquina, **não
  existe** documentação de API, **não existe** Kanban nem lib de gráficos.
- **Bloqueador crítico:** `lib/db.ts` compartilha o client de transação entre
  requisições concorrentes.
- Descoberto que o modelo de **transportadora com carteira pré-paga já existe**
  (`client_type='package'` + `client_packages`) e opera em produção.

### 18/08 — Detalhamento do fluxo pelo cliente

- Botão "Fique no Verde" ficará em **cada venda** no painel da Tracken, **e** com
  **seleção múltipla** (lote).
- A API recebe os dados da venda — os mesmos que a FNVJ já usa para abrir chamado
  no ML.
- **Painel separado** em `https://fiquenoverdeja.com.br/tracken`.
- **Tabelas novas no mesmo banco.** Proibido mexer nos dados do FNVJ atual.
- **Login compartilhado:** mesmos usuários, mesmo e-mail e senha nos dois
  painéis.
- Mockup do painel recebido e analisado em detalhe (seção 10).
- Tracken caracterizada: SaaS de logística para transportadoras FLEX, integrada a
  ML / Shopee / Magalu / Amazon, R$ 0,25 por etiqueta bipada, +41M pedidos.
- Fonte: Google Sans ou DM Sans.

Definições extraídas do mockup:

- Status: **Recepcionado → Em Atendimento → Removido / Negado**
- Transportadoras: **TM, J3, PEX, TRANSMOTO**
- 5 KPIs, 4 gráficos, 5 filtros, 10 colunas na tabela, 7 itens de menu
- Tema **claro** (o dashboard atual é escuro)
- Campo mais crítico: **Limite de Envio** (destacado em laranja/vermelho)

Novidade que muda o desenho da API: envio **em lote**. O endpoint aceita array,
responde por item, permite falha parcial.

### 25/08 — Implementação do MVP (Fases 0 a 4)

Migration 019, camada `lib/tracken`, API pública v1, API interna e o Painel de
Atendimento entregues. Detalhe por arquivo na seção 17.

Decisões tomadas durante a implementação:

- **Duas colunas de secret.** Só hash é incompatível com HMAC, que precisa da
  chave em claro para recalcular a assinatura. Resolvido com `secret_hash`
  (SHA-256, confere o secret apresentado) mais `secret_encrypted`
  (AES-256-GCM, permite validar assinatura). Detalhe na seção 7.6.
- **Bearer composto:** `Authorization: Bearer <api_key>.<secret>`, com o par de
  headers `X-FNVJ-Api-Key` / `X-FNVJ-Api-Secret` como alternativa.
- **`SAVEPOINT` por item no lote.** Garante falha parcial de verdade: um envio
  inválido não derruba os outros 199, e tudo roda em um único client dedicado.
- **Status `cancelado` adicionado ao seed** (pergunta 15.4), com
  `counts_as_sla = false` para não poluir o indicador. Se a Tracken confirmar que
  não existe, basta desativar a linha — é configuração, não deploy.
- **`useSyncExternalStore`** na sidebar em vez de `useEffect` + `setState`, para
  ler o `localStorage` sem render em cascata nem divergência de hidratação.
- **Recharts, `lucide-react` e `date-fns` já estavam instalados.** Nenhuma
  dependência nova foi adicionada ao projeto (resolve a pergunta 15.8).
- **Página padrão com 25 registros**, seletor de 8/25/50/100 (pergunta 15.9). O
  mockup mostrava 8, que é pouco para operação real.
- **Ordenação padrão por limite de envio ascendente**: o atendimento mais
  urgente aparece primeiro.

Nenhuma tabela do FNVJ atual foi alterada. As únicas referências a estrutura
existente são chaves estrangeiras de leitura para `users(id)`.

### 25/08 — Migration aplicada e integração validada em produção

Backup feito pelo cliente antes de qualquer escrita. Migration 019 aplicada no
Postgres 17.7 do Coolify (`72.61.62.227:5434`), com ensaio de `ROLLBACK` antes do
`COMMIT` e reexecução para provar idempotência. **81 checagens automatizadas
passando** contra o banco real. Detalhe completo na seção 17.

Descobertas durante a aplicação:

- **A função `update_updated_at_column()` não existia em produção.** O
  `database/schema.sql` declara os triggers de `updated_at`, mas eles nunca
  foram aplicados nesse banco — só existia um trigger não-interno
  (`trigger_commission_accounting_integrity`) e `updated_at` é mantido pelo
  código. A migration passou a criar a função ela mesma, ficando autossuficiente
  em qualquer ambiente.
- **Defeito próprio corrigido:** o trigger de imutabilidade bloqueava `DELETE`
  além de `UPDATE`, o que impedia o `ON DELETE CASCADE` e tornava impossível
  remover um atendimento. Passou a bloquear só `UPDATE`.
- **O script de credencial estava apontando para o banco errado.** Usava o
  `exec_sql` via client do Supabase, e o Supabase do `.env.local` não é a
  produção. Reescrito para usar `DATABASE_URL` via `pg`.
- Dois problemas de ambiente que dependem de você: senha de produção hardcoded
  em scripts versionados e `.env.local` apontando para um Supabase que não é o
  banco vivo. Seção 17.

---

## 17. ESTADO DA IMPLEMENTAÇÃO

> Atualizado em 25/08. `next build` e `eslint` passam limpos nos arquivos novos.

### Pronto

| Item | Arquivos |
|---|---|
| Migration 019: 7 tabelas `tracken_*`, índices, triggers, seeds de status e transportadoras | `database/migrations/019_create_tracken_integration.sql` |
| Transação isolada (contorna o bloqueador 13.1) | `lib/tracken/db.ts` |
| Cripto: SHA-256, AES-256-GCM, HMAC, comparação *timing-safe* | `lib/tracken/crypto.ts` |
| Auth de máquina (API key + secret + HMAC + IP + escopo + rate limit) e auth do painel (JWT) | `lib/tracken/auth.ts` |
| Validação manual do payload (sem zod, como o resto do projeto) | `lib/tracken/validation.ts` |
| Regra de negócio: lote com SAVEPOINT por item, transição de status, atribuição, outbox | `lib/tracken/tickets.ts` |
| Filtros compartilhados entre KPI, tabela e exportação | `lib/tracken/filters.ts` |
| API pública: `POST/GET /tickets`, `GET /tickets/{shipment_id}`, `GET /statuses` | `app/api/tracken/v1/**` |
| API interna: `tickets`, `tickets/[id]` (GET/PATCH), `stats`, `carriers`, `export` (CSV) | `app/api/tracken/**` |
| Shell do painel: sidebar clara de 7 itens, DM Sans, tema claro | `app/tracken/layout.tsx`, `(painel)/layout.tsx`, `(painel)/layout-client.tsx`, `components/tracken/TrackenSidebar.tsx` |
| **Tela de login própria** do painel, com portão de sessão em route group separado | `app/tracken/login/page.tsx`, `components/tracken/TrackenLoginForm.tsx`, `middleware.ts` |
| As 6 telas secundárias do menu | `app/tracken/(painel)/{atendimentos,transportadoras,relatorios,historico,sla,configuracoes}/page.tsx` |
| APIs das telas secundárias | `app/api/tracken/{events,sla,settings}/route.ts`, `PATCH` em `carriers` |
| Componentes de página compartilhados | `components/tracken/PageShell.tsx`, `useTrackenCatalogs.ts` |
| Dados de demonstração | `scripts/tracken_seed_demo.mjs` |
| Painel de Atendimento: 5 KPIs, 4 gráficos, filtros, tabela de 10 colunas, paginação, detalhe com histórico e troca de status | `app/tracken/page.tsx`, `components/tracken/**` |
| Proteção de rota `/tracken` | `middleware.ts` |
| Link de acesso no menu do dashboard atual | `components/Sidebar.tsx` |
| Bootstrap de credencial da API | `scripts/tracken_credential.mjs` |

### Ainda não feito

- **Worker do outbox.** Os eventos são gravados em `tracken_outbox`, mas nada
  envia ainda. A Tracken consulta o `GET /tickets` até a Fase 5 existir.
- **Proteção contra força bruta no login** (ver seção 12).
- Documentação OpenAPI/Postman para entregar ao time deles.
- Emitir a credencial de produção e configurar `TRACKEN_ENCRYPTION_KEY` no
  Coolify.

### Para criar a credencial de produção

A migration **já está aplicada**. Falta apenas emitir a credencial da Tracken.

```powershell
# 1. Gerar a chave de cifra e configurar no serviço (Coolify) + na sessão local
node scripts/tracken_credential.mjs genkey
$env:TRACKEN_ENCRYPTION_KEY="<valor gerado>"

# 2. Apontar para o banco de produção
$env:DATABASE_URL="postgresql://postgres:<senha>@72.61.62.227:5434/postgres"

# 3. Emitir a credencial (imprime api_key e secret uma única vez)
node scripts/tracken_credential.mjs create "Tracken Producao" production

# Conferir ou revogar depois
node scripts/tracken_credential.mjs list
node scripts/tracken_credential.mjs revoke <api_key>
```

> O script usa `DATABASE_URL` via `pg`, **não** o client do Supabase. Isso é
> proposital: o Supabase do `.env.local` não é o banco de produção.

### Dados de demonstração

Para apresentar o painel (inclusive para a Tracken) sem depender de volume real:

```powershell
node scripts/tracken_seed_demo.mjs seed    # 256 atendimentos nas proporções do mockup
node scripts/tracken_seed_demo.mjs status  # conferir o que está lá
node scripts/tracken_seed_demo.mjs purge   # remover tudo
```

Todos os registros têm `shipment_id` com prefixo `DEMO`, então a remoção é
completa e não encosta em dado real. O gerador é determinístico: a demo sai
igual toda vez. As proporções replicam o painel aprovado (TM 92, J3 78, PEX 53,
TRANSMOTO 33; Recepcionado 142, Em Atendimento 68, Removido 32, Negado 14), com
96 chegando hoje e o resto distribuído nos 6 dias anteriores para alimentar o
gráfico de tendência.

**Há dados de demonstração na base agora.** Rode `purge` antes de usar o painel
para valer.

### Migration aplicada em produção — 25/08

Banco: **PostgreSQL 17.7 em `72.61.62.227:5434`** (backup feito antes, via
Coolify). Sequência executada: ensaio com `ROLLBACK` → aplicação com `COMMIT` →
reexecução para confirmar idempotência.

Resultado: 7 tabelas `tracken_*`, 28 índices, 5 status, 4 transportadoras.
Tabelas do FNVJ conferidas antes e depois: **17 users / 7.970 sales / 3
services**, inalteradas.

### Verificação executada

**81 checagens, todas passando**, contra o banco de produção com o servidor
rodando:

| Suíte | Checagens | Cobre |
|---|---|---|
| API pública | 23 | HMAC (ausente/inválida/válida), lote com falha parcial, motivos de rejeição, idempotência entre chamadas, duplicado no mesmo lote, consulta por `shipment_id`, 404, `id` interno não exposto, listagem, limite de 200 itens (413) |
| API do painel | 45 | 401 sem sessão e com token inválido, catálogos, KPIs (soma dos status = total), 7 dias de tendência, SLA, filtros e busca, máquina de estados completa, reabertura restrita a admin, histórico, outbox, imutabilidade no banco, atribuição, CSV com BOM |
| Renderização | 13 | Redirecionamento sem sessão, 200 com sessão, menu de 7 itens, KPIs, gráficos, coluna de limite, botão de exportar, DM Sans aplicada, tema claro |

Dados de teste, credencial sandbox e linhas de log foram removidos. Estado final:
todas as tabelas operacionais em zero, apenas os seeds (4 transportadoras, 5
status) permanecem.

### Defeito encontrado e corrigido durante o teste

O trigger de imutabilidade do histórico bloqueava `UPDATE` **e** `DELETE`. Como
`tracken_ticket_events` tem `ON DELETE CASCADE` para `tracken_tickets`, isso
tornava **impossível apagar um atendimento** — nem dado gravado por engano, nem
pedido de exclusão de dados. O `CASCADE` era uma promessa que o banco não
cumpria.

Corrigido: o bloqueio cobre apenas `UPDATE`. A garantia que importa continua de
pé (nenhum evento é adulterado silenciosamente) e apagar um atendimento leva o
histórico dele junto, de forma intencional. Migration reaplicada e cascade
confirmado funcionando.

### Dois achados de ambiente que precisam de ação

1. **Credenciais de produção hardcoded em scripts versionados.** A senha do
   Postgres está em texto puro em `scripts/verify_vps_balances.js`,
   `scripts/probe_ml_claims.js`, `scripts/add_statement_slug_col.js` e outros.
   Deveriam ler de `DATABASE_URL`, e a senha deveria ser rotacionada — ela está
   no histórico do git.
2. **`.env.local` aponta para o banco errado.** As variáveis de Supabase apontam
   para `xqkhmtrxcpjmxtwpqacg.supabase.co`, que **não** é a produção. Produção é
   o Postgres do Coolify. Não há `DATABASE_URL` no arquivo, então nenhuma query
   funciona localmente sem exportar a variável na mão. Vale limpar isso para não
   alguém aplicar migration no banco abandonado achando que é o certo.

### Configuração pendente no ambiente de produção

Para a API aceitar chamadas assinadas, o serviço no Coolify precisa de:

```
TRACKEN_ENCRYPTION_KEY=<node scripts/tracken_credential.mjs genkey>
```

Sem ela, a credencial nasce com `require_signature = false` (sem HMAC) e o
script avisa.

---

## APÊNDICE A — Regras invioláveis

Consulta rápida antes de escrever qualquer linha de código:

1. **Nunca** alterar/apagar dados das tabelas do FNVJ atual (`sales`,
   `sale_items`, `clients`, `commissions`, `client_packages`, `services`).
2. **Nunca** usar `query("BEGIN")` no código novo. Sempre `pool.connect()` com
   client dedicado.
3. **Nunca** deixar fallback default em segredo/credencial.
4. **Nunca** depender do middleware para autorizar rota de API. Validar dentro do
   `route.ts`.
5. **Sempre** `TIMESTAMPTZ` no banco e ISO 8601 com offset na API.
6. **Sempre** prefixar tabelas novas com `tracken_`.
7. **Sempre** gravar `payload_raw` do que a Tracken enviar.
8. **Sempre** idempotência por `shipment_id` na entrada.
9. **Sempre** notificar a Tracken via outbox/fila, nunca chamada direta no
   request do atendente.
10. Migration nova = **019**, idempotente, com `COMMENT ON`.

---

## 18. DIÁRIO — CONTINUAÇÃO

### 25/08 — As 6 telas do menu e o fluxo de login

Reportado pelo cliente: todas as rotas do menu davam 404 (só o Painel de
Atendimento existia) e o login jogava no `/dashboard` em vez de voltar ao painel.

Corrigido e entregue:

- **As 6 telas** foram construídas de verdade, não como casca: Atendimentos,
  Transportadoras, Relatórios, Histórico de Status, SLA & Performance e
  Configurações. Detalhe na seção 10.2 e na 17.
- **Três APIs novas** (`events`, `sla`, `settings`) e `PATCH` em `carriers`.
- **Dois defeitos no fluxo de login:** o `AuthContext` fazia
  `router.push("/dashboard")` fixo, ignorando `?redirect=`; e o layout do painel
  redirecionava para `/api/auth/logout`, que **apagava o cookie** e derrubava
  também a sessão do dashboard.

Verificação: 46 checagens, todas passando.

### 25/08 — Tela de login própria do painel

Pedido do cliente: o painel deve ter tela de login própria, não a do Fique no
Verde.

Entregue `/tracken/login` com a identidade do painel (tema claro, DM Sans,
marca), usando as **mesmas credenciais e o mesmo endpoint**. Nada de base de
usuários paralela.

Detalhe estrutural que exigiu reorganização: no App Router um layout protege
tudo abaixo dele, então uma página de login sob o layout autenticado se
redirecionaria em loop. As telas autenticadas foram movidas para o route group
`(painel)`, que não altera as URLs. Estrutura e raciocínio na seção 12.

Também nesta rodada:

- O middleware passa a mandar cada área para a sua porta (`/dashboard` → `/login`,
  `/tracken` → `/tracken/login`) e injeta `x-pathname` para o layout conseguir
  preservar o destino.
- O logout do painel volta para `/tracken/login`.
- `login()` do `AuthContext` ganhou destino padrão opcional (compatível com as
  chamadas existentes).
- A tela de login é `noindex`.

Verificação: 40 checagens, todas passando — incluindo que o fluxo do
`/dashboard` **não** foi afetado e que o endpoint de autenticação segue devolvendo
mensagem genérica e sem cookie quando a senha está errada.

**Lacuna registrada:** `/api/auth/signin` não tem proteção contra força bruta.
Já era assim, e agora há duas telas apontando para o mesmo endpoint.

---

## 19. MELHORIAS DA SEGUNDA RODADA — 25/08

Quatro pedidos do cliente, mais as correções de uma revisão de código do módulo.

### As 4 funcionalidades

**1. Troca de status na própria linha.** O badge de status da tabela virou
gatilho: um clique abre as transições permitidas, outro aplica. O menu vai para
um portal no `body` porque a tabela tem `overflow-x-auto` e um menu absoluto
seria cortado pela borda. Reposiciona no scroll, abre para cima quando não há
espaço abaixo, e mostra o erro dentro do próprio menu.
Arquivo: `components/tracken/RowStatusMenu.tsx`.

**2. Coluna de modalidade de envio.** Coluna nova com destaque para **FLEX**
(`self_service` no Mercado Livre), que é a conferência que a operação faz antes
de abrir chamado. Aceita apelidos na entrada (`flex`, `me2_flex`, `coleta`,
`full`, `agencia`) e, se o ML criar uma modalidade nova, ela aparece com o código
cru em vez de sumir. Virou também filtro e dois cartões de KPI clicáveis.
Arquivos: `lib/tracken/shipping.ts`, `components/tracken/ShippingModeBadge.tsx`.

**3. Filtro de atendente.** Novo endpoint `/api/tracken/attendants` com a
contagem de abertos por pessoa. Inclui a opção **Não atribuídos** e traz também
usuários inativos que ainda têm atendimento vinculado — sem isso, desativar
alguém esconderia os atendimentos dele do filtro.

**4. Coluna de data real do envio.** `shipped_at`, distinto de
`shipping_deadline` (que é o prazo). Quando a postagem ocorreu depois do limite,
a célula marca **"Fora do prazo"**. Ordenável e presente na exportação.

### Migration 020 (aplicada em produção)

Colunas `shipping_mode` e `shipped_at`, mais índices. Aplicada em
`72.61.62.227:5434` com ensaio de `ROLLBACK` antes do `COMMIT` e reexecução para
provar idempotência. Tabelas do FNVJ conferidas antes e depois: 17 users /
8.078 sales / 3 services, inalteradas.

### Defeitos corrigidos (achados na revisão)

| Gravidade | Problema | Correção |
|---|---|---|
| **Alta** | `/stats` abria **6 conexões simultâneas** de um pool de 10, e a tela dispara 3 requisições. Dois atendentes juntos estouravam o pool e a tela falhava com erro genérico. | Novo `withClient`: as consultas rodam em sequência numa conexão só. Aplicado em `stats`, `sla` e `settings`. |
| **Alta** | O filtro de período usava `(received_at AT TIME ZONE ...)::date`, o que **impede o uso do índice**. Presente em toda consulta do painel. | Passou a comparar a coluna crua com um instante calculado. Continua correto no fuso e volta a ser indexável. |
| **Alta** | Nenhuma requisição era cancelada. Digitar rápido fazia a resposta antiga sobrescrever a nova: a tabela mostrava um resultado e a busca dizia outro. | Novo `usePanelTickets` com `AbortController` e número de geração; só a carga mais recente é aplicada. |
| Média | `kpis.total` somava status desativados, que não aparecem em cartão nenhum — a soma dos cartões não fechava. | Passou a informar `unmappedStatusCount` e o painel avisa explicitamente. |
| Média | O donut usava o total geral como denominador, então os ângulos não correspondiam aos percentuais da legenda. | Denominador virou a soma das próprias fatias (`carrierTotal`). |
| Média | "Vence hoje" trazia prazos das primeiras horas **já perdidos**. | Passou a exigir `>= agora`. Adicionado o recorte "Sem limite". |
| Média | `sm.is_final = false` com LEFT JOIN descartava atendimento cujo status saiu do mapa — ele desaparecia da fila sem ter sido concluído. | `COALESCE(sm.is_final, false)`. |
| Média | Atendimento em status desativado ficava **imutável para sempre**, e o modal escondia a seção de status sem explicar. | `getStatusMap(true)` reconhece a origem, e o modal passou a explicar o motivo. |
| Média | Lote inteiro recebia o mesmo `received_at` (é o instante da transação), e sem desempate a paginação repetia e omitia registros. | `ORDER BY ... , t.id` como desempate final. |
| Média | Na API pública, `?from=2026-08-19` era lido em UTC e não no fuso local: os totais da Tracken nunca fechariam com os do painel. Data inválida dava 500. | Conversão para o fuso da operação e validação de formato (400). |
| Média | UUID de atendente vazava como rótulo na tela de SLA. | Rótulo neutro quando não há nome. |
| Média | Modal sem foco gerenciado, sem travar scroll, e fechava ao arrastar para selecionar texto — descartando a observação digitada. | Foco ao abrir e devolvido ao fechar, scroll travado, e só fecha se o clique **começou** no fundo. |
| Média | Tabelas roláveis não alcançáveis por teclado; `text-slate-400` em dado real (contraste ~2,85:1). | `tabIndex` + `role="region"`, primeira coluna fixa, contraste elevado para `slate-500/600`. |
| Média | "Limpar filtros" escondido atrás do toggle; dois campos de data lado a lado cortavam em tela média. | "Limpar" sempre visível com a contagem de filtros ativos; datas empilham em tela estreita. |

### Verificação

**57 checagens, todas passando** contra o banco de produção: filtro e badge de
FLEX, `shipped_at` com ordenação e alerta de fora do prazo, filtro de atendente
(por pessoa e não atribuídos), transição pela linha com bloqueio das não
permitidas, denominador do donut, recortes de prazo disjuntos, CSV com as
colunas novas, as 7 telas abrindo e as tabelas do FNVJ preservadas.
