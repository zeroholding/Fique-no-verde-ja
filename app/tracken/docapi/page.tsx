import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowRight,
  Ban,
  Clock,
  Inbox,
  Info,
  KeyRound,
  ListChecks,
  Lock,
  Send,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { FnvjLogo } from "@/components/tracken/BrandLogo";
import CodeBlock from "@/components/tracken/docs/CodeBlock";
import CopyInline from "@/components/tracken/docs/CopyInline";
import {
  Callout,
  Endpoint,
  FieldTable,
  Section,
  SubTitle,
  type FieldRow,
} from "@/components/tracken/docs/DocParts";
import { DENIAL_REASONS } from "@/lib/tracken/denial";

/**
 * Documentacao publica da API de integracao FNVJ x TRACKen.
 *
 * PUBLICA de proposito, liberada no middleware: o dev do outro lado precisa ler
 * o contrato antes de existir qualquer credencial, e exigir login para ver
 * documentacao seria atrito sem ganho de seguranca.
 *
 * Nada aqui e segredo. Nao ha token, chave, nem dado de atendimento -- apenas o
 * formato das chamadas. A credencial e entregue por canal privado.
 *
 * Pagina estatica, sem consulta ao banco: documentacao nao pode cair junto com
 * o banco, e e nela que o outro lado vai olhar quando algo falhar.
 */

export const metadata: Metadata = {
  title: "API de Integração | FNVJ x TRACKen",
  description:
    "Contrato da API que recebe os acionamentos de remoção de atraso enviados pela TRACKen ao Fique no Verde Já.",
};

const BASE_URL = "https://fiquenoverdeja.com.br";

const NAV = [
  { id: "visao-geral", label: "Visão geral" },
  { id: "autenticacao", label: "Autenticação" },
  { id: "enviar", label: "Enviar acionamentos" },
  { id: "campos", label: "Campos do item" },
  { id: "resposta", label: "Resposta" },
  { id: "consultar", label: "Consultar" },
  { id: "status", label: "Status e negativas" },
  { id: "erros", label: "Erros" },
  { id: "limites", label: "Limites" },
];

const CAMPOS: FieldRow[] = [
  {
    name: "shipment_id",
    type: "string",
    required: true,
    description:
      "ID do envio no Mercado Livre. É a chave do atendimento: reenviar o mesmo valor não cria duplicado. Até 80 caracteres, letras, números, ponto, hífen e underscore.",
  },
  {
    name: "order_id",
    type: "string",
    required: true,
    description: "Número da venda no Mercado Livre. Mesmas regras de formato.",
  },
  {
    name: "carrier_name",
    type: "string",
    required: true,
    description:
      "Nome da transportadora, cliente da TRACKen. Aceita também o código, e a comparação ignora acento e maiúscula. Alternativamente use carrier_code.",
  },
  {
    name: "seller.name",
    type: "string",
    required: true,
    description: "Nome do seller vinculado à transportadora.",
  },
  {
    name: "sale_date",
    type: "string ISO 8601",
    required: true,
    description:
      "Data e hora da venda, com offset de fuso. Exemplo: 2026-09-02T09:15:00-03:00.",
  },
  {
    name: "shipping_deadline",
    type: "string ISO 8601",
    required: false,
    description:
      "Data e hora limite para o envio. Fortemente recomendado: é por ele que a fila é ordenada, filtrada e priorizada no painel. Sem ele o atendimento aparece em qualquer período.",
  },
  {
    name: "shipped_at",
    type: "string ISO 8601",
    required: false,
    description:
      "Data e hora em que o envio foi efetivamente realizado, quando já tiver ocorrido. Comparado com o limite para calcular o tamanho do atraso. Envie null se ainda não saiu.",
  },
  {
    name: "shipping_mode",
    type: "string",
    required: false,
    description:
      "Modalidade logística do Mercado Livre. self_service é FLEX. Fortemente recomendado: é o campo usado para validar que o envio é FLEX antes de tratarmos.",
  },
  {
    name: "buyer.nickname",
    type: "string",
    required: false,
    description: "Apelido ou username do comprador no Mercado Livre.",
  },
  {
    name: "buyer.name",
    type: "string",
    required: false,
    description: "Nome do comprador.",
  },
  {
    name: "seller.ml_id",
    type: "string",
    required: false,
    description: "ID do seller no Mercado Livre.",
  },
  {
    name: "service_type",
    type: "atraso | reclamacao | cancelado",
    required: false,
    description: "Tipo de serviço solicitado. Quando omitido, assume atraso.",
  },
  {
    name: "tracking_number",
    type: "string",
    required: false,
    description: "Código de rastreio do envio.",
  },
  {
    name: "pack_id",
    type: "string",
    required: false,
    description: "ID do pacote no Mercado Livre, quando houver.",
  },
  {
    name: "delay_reason",
    type: "string",
    required: false,
    description: "Motivo do atraso do envio, se a TRACKen já tiver essa informação.",
  },
  {
    name: "requested_by",
    type: "string",
    required: false,
    description: "Quem solicitou o acionamento do lado da TRACKen.",
  },
  {
    name: "tracken_ref",
    type: "string",
    required: false,
    description:
      "Referência interna da TRACKen. Guardamos e devolvemos, para facilitar a conciliação dos dois lados.",
  },
];

const ERROS = [
  {
    http: "400",
    code: "INVALID_JSON, EMPTY_BODY, INVALID_PAYLOAD, EMPTY_BATCH",
    quando: "Corpo ausente, mal formado, ou sem a lista items.",
  },
  {
    http: "401",
    code: "UNAUTHORIZED",
    quando:
      "Credencial ausente, inválida, inativa, expirada, ou assinatura faltando quando ela é exigida.",
  },
  {
    http: "403",
    code: "FORBIDDEN, IP_NOT_ALLOWED, SIGNATURE_NOT_CONFIGURED",
    quando:
      "Credencial sem o escopo necessário, IP fora da lista permitida, ou problema de configuração da assinatura.",
  },
  {
    http: "404",
    code: "NOT_FOUND",
    quando: "Consulta a um shipment_id que não existe.",
  },
  {
    http: "413",
    code: "PAYLOAD_TOO_LARGE",
    quando: "Lote acima de 200 itens.",
  },
  {
    http: "429",
    code: "RATE_LIMITED",
    quando: "Mais de 120 chamadas por minuto com a mesma credencial.",
  },
  {
    http: "500",
    code: "INTERNAL_ERROR",
    quando: "Falha do nosso lado. Pode repetir a chamada.",
  },
];

const REQUEST_EXAMPLE = `{
  "items": [
    {
      "shipment_id": "44998877665",
      "order_id": "2000009876543210",
      "carrier_name": "TM Transportes",
      "buyer": {
        "nickname": "joao_ml",
        "name": "João da Silva"
      },
      "seller": {
        "name": "Loja Exemplo",
        "ml_id": "123456789"
      },
      "shipping_mode": "self_service",
      "sale_date": "2026-09-02T09:15:00-03:00",
      "shipping_deadline": "2026-09-03T14:24:00-03:00",
      "shipped_at": null,
      "service_type": "atraso",
      "tracken_ref": "TRK-2026-000123"
    }
  ]
}`;

const RESPONSE_EXAMPLE = `{
  "received": 3,
  "created": 1,
  "duplicated": 1,
  "rejected": 1,
  "results": [
    {
      "shipment_id": "44998877665",
      "status": "created",
      "ticket_id": "9f1c2e40-5b7a-4c31-8f0d-2a6b9c8d7e11",
      "ticket_status": "recepcionado"
    },
    {
      "shipment_id": "44998877666",
      "status": "duplicated",
      "ticket_id": "1b2c3d40-aaaa-bbbb-cccc-2a6b9c8d7e22",
      "ticket_status": "em_atendimento",
      "message": "Envio ja recebido anteriormente"
    },
    {
      "shipment_id": "44998877667",
      "status": "rejected",
      "code": "UNKNOWN_CARRIER",
      "message": "Transportadora \\"Jadlog\\" nao cadastrada. Cadastradas: J3 (J3 Logistica), PEX (PEX Entregas), TM (TM Transportes), TRANSMOTO (Transmoto)"
    }
  ]
}`;

const CURL_EXAMPLE = `# 1) Monte o corpo
BODY='{"items":[{"shipment_id":"44998877665","order_id":"2000009876543210","carrier_name":"TM Transportes","seller":{"name":"Loja Exemplo"},"shipping_mode":"self_service","sale_date":"2026-09-02T09:15:00-03:00","shipping_deadline":"2026-09-03T14:24:00-03:00"}]}'

# 2) Assine: HMAC-SHA256 de "<timestamp>.<corpo>"
TS=$(date +%s)
SIG=$(printf '%s.%s' "$TS" "$BODY" \\
  | openssl dgst -sha256 -hmac "$SECRET" \\
  | awk '{print $2}')

# 3) Envie
curl -X POST ${BASE_URL}/api/tracken/v1/tickets \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $API_KEY.$SECRET" \\
  -H "X-FNVJ-Timestamp: $TS" \\
  -H "X-FNVJ-Signature: sha256=$SIG" \\
  -d "$BODY"`;

const NODE_EXAMPLE = `import crypto from "node:crypto";

const API_KEY = process.env.FNVJ_API_KEY;
const SECRET  = process.env.FNVJ_API_SECRET;

export async function enviarAcionamentos(items) {
  // O corpo precisa ser a MESMA string que vai ser assinada e enviada.
  // Serializar duas vezes gera bytes diferentes e a assinatura nao fecha.
  const body = JSON.stringify({ items });

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = "sha256=" + crypto
    .createHmac("sha256", SECRET)
    .update(\`\${timestamp}.\${body}\`, "utf8")
    .digest("hex");

  const response = await fetch(
    "${BASE_URL}/api/tracken/v1/tickets",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \`Bearer \${API_KEY}.\${SECRET}\`,
        "X-FNVJ-Timestamp": timestamp,
        "X-FNVJ-Signature": signature,
      },
      body,
    }
  );

  return response.json();
}`;

const GET_LIST_EXAMPLE = `curl "${BASE_URL}/api/tracken/v1/tickets?status=em_atendimento&from=2026-09-01&to=2026-09-02&page=1&page_size=50" \\
  -H "Authorization: Bearer $API_KEY.$SECRET" \\
  -H "X-FNVJ-Timestamp: $TS" \\
  -H "X-FNVJ-Signature: sha256=$SIG"

# Na consulta o corpo e vazio, entao a base assinada e "<timestamp>."`;

const GET_ONE_EXAMPLE = `{
  "ticket": {
    "shipment_id": "44998877665",
    "order_id": "2000009876543210",
    "status": "removido",
    "status_label": "Removido",
    "carrier_code": "TM",
    "service_type": "atraso",
    "shipping_mode": "self_service",
    "seller_name": "Loja Exemplo",
    "buyer_nickname": "joao_ml",
    "buyer_name": "João da Silva",
    "assigned_to": "Bruna Castro",
    "sale_date": "2026-09-02T12:15:00.000Z",
    "shipping_deadline": "2026-09-03T17:24:00.000Z",
    "shipped_at": "2026-09-03T19:02:00.000Z",
    "received_at": "2026-09-02T13:10:00.000Z",
    "started_at": "2026-09-02T13:41:00.000Z",
    "finished_at": "2026-09-03T10:22:00.000Z",
    "ml_claim_id": "ML349586672BR",
    "resolution_note": null
  }
}`;

const STATUS = [
  {
    code: "recepcionado",
    label: "Recepcionado",
    icon: Inbox,
    tone: "bg-blue-50 text-blue-700 border-blue-200",
    desc: "Estado inicial. O acionamento chegou e entrou na fila.",
  },
  {
    code: "em_atendimento",
    label: "Em Atendimento",
    icon: Clock,
    tone: "bg-amber-50 text-amber-700 border-amber-200",
    desc: "Um atendente assumiu e está trabalhando o caso.",
  },
  {
    code: "removido",
    label: "Removido",
    icon: ListChecks,
    tone: "bg-green-50 text-green-700 border-green-200",
    desc: "Atraso removido com sucesso. Estado final.",
  },
  {
    code: "negado",
    label: "Negado",
    icon: Ban,
    tone: "bg-red-50 text-red-700 border-red-200",
    desc: "Pedido recusado. Sempre acompanha um dos três motivos abaixo. Estado final.",
  },
  {
    code: "cancelado",
    label: "Cancelado",
    icon: TriangleAlert,
    tone: "bg-slate-100 text-slate-700 border-slate-200",
    desc: "Atendimento cancelado. Estado final.",
  },
];

export default function TrackenApiDocsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* ---------- Topo ---------- */}
      <header className="border-b border-slate-200 bg-gradient-to-br from-[#0d9c40] via-[#048842] to-[#02652f]">
        {/* Topo mais justo que a base: 40px acima da marca deixava um vazio
            verde sem funcao antes do conteudo comecar. */}
        <div className="mx-auto max-w-[1200px] px-5 pb-10 pt-5 sm:px-8 sm:pb-14 sm:pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <FnvjLogo className="h-9 w-auto" onDark />
            <Link
              href="/tracken/login"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3.5 py-2 text-[15px] font-semibold text-white transition-colors hover:bg-white/10"
            >
              Acessar o painel
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </Link>
          </div>

          <p className="mt-9 text-[14px] font-bold uppercase tracking-[0.14em] text-white/70">
            Integração FNVJ × TRACKen
          </p>
          <h1 className="mt-2 text-[34px] font-bold leading-[1.1] tracking-[-0.025em] text-white sm:text-[46px]">
            API de acionamentos
          </h1>
          <p className="mt-4 max-w-3xl text-[18px] leading-relaxed text-white/85 sm:text-[20px]">
            Como a TRACKen envia ao Fique no Verde Já os pedidos de remoção de
            atraso do Mercado Livre, e como consultar o andamento de cada um.
          </p>

          {/* `copiavel` marca o que o dev vai colar em configuracao. Versao e
              formato sao informativos, nao se copia "JSON · UTF-8". */}
          <dl className="mt-7 flex flex-wrap gap-3">
            {[
              { termo: "URL base", valor: BASE_URL, mostrar: BASE_URL.replace("https://", ""), copiavel: true },
              { termo: "Versão", valor: "v1", mostrar: "v1", copiavel: false },
              { termo: "Formato", valor: "", mostrar: "JSON · UTF-8", copiavel: false },
              { termo: "Fuso das datas", valor: "", mostrar: "ISO 8601 com offset", copiavel: false },
            ].map((item) => (
              <div
                key={item.termo}
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 backdrop-blur"
              >
                <dt className="text-[12.5px] font-bold uppercase tracking-wider text-white/60">
                  {item.termo}
                </dt>
                <dd className="mt-0.5 flex items-center gap-1.5 font-mono text-[15px] font-semibold text-white">
                  {item.mostrar}
                  {item.copiavel && (
                    <CopyInline
                      value={item.valor}
                      description={item.termo}
                      tone="dark"
                    />
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1200px] gap-12 px-5 py-12 sm:px-8">
        {/* ---------- Menu lateral ---------- */}
        <nav
          className="sticky top-8 hidden h-fit w-56 shrink-0 xl:block"
          aria-label="Sumário"
        >
          <p className="text-[12.5px] font-bold uppercase tracking-wider text-slate-400">
            Nesta página
          </p>
          <ul className="mt-3 space-y-1 border-l border-slate-200">
            {NAV.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-[15.5px] text-slate-600 transition-colors hover:border-[var(--tk-brand)] hover:text-[var(--tk-brand-strong)]"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* ---------- Conteudo ---------- */}
        <main className="min-w-0 flex-1">
          {/* ===== Visao geral ===== */}
          <section id="visao-geral" className="scroll-mt-24">
            <h2 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-slate-900 sm:text-[32px]">
              Visão geral
            </h2>
            <p className="mt-5 text-[17px] leading-relaxed text-slate-700">
              A integração tem dois fluxos, em sentidos opostos. Eles são
              independentes e cada lado expõe o seu próprio endereço.
            </p>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border-2 border-[var(--tk-brand)] bg-[var(--tk-brand-wash)] p-5">
                <p className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-[var(--tk-brand-strong)]">
                  <Send className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  Fluxo 1 · disponível agora
                </p>
                <p className="mt-2.5 text-[19px] font-bold leading-snug text-slate-900">
                  TRACKen envia o acionamento
                </p>
                <p className="mt-2 text-[16.5px] leading-relaxed text-slate-700">
                  A TRACKen chama o nosso endpoint. Nós fornecemos a URL e a
                  credencial. É o que está documentado nesta página.
                </p>
                <p className="mt-3.5 font-mono text-[15px] font-semibold text-[var(--tk-brand-strong)]">
                  TRACKen → FNVJ
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-slate-500">
                  <ArrowLeftRight
                    className="h-4 w-4"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  Fluxo 2 · próxima etapa
                </p>
                <p className="mt-2.5 text-[19px] font-bold leading-snug text-slate-900">
                  FNVJ devolve a mudança de status
                </p>
                <p className="mt-2 text-[16.5px] leading-relaxed text-slate-700">
                  A cada mudança de status o Fique no Verde Já notifica a
                  TRACKen. A fila de saída já registra todas as mudanças; o
                  envio é habilitado quando o endereço de destino estiver
                  definido entre os times.
                </p>
                <p className="mt-3.5 font-mono text-[15px] font-semibold text-slate-500">
                  FNVJ → TRACKen
                </p>
              </div>
            </div>

            <Callout icon={Info} title="Esta página é pública, a credencial não">
              Aqui está apenas o formato das chamadas. A <code>api_key</code> e o{" "}
              <code>secret</code> são entregues por canal privado e nunca
              aparecem nesta página.
            </Callout>
          </section>

          {/* ===== Autenticacao ===== */}
          <Section
            id="autenticacao"
            eyebrow="Passo 1"
            title="Autenticação"
          >
            <p>
              Toda chamada usa uma credencial de máquina. Não há login de
              usuário nem sessão nesta API.
            </p>

            <SubTitle>Credencial</SubTitle>
            <p>
              Envie a chave e o segredo juntos no header{" "}
              <code>Authorization</code>, separados por ponto:
            </p>
            <CodeBlock
              language="http"
              label="Header obrigatório"
              code={`Authorization: Bearer <api_key>.<secret>`}
            />
            <p className="mt-4">
              Se preferir separar, aceitamos também dois headers no lugar dele:
            </p>
            <ul className="mt-3 space-y-2">
              {["X-FNVJ-Api-Key", "X-FNVJ-Api-Secret"].map((header) => (
                <li
                  key={header}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2"
                >
                  <code className="font-mono text-[16px] font-semibold text-slate-900">
                    {header}
                  </code>
                  <CopyInline value={header} description={`header ${header}`} />
                </li>
              ))}
            </ul>

            <SubTitle>Assinatura HMAC</SubTitle>
            <p>
              Além da credencial, cada chamada é assinada. Isso impede que uma
              requisição capturada seja reenviada depois por terceiros.
            </p>
            <FieldTable
              rows={[
                {
                  name: "X-FNVJ-Timestamp",
                  type: "string",
                  required: true,
                  copiavel: true,
                  description:
                    "Momento da chamada em unix timestamp, em segundos. Aceitamos uma diferença de até 5 minutos em relação ao nosso relógio.",
                },
                {
                  name: "X-FNVJ-Signature",
                  type: "string",
                  required: true,
                  copiavel: true,
                  description:
                    "sha256= seguido do HMAC-SHA256, em hexadecimal, da string <timestamp>.<corpo bruto>, usando o secret como chave.",
                },
              ]}
            />

            <Callout icon={ShieldAlert} title="Assine o corpo exato que será enviado" tone="warn">
              A assinatura é calculada sobre a string do corpo, byte a byte. Se
              o JSON for serializado duas vezes, com espaçamento ou ordem de
              chaves diferente, a assinatura não fecha e a resposta é{" "}
              <strong>401</strong>. Gere a string uma vez, assine essa string e
              envie essa mesma string.
            </Callout>

            <CodeBlock
              language="Node.js"
              label="Assinando e enviando"
              code={NODE_EXAMPLE}
            />
          </Section>

          {/* ===== Enviar ===== */}
          <Section
            id="enviar"
            eyebrow="Passo 2"
            title="Enviar acionamentos"
          >
            <Endpoint
              method="POST"
              path="/api/tracken/v1/tickets"
              baseUrl={BASE_URL}
            />
            <p className="mt-5">
              Envie um ou vários acionamentos numa chamada. O corpo é um objeto
              com a lista <code>items</code>, de 1 até 200 elementos.
            </p>

            <Callout icon={KeyRound} title="Reenviar é seguro">
              O <code>shipment_id</code> é a chave do atendimento. Reenviar um
              valor já recebido não cria duplicado e não devolve erro: o item
              volta marcado como <code>duplicated</code>, com o estado atual do
              atendimento. Ou seja, dá para repetir o lote inteiro sem medo
              depois de uma falha de rede.
            </Callout>

            <CodeBlock language="JSON" label="Requisição" code={REQUEST_EXAMPLE} />
            <CodeBlock language="bash" label="Exemplo com curl" code={CURL_EXAMPLE} />
          </Section>

          {/* ===== Campos ===== */}
          <Section
            id="campos"
            eyebrow="Referência"
            title="Campos de cada item"
          >
            <p>
              Cinco campos são obrigatórios. Os dois marcados como fortemente
              recomendados não bloqueiam o recebimento, mas sem eles parte do
              painel deixa de funcionar como deveria.
            </p>
            <FieldTable rows={CAMPOS} />

            <Callout icon={Info} title="Sobre as datas">
              Sempre em ISO 8601 com offset de fuso, como{" "}
              <code>2026-09-02T09:15:00-03:00</code>. Guardamos o instante
              absoluto e exibimos no fuso da operação,{" "}
              <code>America/Sao_Paulo</code>. Data sem offset é ambígua e será
              recusada.
            </Callout>
          </Section>

          {/* ===== Resposta ===== */}
          <Section
            id="resposta"
            eyebrow="Referência"
            title="Resposta do envio"
          >
            <p>
              A resposta é item por item. Um item inválido não derruba o lote: os
              válidos são gravados e os problemáticos voltam com o motivo. Confira
              sempre a lista <code>results</code>, não apenas o código HTTP.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                ["created", "Atendimento criado", "bg-green-50 text-green-800 border-green-200"],
                ["duplicated", "Já existia, nada mudou", "bg-blue-50 text-blue-800 border-blue-200"],
                ["rejected", "Recusado, veja code e message", "bg-red-50 text-red-800 border-red-200"],
              ].map(([code, desc, tone]) => (
                <div key={code} className={`rounded-xl border px-4 py-3.5 ${tone}`}>
                  <p className="font-mono text-[16px] font-bold">{code}</p>
                  <p className="mt-1 text-[15.5px] leading-snug">{desc}</p>
                </div>
              ))}
            </div>

            <CodeBlock
              language="JSON"
              label="Resposta · HTTP 200"
              code={RESPONSE_EXAMPLE}
            />
          </Section>

          {/* ===== Consultar ===== */}
          <Section id="consultar" eyebrow="Opcional" title="Consultar atendimentos">
            <p>
              Além de enviar, a credencial permite consultar o andamento. Útil
              para conciliação, mesmo depois de o fluxo de volta estar ativo.
            </p>

            <SubTitle>Um atendimento</SubTitle>
            <Endpoint
              method="GET"
              path="/api/tracken/v1/tickets/{shipment_id}"
              baseUrl={BASE_URL}
            />
            <CodeBlock
              language="JSON"
              label="Resposta"
              code={GET_ONE_EXAMPLE}
            />

            <SubTitle>Lista com filtros</SubTitle>
            <Endpoint
              method="GET"
              path="/api/tracken/v1/tickets"
              baseUrl={BASE_URL}
            />
            <FieldTable
              rows={[
                {
                  name: "status",
                  type: "string",
                  required: false,
                  description: "Um dos cinco códigos de status.",
                },
                {
                  name: "carrier",
                  type: "string",
                  required: false,
                  description: "Código da transportadora.",
                },
                {
                  name: "from",
                  type: "YYYY-MM-DD",
                  required: false,
                  description: "Recebidos a partir desta data, inclusive.",
                },
                {
                  name: "to",
                  type: "YYYY-MM-DD",
                  required: false,
                  description: "Recebidos até esta data, inclusive.",
                },
                {
                  name: "page",
                  type: "número",
                  required: false,
                  description: "Página, começando em 1.",
                },
                {
                  name: "page_size",
                  type: "número",
                  required: false,
                  description: "Itens por página, padrão 50, máximo 100.",
                },
              ]}
            />
            <CodeBlock language="bash" label="Exemplo" code={GET_LIST_EXAMPLE} />
          </Section>

          {/* ===== Status ===== */}
          <Section
            id="status"
            eyebrow="Referência"
            title="Status e motivos de negativa"
          >
            <p>
              São cinco status, definidos do lado do Fique no Verde Já. São eles
              que serão informados no fluxo de volta.
            </p>

            <ul className="mt-6 space-y-3">
              {STATUS.map((status) => {
                const Icon = status.icon;
                return (
                  <li
                    key={status.code}
                    className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-4"
                  >
                    <span
                      className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-[15px] font-bold ${status.tone}`}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                      {status.label}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <code className="font-mono text-[15px] font-semibold text-slate-500">
                          {status.code}
                        </code>
                        <CopyInline
                          value={status.code}
                          description={`código do status ${status.label}`}
                        />
                      </span>
                      <span className="mt-1 block text-[16.5px] leading-relaxed text-slate-700">
                        {status.desc}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>

            <SubTitle>Os três motivos de negativa</SubTitle>
            <p>
              Quando o status é <code>negado</code>, ele sempre vem acompanhado
              de exatamente um destes motivos. A lista é fechada.
            </p>
            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              {DENIAL_REASONS.map((reason) => (
                <div
                  key={reason.code}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-4"
                >
                  <span className="flex items-center gap-1">
                    <code className="font-mono text-[14.5px] font-bold text-red-700">
                      {reason.code}
                    </code>
                    <CopyInline
                      value={reason.code}
                      description={`código do motivo ${reason.label}`}
                    />
                  </span>
                  <p className="mt-1.5 text-[16.5px] font-semibold leading-snug text-red-950">
                    {reason.label}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          {/* ===== Erros ===== */}
          <Section id="erros" eyebrow="Referência" title="Erros">
            <p>
              Todo erro devolve o mesmo envelope, com um código estável para
              tratar em código e uma mensagem para leitura humana.
            </p>
            <CodeBlock
              language="JSON"
              label="Formato do erro"
              code={`{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Credencial ausente: envie Authorization: Bearer <api_key>.<secret>"
  }
}`}
            />

            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th
                      scope="col"
                      className="px-4 py-3 text-[13px] font-bold uppercase tracking-wide text-slate-500"
                    >
                      HTTP
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-[13px] font-bold uppercase tracking-wide text-slate-500"
                    >
                      Código
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-[13px] font-bold uppercase tracking-wide text-slate-500"
                    >
                      Quando acontece
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ERROS.map((erro) => (
                    <tr
                      key={erro.http}
                      className="border-b border-slate-100 align-top last:border-0"
                    >
                      <td className="px-4 py-3.5 font-mono text-[16px] font-bold text-slate-900">
                        {erro.http}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[14.5px] text-slate-600">
                        {erro.code}
                      </td>
                      <td className="px-4 py-3.5 text-[16px] leading-relaxed text-slate-700">
                        {erro.quando}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Callout icon={TriangleAlert} title="HTTP 200 não significa que tudo entrou" tone="warn">
              O envio aceita falha parcial. Um lote com itens recusados ainda
              responde <strong>200</strong>, com o detalhe em{" "}
              <code>results</code> e a contagem em <code>rejected</code>. Trate
              a lista, não só o status da resposta.
            </Callout>
          </Section>

          {/* ===== Limites ===== */}
          <Section id="limites" eyebrow="Operação" title="Limites">
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["200 itens", "por chamada, na lista items"],
                ["120 chamadas", "por minuto, por credencial"],
                ["5 minutos", "de tolerância do timestamp da assinatura"],
                ["80 caracteres", "nos identificadores de envio e venda"],
              ].map(([valor, desc]) => (
                <div
                  key={valor}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4"
                >
                  <p className="text-[24px] font-bold leading-none text-slate-900">
                    {valor}
                  </p>
                  <p className="mt-2 text-[16.5px] leading-snug text-slate-600">
                    {desc}
                  </p>
                </div>
              ))}
            </div>

            <Callout icon={Lock} title="Restrição por IP, se quiserem" >
              A credencial aceita uma lista de IPs autorizados. Se a TRACKen
              informar de quais endereços as chamadas vão sair, configuramos e
              qualquer outra origem passa a ser recusada com{" "}
              <strong>403</strong>.
            </Callout>
          </Section>

          {/* ---------- Rodape ---------- */}
          <footer className="mt-16 border-t border-slate-200 pt-8">
            <p className="text-[16px] leading-relaxed text-slate-500">
              Documentação da integração FNVJ × TRACKen, versão v1. Dúvidas sobre
              o contrato, credenciais ou ambiente de teste: fale com o time de
              desenvolvimento do Fique no Verde Já.
            </p>
            <Link
              href="/tracken/login"
              className="mt-4 inline-flex items-center gap-1.5 text-[16.5px] font-semibold text-[var(--tk-brand-strong)] hover:underline"
            >
              Acessar o painel de atendimento
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </Link>
          </footer>
        </main>
      </div>
    </div>
  );
}
