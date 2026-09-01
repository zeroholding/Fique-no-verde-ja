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
  environment: string;
  scopes: string[];
  require_signature: boolean;
  has_encrypted_secret: boolean;
  allowed_ips: string[];
  webhook_url: string | null;
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

type Settings = {
  canManage: boolean;
  credentials: Credential[];
  statuses: StatusRow[];
  outbox: {
    pending: number;
    sent: number;
    failed: number;
    dead: number;
    recent: OutboxRow[];
  };
  requestLog: { last7Days: number; errors: number; lastAt: string | null };
  workerImplemented: boolean;
};

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

          {!data.workerImplemented && data.outbox.pending > 0 && (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true" strokeWidth={1.75} />
              <span>
                <strong>O worker de envio ainda nao existe.</strong> As
                notificacoes estao sendo gravadas na fila corretamente, mas nada
                as entrega para a TRACKen ainda. Enquanto isso, eles podem
                consultar o estado dos atendimentos pelo{" "}
                <code className="rounded bg-amber-100 px-1 py-0.5 text-[11px]">
                  GET /api/tracken/v1/tickets
                </code>
                .
              </span>
            </p>
          )}

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
                    <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
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
                        <td className="py-2.5 pr-3 text-sm text-slate-800">
                          {credential.name}
                        </td>

                        <td className="py-2.5 pr-3">
                          <span className="flex items-center gap-1.5">
                            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
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
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              credential.environment === "production"
                                ? "bg-green-50 text-green-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {credential.environment === "production"
                              ? "Producao"
                              : "Sandbox"}
                          </span>
                        </td>

                        <td className="py-2.5 pr-3">
                          {credential.require_signature ? (
                            <span className="flex items-center gap-1 text-xs font-medium text-green-700">
                              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.75} />
                              HMAC exigido
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs font-medium text-amber-700">
                              <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={1.75} />
                              Sem assinatura
                            </span>
                          )}
                          {credential.require_signature &&
                            !credential.has_encrypted_secret && (
                              <span className="block text-[10px] text-red-600">
                                Secret cifrado ausente
                              </span>
                            )}
                        </td>

                        <td className="py-2.5 pr-3">
                          <span className="text-[11px] text-slate-600">
                            {credential.scopes.join(", ")}
                          </span>
                        </td>

                        <td className="py-2.5 pr-3 text-xs text-slate-600">
                          {credential.last_used_at
                            ? `${formatDate(credential.last_used_at)} ${formatTime(credential.last_used_at)}`
                            : "Nunca"}
                        </td>

                        <td className="py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
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
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Emitir ou revogar credencial
              </p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-slate-600">
{`node scripts/tracken_credential.mjs genkey
node scripts/tracken_credential.mjs create "Tracken Producao" production
node scripts/tracken_credential.mjs list
node scripts/tracken_credential.mjs revoke <api_key>`}
              </pre>
              <p className="mt-2 text-[11px] text-slate-500">
                O secret aparece uma unica vez, no terminal. Depois disso so
                ficam gravados o hash e a copia cifrada, entao nao ha como
                recupera-lo: perdido, emita outra credencial.
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
                    <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
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
                            <span className="ml-1 text-[10px] text-slate-400">
                              inicial
                            </span>
                          )}
                          {status.is_final && (
                            <span className="ml-1 text-[10px] text-slate-400">
                              final
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          <code className="text-[11px] text-slate-500">
                            {status.code}
                          </code>
                        </td>
                        <td className="py-2.5 pr-3 text-[11px] text-slate-600">
                          {status.allowed_next.length > 0
                            ? status.allowed_next.join(", ")
                            : "-"}
                        </td>
                        <td className="py-2.5 text-[11px] text-slate-600">
                          {status.counts_as_sla ? "Conta" : "Nao conta"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-[11px] text-slate-500">
                Os status vivem em tabela de configuracao
                (<code className="text-[10px]">tracken_status_map</code>), nao no
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
                      <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
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
                            <code className="text-[11px] text-slate-700">
                              {item.event_type}
                            </code>
                            <span className="block text-[10px] text-slate-400">
                              {formatDate(item.created_at)} {formatTime(item.created_at)}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-[11px] text-slate-600">
                            {item.shipment_id}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
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
                                className="block max-w-[160px] truncate text-[10px] text-red-500"
                                title={item.last_error}
                              >
                                {item.last_error}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 text-[11px] tabular-nums text-slate-600">
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
                    <dt className="text-[10px] uppercase tracking-wide text-slate-400">
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
            <p className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-[11px] text-slate-500 shadow-sm">
              Voce esta vendo esta tela em modo leitura. Alterar transportadoras e
              emitir credenciais exige perfil administrativo.
            </p>
          )}
        </>
      ) : null}
    </PageShell>
  );
}
