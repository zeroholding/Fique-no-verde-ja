"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Download,
  FileText,
  Loader2,
} from "lucide-react";
import { StatusBadge } from "@/components/tracken/Badges";
import { statusIcon } from "@/components/tracken/tokens";
import {
  Card,
  ErrorBanner,
  LoadingState,
  PageHeader,
  PageShell,
  PrimaryButton,
  ProgressRow,
  StatTile,
  kpiGridClass,
} from "@/components/tracken/PageShell";
import { useTrackenCatalogs } from "@/components/tracken/useTrackenCatalogs";
import type { PanelStats } from "@/components/tracken/panel-types";
import {
  formatNumber,
  formatPercent,
  formatShortDate,
  toInputDate,
} from "@/lib/tracken/format";

/**
 * Tela "Relatorios": resumo consolidado do periodo com exportacao.
 *
 * Os numeros vem do mesmo endpoint de estatisticas do painel, entao relatorio e
 * dashboard nunca divergem. A exportacao usa o mesmo construtor de filtros.
 */

const FIELD =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[15px] outline-none transition-colors focus:border-green-500 focus:ring-2 focus:ring-green-100";
const LABEL =
  "mb-1 block text-[12.5px] font-semibold uppercase tracking-wide text-slate-500";

/** Atalhos de periodo, para não digitar data toda vez. */
const ATALHOS = [
  { label: "Hoje", days: 0 },
  { label: "7 dias", days: 6 },
  { label: "30 dias", days: 29 },
  { label: "90 dias", days: 89 },
];

const hoje = new Date();

export default function RelatoriosPage() {
  const { carriers, statuses } = useTrackenCatalogs();

  const [startDate, setStartDate] = useState(
    toInputDate(new Date(hoje.getTime() - 29 * 24 * 3_600_000))
  );
  const [endDate, setEndDate] = useState(toInputDate(hoje));
  const [carrier, setCarrier] = useState("");
  const [status, setStatus] = useState("");

  const [stats, setStats] = useState<PanelStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (carrier) params.set("carrier", carrier);
    if (status) params.set("status", status);
    return params.toString();
  }, [startDate, endDate, carrier, status]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/tracken/stats?${queryString}`, {
        credentials: "include",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Falha ao gerar o relatorio");
      }

      setStats(payload as PanelStats);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao gerar o relatorio"
      );
    } finally {
      setIsLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    load();
  }, [load]);

  const aplicarAtalho = (days: number) => {
    const fim = new Date();
    const inicio = new Date(fim.getTime() - days * 24 * 3_600_000);
    setStartDate(toInputDate(inicio));
    setEndDate(toInputDate(fim));
  };

  const total = stats?.kpis.total ?? 0;
  const maxCarrier = Math.max(
    1,
    ...(stats?.charts.byCarrier ?? []).map((c) => c.count)
  );
  const maxTrend = Math.max(1, ...(stats?.charts.trend ?? []).map((t) => t.count));

  return (
    <PageShell>
      <PageHeader
        title="Relatorios"
        subtitle="Resumo consolidado dos atendimentos por periodo, transportadora e status"
        actions={
          <PrimaryButton
            type="button"
            onClick={() =>
              window.open(`/api/tracken/export?${queryString}`, "_blank")
            }
          >
            <Download
              className="h-4 w-4"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Exportar CSV
          </PrimaryButton>
        }
      />

      {error && <ErrorBanner message={error} />}

      <Card className="mt-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="xl:col-span-2">
            {/* O recorte e pelo LIMITE DE ENVIO, nao pela data de recebimento. */}
            <label className={LABEL} htmlFor="rel-inicio">
              Limite de envio
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                id="rel-inicio"
                type="date"
                aria-label="Limite de envio a partir de"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => setStartDate(e.target.value)}
                className={FIELD}
              />
              <span className="shrink-0 text-[13.5px] text-slate-400">ate</span>
              <input
                type="date"
                aria-label="Limite de envio até"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                className={FIELD}
              />
            </div>
          </div>

          <div>
            <label className={LABEL} htmlFor="rel-carrier">Transportadora</label>
            <select
              id="rel-carrier"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              className={FIELD}
            >
              <option value="">Todas</option>
              {carriers.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={LABEL} htmlFor="rel-status">Status</label>
            <select
              id="rel-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={FIELD}
            >
              <option value="">Todos</option>
              {statuses.map((s) => (
                <option key={s.code} value={s.code}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <span className={LABEL}>Atalhos</span>
            <div className="flex flex-wrap gap-1.5">
              {ATALHOS.map((atalho) => (
                <button
                  key={atalho.label}
                  type="button"
                  onClick={() => aplicarAtalho(atalho.days)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[13.5px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  {atalho.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {isLoading && !stats ? (
        <LoadingState label="Gerando relatorio..." />
      ) : stats ? (
        <>
          {/* Um tile fixo + um por status: a grade segue a contagem para nao
              deixar tile sozinho na ultima linha. */}
          <div
            className={`mt-4 grid gap-3 ${kpiGridClass(
              1 + (stats.kpis.byStatus?.length ?? 0)
            )}`}
          >
            <StatTile
              label="Total no periodo"
              value={total}
              hint={`${startDate.split("-").reverse().join("/")} a ${endDate.split("-").reverse().join("/")}`}
              color="green"
              icon={CalendarDays}
            />
            {stats.kpis.byStatus.map((s) => (
              <StatTile
                key={s.code}
                label={s.label}
                value={s.count}
                hint={`${formatPercent(s.percentage)} do total`}
                color={s.color}
                icon={statusIcon(s.code)}
              />
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card
              title="Por transportadora"
              description="Volume recebido no periodo"
            >
              {stats.charts.byCarrier.length === 0 ? (
                <p className="py-8 text-center text-[13.5px] text-slate-400">
                  Sem atendimentos no periodo selecionado.
                </p>
              ) : (
                <ul className="space-y-3">
                  {stats.charts.byCarrier.map((c) => (
                    <ProgressRow
                      key={c.code}
                      label={c.code}
                      sublabel={c.name}
                      value={c.count}
                      max={maxCarrier}
                      color={c.color}
                      right={`${formatNumber(c.count)} (${formatPercent(c.percentage)})`}
                    />
                  ))}
                </ul>
              )}
            </Card>

            <Card
              title="Cumprimento de prazo"
              description="Atendimentos finalizados com limite de envio informado"
            >
              <div className="flex items-baseline gap-3">
                <span
                  className={`text-4xl font-bold tabular-nums ${
                    stats.charts.sla.percentage >= stats.charts.sla.target
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {formatPercent(stats.charts.sla.percentage)}
                </span>
                <span className="text-[13.5px] text-slate-500">
                  meta {stats.charts.sla.target}%
                </span>
              </div>

              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${
                    stats.charts.sla.percentage >= stats.charts.sla.target
                      ? "bg-green-500"
                      : "bg-red-500"
                  }`}
                  style={{
                    width: `${Math.min(100, stats.charts.sla.percentage)}%`,
                  }}
                />
              </div>

              {/* Era `grid-cols-3` fixo, sem breakpoint: tres caixas de ~90px
                  a 320px de largura. */}
              <dl className="mt-4 grid grid-cols-1 gap-3 text-center sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-[12.5px] uppercase tracking-wide text-slate-400">
                    No prazo
                  </dt>
                  <dd className="mt-1 text-lg font-bold tabular-nums text-green-600">
                    {formatNumber(stats.charts.sla.within)}
                  </dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-[12.5px] uppercase tracking-wide text-slate-400">
                    Fora
                  </dt>
                  <dd className="mt-1 text-lg font-bold tabular-nums text-red-600">
                    {formatNumber(
                      stats.charts.sla.measured - stats.charts.sla.within
                    )}
                  </dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-[12.5px] uppercase tracking-wide text-slate-400">
                    Base
                  </dt>
                  <dd className="mt-1 text-lg font-bold tabular-nums text-slate-700">
                    {formatNumber(stats.charts.sla.measured)}
                  </dd>
                </div>
              </dl>
            </Card>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card
              title="Distribuicao por status"
              description="Como os atendimentos do periodo terminaram"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-[12.5px] font-semibold uppercase tracking-wide text-slate-500">
                      <th scope="col" className="py-2 pr-3">Status</th>
                      <th scope="col" className="py-2 pr-3 text-right">Qtde</th>
                      <th scope="col" className="py-2 text-right">Participacao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.charts.byStatus.map((s) => (
                      <tr
                        key={s.code}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="py-2.5 pr-3">
                          <StatusBadge label={s.label} color={s.color} />
                        </td>
                        <td className="py-2.5 pr-3 text-right text-[15px] tabular-nums text-slate-800">
                          {formatNumber(s.count)}
                        </td>
                        <td className="py-2.5 text-right text-[15px] tabular-nums text-slate-600">
                          {formatPercent(s.percentage)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card
              title="Recebidos nos ultimos 7 dias"
              description="Independente do periodo filtrado acima"
            >
              <ul className="space-y-3">
                {stats.charts.trend.map((ponto) => (
                  <ProgressRow
                    key={ponto.date}
                    label={formatShortDate(`${ponto.date}T12:00:00-03:00`)}
                    value={ponto.count}
                    max={maxTrend}
                    color="green"
                  />
                ))}
              </ul>
            </Card>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-[13.5px] text-slate-500">
              <FileText
                className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
                aria-hidden="true" strokeWidth={1.75} />
              <span>
                A exportacao respeita exatamente os filtros aplicados acima e sai
                em CSV com separador ponto e virgula, pronto para abrir no Excel.
                Limite de 20 mil linhas por arquivo.
              </span>
            </p>
            <button
              type="button"
              onClick={() =>
                window.open(`/api/tracken/export?${queryString}`, "_blank")
              }
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-[15px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
              Baixar CSV
            </button>
          </div>
        </>
      ) : null}

      {isLoading && stats && (
        <p className="mt-3 flex items-center gap-2 text-[13.5px] text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" strokeWidth={1.75} />
          Atualizando...
        </p>
      )}
    </PageShell>
  );
}
