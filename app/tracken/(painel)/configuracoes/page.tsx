"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Key,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { StatusBadge } from "@/components/tracken/Badges";
import {
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  PageShell,
  PrimaryButton,
  StatTile,
} from "@/components/tracken/PageShell";
import { formatDate, formatNumber, formatTime } from "@/lib/tracken/format";
import type { TrackenEnvironment } from "@/lib/tracken/types";

/**
 * Tela "Configuracoes": credenciais da API, mapa de status e fila de saida.
 *
 * Nada de segredo aparece aqui. A tela mostra a api_key (identificador publico)
 * e apenas se existe secret cifrado gravado. Emitir credencial e operacao de
 * terminal, com o script scripts/tracken_credential.mjs, para o secret ser
 * exibido uma unica vez em um canal controlado.
 */

type Credential = {
  id: string;
  name: string;
  api_key: string;
  environment: TrackenEnvironment;
  scopes: string[];
  require_signature: boolean;
  has_encrypted_secret: boolean;
  allowed_ips: string[];
  has_webhook_secret: boolean;
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
};

type StatusRow = {
  code: string;
  label: string;
  tracken_status: string | null;
  color: string;
  sort_order: number;
  is_initial: boolean;
  is_final: boolean;
  counts_as_sla: boolean;
  allowed_next: string[];
  is_active: boolean;
};

type OutboxRow = {
  id: string;
  shipment_id: string;
  environment: TrackenEnvironment;
  event_type: string;
  status: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  last_http_status: number | null;
  sent_at: string | null;
  created_at: string;
};

type OutboxTotals = {
  pending: number;
  sent: number;
  failed: number;
  dead: number;
};

type WebhookHealth = {
  configured: boolean;
  signed: boolean;
  destinations: number;
  usable: boolean;
  blockedReason: string | null;
  /** Apenas origin + pathname; query string nunca chega ao navegador. */
  endpoint: string | null;
};

type Settings = {
  canManage: boolean;
  credentials: Credential[];
  statuses: StatusRow[];
  outbox: OutboxTotals & {
    recent: OutboxRow[];
    byEnvironment: Record<TrackenEnvironment, OutboxTotals>;
  };
  requestLog: { last7Days: number; errors: number; lastAt: string | null };
  webhook: Omit<WebhookHealth, "endpoint"> & {
    byEnvironment: Record<TrackenEnvironment, WebhookHealth>;
  };
};

const ENVIRONMENTS: Array<{
  value: TrackenEnvironment;
  label: string;
}> = [
  { value: "production", label: "Producao" },
  { value: "sandbox", label: "Homologacao" },
];

export default function ConfiguracoesPage() {
  const [data, setData] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (options?.silent) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/tracken/settings", {
        credentials: "include",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? "Falha ao carregar configuracoes"
        );
      }

      setData(payload as Settings);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar configuracoes"
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copiar = async (valor: string) => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopied(valor);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Configuracoes"
        subtitle="Credenciais da API da TRACKen, mapa de status e fila de notificacoes"
        actions={
          <PrimaryButton
            type="button"
            onClick={() => load({ silent: true })}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" strokeWidth={1.75} />
            ) : (
              <RefreshCw
                className="h-4 w-4"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            )}
            Atualizar
          </PrimaryButton>
        }
      />

      {error && <ErrorBanner message={error} />}

      {isLoading && !data ? (
        <LoadingState label="Carregando configuracoes..." />
      ) : data ? (
        <>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Credenciais ativas"
              value={data.credentials.filter((c) => c.is_active).length}
              hint={`${data.credentials.length} cadastradas`}
              color="blue"
              icon={Key}
            />
            <StatTile
              label="Fila pendente"
              value={data.outbox.pending}
              hint="Aguardando envio para a TRACKen"
              color={data.outbox.pending > 0 ? "amber" : "green"}
              icon={Send}
            />
            <StatTile
              label="Falhas na fila"
              value={data.outbox.failed + data.outbox.dead}
              hint={`${data.outbox.dead} esgotaram as tentativas`}
              color={data.outbox.failed + data.outbox.dead > 0 ? "red" : "green"}
              icon={AlertTriangle}
            />
            <StatTile
              label="Chamadas em 7 dias"
              value={data.requestLog.last7Days}
              hint={`${data.requestLog.errors} com erro`}
              color="purple"
              icon={ShieldCheck}
            />
          </div>

          <Card
            className="mt-4"
            title="Saude dos webhooks por ambiente"
            description="Cada fila tem destino, assinatura e backlog independentes"
          >
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {ENVIRONMENTS.map(({ value, label }) => {
                const webhook = data.webhook.byEnvironment[value];
                const outbox = data.outbox.byEnvironment[value];

                return (
                  <section
                    key={value}
                    aria-labelledby={`webhook-${value}`}
                    className={`rounded-xl border p-4 ${
                      webhook.usable
                        ? "border-green-200 bg-green-50/60"
                        : "border-red-200 bg-red-50/60"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3
                          id={`webhook-${value}`}
                          className="text-[15px] font-bold text-slate-900"
                        >
                          {label}
                        </h3>
                        <p className="mt-0.5 text-[12.5px] text-slate-500">
                          Ambiente <code>{value}</code>
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold ${
                          webhook.usable
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {webhook.usable ? (
                          <CheckCircle2
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                            strokeWidth={1.75}
                          />
                        ) : (
                          <AlertTriangle
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                            strokeWidth={1.75}
                          />
                        )}
                        {webhook.usable ? "Utilizavel" : "Indisponivel"}
                      </span>
                    </div>

                    <div className="mt-3 rounded-lg bg-white/80 px-3 py-2">
                      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">
                        Endpoint sanitizado
                      </p>
                      <code className="mt-1 block break-all text-[12.5px] text-slate-700">
                        {webhook.endpoint ?? "Nao configurado"}
                      </code>
                      <p className="mt-1 text-[12px] text-slate-500">
                        {webhook.signed
                          ? "Entregas assinadas com HMAC"
                          : "Sem assinatura de saida utilizavel"}
                      </p>
                    </div>

                    {!webhook.usable && webhook.blockedReason && (
                      <p className="mt-3 flex items-start gap-1.5 text-[12.5px] leading-relaxed text-red-800">
                        <AlertTriangle
                          className="mt-0.5 h-3.5 w-3.5 shrink-0"
                          aria-hidden="true"
                          strokeWidth={1.75}
                        />
                        <span>{webhook.blockedReason}</span>
                      </p>
                    )}

                    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        { label: "Pendentes", value: outbox.pending },
                        { label: "Enviadas", value: outbox.sent },
                        { label: "Falhas", value: outbox.failed },
                        { label: "Esgotadas", value: outbox.dead },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="rounded-lg bg-white/80 px-2 py-2 text-center"
                        >
                          <dt className="text-[10.5px] uppercase tracking-wide text-slate-400">
                            {item.label}
                          </dt>
                          <dd className="mt-0.5 font-bold tabular-nums text-slate-800">
                            {formatNumber(item.value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                );
              })}
            </div>
          </Card>

          <Card
            className="mt-4"
            title="Credenciais da API"
            description="Identificadores usados pela TRACKen para chamar a FNVJ"
          >
            {data.credentials.length === 0 ? (
              <EmptyState
                icon={Key}
                title="Nenhuma credencial emitida"
                hint="Use o script scripts/tracken_credential.mjs para emitir a primeira."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-[12.5px] font-semibold uppercase tracking-wide text-slate-500">
                      <th scope="col" className="py-2 pr-3">Nome</th>
                      <th scope="col" className="py-2 pr-3">API key</th>
                      <th scope="col" className="py-2 pr-3">Ambiente</th>
                      <th scope="col" className="py-2 pr-3">Assinatura</th>
                      <th scope="col" className="py-2 pr-3">Escopos</th>
                      <th scope="col" className="py-2 pr-3">Ultimo uso</th>
                      <th scope="col" className="py-2">Situacao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.credentials.map((credential) => (
                      <tr
                        key={credential.id}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="py-2.5 pr-3 text-[15px] text-slate-800">
                          {credential.name}
                        </td>

                        <td className="py-2.5 pr-3">
                          <span className="flex items-center gap-1.5">
                            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12.5px] text-slate-700">
                              {credential.api_key}
                            </code>
                            <button
                              type="button"
                              onClick={() => copiar(credential.api_key)}
                              className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                              aria-label="Copiar API key"
                            >
                              {copied === credential.api_key ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" strokeWidth={1.75} />
                              ) : (
                                <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                              )}
                            </button>
                          </span>
                        </td>

                        <td className="py-2.5 pr-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[12.5px] font-semibold ${
                              credential.environment === "production"
                                ? "bg-green-50 text-green-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {credential.environment === "production"
                              ? "Producao"
                              : "Homologacao"}
                          </span>
                        </td>

                        <td className="py-2.5 pr-3">
                          {credential.require_signature ? (
                            <span className="flex items-center gap-1 text-[13.5px] font-medium text-green-700">
                              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.75} />
                              HMAC exigido
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[13.5px] font-medium text-amber-700">
                              <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.75} />
                              Sem assinatura
                            </span>
                          )}
                          {credential.require_signature &&
                            !credential.has_encrypted_secret && (
                              <span className="block text-[11.5px] text-red-600">
                                Secret cifrado ausente
                              </span>
                            )}
                        </td>

                        <td className="py-2.5 pr-3">
                          <span className="text-[12.5px] text-slate-600">
                            {credential.scopes.join(", ")}
                          </span>
                        </td>

                        <td className="py-2.5 pr-3 text-[13.5px] text-slate-600">
                          {credential.last_used_at
                            ? `${formatDate(credential.last_used_at)} ${formatTime(credential.last_used_at)}`
                            : "Nunca"}
                        </td>

                        <td className="py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[12.5px] font-semibold ${
                              credential.is_active
                                ? "bg-green-50 text-green-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {credential.is_active ? "Ativa" : "Revogada"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 rounded-lg bg-slate-50 p-3">
              <p className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-500">
                Emitir credencial e definir o destino das notificacoes
              </p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[12.5px] leading-relaxed text-slate-600">
{`node scripts/tracken_credential.mjs genkey
$env:TRACKEN_CREDENTIAL_SECRET="<secret-api-base64url>"
node scripts/tracken_credential.mjs create "Tracken Producao" production
node scripts/tracken_credential.mjs create "Tracken Homologacao" sandbox
node scripts/tracken_credential.mjs list
node scripts/tracken_credential.mjs set-environment <api_key-atual> sandbox
node scripts/tracken_credential.mjs revoke <api_key>
$env:TRACKEN_WEBHOOK_SECRET="<secret-hmac-webhook>"
node scripts/tracken_credential.mjs webhook <api_key-production> https://seller.tracken.app.br/api/ferramentas/controle-reputacao/webhooks/fnvj
node scripts/tracken_credential.mjs webhook <api_key-sandbox> https://homologasellercore.tracken.dev.br/api/ferramentas/controle-reputacao/webhooks/fnvj
Remove-Item Env:TRACKEN_WEBHOOK_SECRET`}
              </pre>
              <p className="mt-2 text-[12.5px] text-slate-500">
                O script le o secret da API em
                <code className="mx-1 text-[11.5px]">
                  TRACKEN_CREDENTIAL_SECRET
                </code>
                e o secret de assinatura de saida em
                <code className="mx-1 text-[11.5px]">
                  TRACKEN_WEBHOOK_SECRET
                </code>
                . Nenhum deles vira argumento, log ou resposta do script.
                Omitir TRACKEN_WEBHOOK_SECRET preserva o valor ja configurado.
              </p>
            </div>
          </Card>

          {/* Duas tabelas de ~430px lado a lado em `lg:grid-cols-2` davam
              ~340px por coluna, entao cada card ganhava a sua propria rolagem
              horizontal. A divisao em duas colunas passa para `xl`, onde
              existe largura para as duas caberem. */}
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            <Card
              title="Mapa de status"
              description="Fluxo do atendimento e transicoes permitidas"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[380px] text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-[12.5px] font-semibold uppercase tracking-wide text-slate-500">
                      <th scope="col" className="py-2 pr-3">Status</th>
                      <th scope="col" className="py-2 pr-3">Codigo</th>
                      <th scope="col" className="py-2 pr-3">Vai para</th>
                      <th scope="col" className="py-2">SLA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.statuses.map((status) => (
                      <tr
                        key={status.code}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="py-2.5 pr-3">
                          <StatusBadge label={status.label} color={status.color} />
                          {status.is_initial && (
                            <span className="ml-1 text-[11.5px] text-slate-400">
                              inicial
                            </span>
                          )}
                          {status.is_final && (
                            <span className="ml-1 text-[11.5px] text-slate-400">
                              final
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          <code className="text-[12.5px] text-slate-500">
                            {status.code}
                          </code>
                        </td>
                        <td className="py-2.5 pr-3 text-[12.5px] text-slate-600">
                          {status.allowed_next.length > 0
                            ? status.allowed_next.join(", ")
                            : "-"}
                        </td>
                        <td className="py-2.5 text-[12.5px] text-slate-600">
                          {status.counts_as_sla ? "Conta" : "Nao conta"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-[12.5px] text-slate-500">
                Os status vivem em tabela de configuracao
                (<code className="text-[11.5px]">tracken_status_map</code>), nao no
                codigo. Ajustar o fluxo do atendimento e mudanca de dado, sem
                precisar de deploy.
              </p>
            </Card>

            <Card
              title="Fila de saida"
              description="Ultimas notificacoes destinadas a TRACKen"
            >
              {data.outbox.recent.length === 0 ? (
                <EmptyState
                  icon={Send}
                  title="Fila vazia"
                  hint="Nenhuma notificacao gerada ainda."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[380px] text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-[12.5px] font-semibold uppercase tracking-wide text-slate-500">
                        <th scope="col" className="py-2 pr-3">Evento</th>
                        <th scope="col" className="py-2 pr-3">Envio</th>
                        <th scope="col" className="py-2 pr-3">Situacao</th>
                        <th scope="col" className="py-2">Tentativas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.outbox.recent.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="py-2.5 pr-3">
                            <code className="text-[12.5px] text-slate-700">
                              {item.event_type}
                            </code>
                            <span
                              className={`ml-1.5 inline-flex rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ${
                                item.environment === "production"
                                  ? "bg-green-50 text-green-700"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {item.environment === "production"
                                ? "Producao"
                                : "Homologacao"}
                            </span>
                            <span className="block text-[11.5px] text-slate-400">
                              {formatDate(item.created_at)} {formatTime(item.created_at)}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-[12.5px] text-slate-600">
                            {item.shipment_id}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
                                item.status === "sent"
                                  ? "bg-green-50 text-green-700"
                                  : item.status === "pending"
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-red-50 text-red-700"
                              }`}
                            >
                              {item.status === "sent"
                                ? "Enviado"
                                : item.status === "pending"
                                  ? "Pendente"
                                  : item.status === "failed"
                                    ? "Falhou"
                                    : "Esgotado"}
                            </span>
                            {item.last_error && (
                              <span
                                className="block max-w-[160px] truncate text-[11.5px] text-red-500"
                                title={item.last_error}
                              >
                                {item.last_error}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 text-[12.5px] tabular-nums text-slate-600">
                            {item.attempts}/{item.max_attempts}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Era `grid-cols-4` fixo: no telefone davam quatro caixas de
                  ~60px, com "Esgotadas" quebrando em tres linhas. */}
              <dl className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                {[
                  { label: "Pendentes", value: data.outbox.pending },
                  { label: "Enviadas", value: data.outbox.sent },
                  { label: "Falhas", value: data.outbox.failed },
                  { label: "Esgotadas", value: data.outbox.dead },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-slate-50 p-2">
                    <dt className="text-[11.5px] uppercase tracking-wide text-slate-400">
                      {item.label}
                    </dt>
                    <dd className="mt-0.5 text-base font-bold tabular-nums text-slate-800">
                      {formatNumber(item.value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>

          {!data.canManage && (
            <p className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-[12.5px] text-slate-500 shadow-sm">
              Voce esta vendo esta tela em modo leitura. Alterar transportadoras e
              emitir credenciais exige perfil administrativo.
            </p>
          )}
        </>
      ) : null}
    </PageShell>
  );
}
