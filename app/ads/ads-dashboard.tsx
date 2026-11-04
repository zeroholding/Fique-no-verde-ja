"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Building2,
  Calendar,
  Download,
  FileSpreadsheet,
  RotateCw,
  Sparkles,
  UploadCloud,
} from "lucide-react";

import { adsRequest, errorMessage, isAbortError, isSessionError } from "@/lib/ads/client";
import {
  resolvePresetRange,
  todayInSaoPaulo,
  type AdsDayRange,
  type AdsPeriodPreset,
} from "@/lib/ads/dates";
import { exportDailyToCsv } from "@/lib/ads/export";
import { formatDateTime, formatDayRange, pluralize } from "@/lib/ads/format";
import { ADS_INDICATOR_KEYS, type AdsIndicatorKey } from "@/lib/ads/metrics";
import type { AdsDashboardData } from "@/lib/ads/types";

import { DailyChart } from "./_components/daily-chart";
import { KpiCards, pickKpis } from "./_components/kpi-cards";
import { PeriodPicker } from "./_components/period-picker";
import { RankingTable } from "./_components/ranking-table";
import { Button, Card, Notice, Spinner, buttonClasses } from "./_components/ui";
import { useAdsViewer } from "./_components/viewer-context";

type ViewState = {
  key: string;
  data: AdsDashboardData | null;
  error: string | null;
  sessionExpired: boolean;
};

const PAGE_TITLE = "Resultados do Meta Ads";

function PageTitle({ children }: { children?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2.5">
        <h1 className="text-[22px] font-extrabold tracking-tight text-slate-900">{PAGE_TITLE}</h1>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
          <span>Relatório Ativo</span>
        </span>
      </div>
      {children}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <PageTitle>
        <p className="mt-1 text-[13.5px] text-slate-400 font-medium">
          <Spinner label="Carregando os resultados das campanhas…" />
        </p>
      </PageTitle>
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4" aria-hidden>
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-[108px] animate-pulse rounded-xl border border-slate-200/70 bg-white" />
        ))}
      </div>
      <div className="h-[350px] animate-pulse rounded-xl border border-slate-200/70 bg-white" aria-hidden />
    </div>
  );
}

function DashboardError({
  message,
  sessionExpired,
  onRetry,
}: {
  message: string;
  sessionExpired: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-6">
      <PageTitle />
      <Card className="px-6 py-12 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-rose-50 text-rose-600 border border-rose-100">
          <AlertCircle className="size-6" aria-hidden />
        </span>
        <h2 className="mt-4 text-[16px] font-bold text-slate-900">Não foi possível carregar os dados</h2>
        <p className="mx-auto mt-1 max-w-md text-[13.5px] text-slate-500 font-medium">{message}</p>
        {sessionExpired ? (
          <a href="/api/auth/logout?redirect=%2Fads" className={`${buttonClasses("primary")} mt-5`}>
            Entrar de novo
          </a>
        ) : (
          <Button className="mt-5 gap-1.5" onClick={onRetry}>
            <RotateCw className="size-3.5" aria-hidden />
            <span>Tentar novamente</span>
          </Button>
        )}
      </Card>
    </div>
  );
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="space-y-6">
      <PageTitle />
      <Card className="px-6 py-16 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-100">
          <UploadCloud className="size-7" aria-hidden />
        </span>
        <h2 className="mt-4 text-[17px] font-bold text-slate-900">Nenhum relatório importado ainda</h2>
        <p className="mx-auto mt-1.5 max-w-md text-[14px] text-slate-500 font-medium">
          Envie o relatório exportado do Gerenciador de Anúncios da Meta (.csv ou .xlsx) para visualizar todos os
          indicadores e gráficos de desempenho.
        </p>
        {isAdmin ? (
          <Link href="/ads/relatorios" className={`${buttonClasses("primary")} mt-6 gap-2`}>
            <FileSpreadsheet className="size-4" aria-hidden />
            <span>Importar primeiro relatório</span>
          </Link>
        ) : (
          <p className="mt-4 text-[13px] text-slate-400 font-medium">
            Os relatórios são importados pelo gestor de tráfego ou administrador.
          </p>
        )}
      </Card>
    </div>
  );
}

function describeRanges(ranges: { from: string; to: string }[]): string {
  const shown = ranges.slice(0, 3).map((range) => formatDayRange(range.from, range.to));
  return ranges.length > 3 ? `${shown.join(", ")} e outros` : shown.join(", ");
}

export default function AdsDashboard() {
  const viewer = useAdsViewer();
  const [paramsMap, setParamsMap] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);
  const [preset, setPreset] = useState<AdsPeriodPreset>("30d");
  const [chartMetric, setChartMetric] = useState<AdsIndicatorKey>("spend");
  const [view, setView] = useState<ViewState>({
    key: "",
    data: null,
    error: null,
    sessionExpired: false,
  });

  const query = new URLSearchParams(paramsMap).toString();
  const requestKey = `${query}#${attempt}`;
  const loading = view.key !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    adsRequest<AdsDashboardData>(`/api/ads/dashboard${query ? `?${query}` : ""}`, {
      signal: controller.signal,
    })
      .then((data) => setView({ key: requestKey, data, error: null, sessionExpired: false }))
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setView((current) => ({
          key: requestKey,
          data: current.data,
          error: errorMessage(error),
          sessionExpired: isSessionError(error),
        }));
      });
    return () => controller.abort();
  }, [query, requestKey]);

  const applyRange = (range: AdsDayRange) => {
    setParamsMap((prev) => {
      const next = { ...prev, from: range.from, to: range.to };
      return next;
    });
  };

  const choosePreset = (next: Exclude<AdsPeriodPreset, "custom">) => {
    setPreset(next);
    const coverage = view.data?.coverage;
    if (coverage) applyRange(resolvePresetRange(next, coverage, todayInSaoPaulo()));
  };

  const chooseCustom = (range: AdsDayRange) => {
    setPreset("custom");
    applyRange(range);
  };

  const handleAccountChange = (accountName: string) => {
    setParamsMap((prev) => {
      const next = { ...prev };
      if (!accountName || accountName === "ALL") {
        delete next.account;
      } else {
        next.account = accountName;
      }
      return next;
    });
  };

  const retry = () => setAttempt((current) => current + 1);

  const data = view.data;
  if (!data) {
    if (!loading && view.error) {
      return <DashboardError message={view.error} sessionExpired={view.sessionExpired} onRetry={retry} />;
    }
    return <DashboardSkeleton />;
  }
  if (!data.hasData || !data.coverage) return <EmptyState isAdmin={viewer.isAdmin} />;

  const coverage = data.coverage;
  const hasRows = data.rowsInRange > 0;
  const kpis = pickKpis(data.totals);
  const chartOptions = ADS_INDICATOR_KEYS.filter((key) => data.totals[key] !== null);
  const metric = chartOptions.includes(chartMetric) ? chartMetric : (chartOptions[0] ?? "spend");
  const periodSlug = `${data.range.from}_ate_${data.range.to}`;

  const handleExportDaily = () => {
    exportDailyToCsv(data.daily, chartOptions, data.currency, periodSlug);
  };

  return (
    <div className="space-y-6" aria-busy={loading}>
      {/* Top Header & Controles */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageTitle>
          <p className="mt-1.5 text-[13.5px] font-medium text-slate-600">
            {formatDayRange(data.range.from, data.range.to)}
            {data.previousRange ? (
              <span className="text-slate-400">
                {" "}
                · comparado com {formatDayRange(data.previousRange.from, data.previousRange.to)}
              </span>
            ) : (
              ""
            )}
          </p>
          {data.lastImport ? (
            <p className="mt-0.5 text-[12px] text-slate-400 font-medium">
              Último envio: {data.lastImport.fileName} ({formatDateTime(data.lastImport.createdAt)})
            </p>
          ) : null}
        </PageTitle>

        <div className="flex flex-wrap items-center gap-2.5">
          {loading ? (
            <Spinner label="Atualizando…" className="text-[12.5px] text-slate-400 mr-1" />
          ) : null}

          {/* Filtro por Conta de Anúncios */}
          {data.accounts.length > 1 ? (
            <div className="relative inline-flex items-center">
              <Building2 className="pointer-events-none absolute left-3 size-4 text-slate-400" aria-hidden />
              <select
                value={data.selectedAccount ?? "ALL"}
                onChange={(e) => handleAccountChange(e.target.value)}
                className="h-9.5 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13.5px] font-semibold text-slate-800 shadow-xs hover:border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer"
                aria-label="Filtrar por conta de anúncios"
              >
                <option value="ALL">Todas as contas ({data.accounts.length})</option>
                {data.accounts.map((acc) => (
                  <option key={acc} value={acc}>
                    {acc}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Seletor de Período */}
          <PeriodPicker
            preset={preset}
            range={{ from: data.range.from, to: data.range.to }}
            onPreset={choosePreset}
            onCustom={chooseCustom}
          />

          {/* Exportar Dados Diários */}
          {hasRows ? (
            <Button size="sm" variant="secondary" onClick={handleExportDaily} className="h-9.5 gap-1.5" title="Exportar histórico diário deste período para CSV">
              <Download className="size-4 text-slate-500" aria-hidden />
              <span className="hidden sm:inline">Exportar Diário</span>
            </Button>
          ) : null}
        </div>
      </div>

      {view.error && !loading ? (
        <Notice
          tone="error"
          action={
            view.sessionExpired ? (
              <a href="/api/auth/logout?redirect=%2Fads" className={buttonClasses("secondary", "sm")}>
                Entrar de novo
              </a>
            ) : (
              <Button size="sm" onClick={retry}>
                Tentar de novo
              </Button>
            )
          }
        >
          {view.error}
        </Notice>
      ) : null}

      {hasRows && data.missingDays > 0 ? (
        <Notice
          tone="warning"
          action={
            viewer.isAdmin ? (
              <Link href="/ads/relatorios" className={buttonClasses("secondary", "sm")}>
                Enviar relatório
              </Link>
            ) : undefined
          }
        >
          Faltam relatórios de {pluralize(data.missingDays, "dia", "dias")} deste período (
          {describeRanges(data.missingRanges)}). Os números consideram apenas os dias informados.
        </Notice>
      ) : null}

      {data.currencies.length > 1 ? (
        <Notice tone="warning">
          Há relatórios com moedas distintas ({data.currencies.join(", ")}). Os totais somam os valores diretamente.
        </Notice>
      ) : null}

      {hasRows ? (
        <div className={`space-y-6 transition-opacity duration-200 ${loading ? "opacity-60" : ""}`}>
          {/* Cards de Métricas Principais */}
          <KpiCards
            indicators={kpis}
            totals={data.totals}
            previous={data.previous}
            currency={data.currency}
          />

          {data.totals.results !== null && data.resultTypes.length > 1 ? (
            <p className="text-[12px] font-medium text-slate-400">
              * “Resultados” agrega diferentes eventos reportados: {data.resultTypes.join(", ")}.
            </p>
          ) : null}

          {/* Gráfico de Evolução Diária */}
          {chartOptions.length > 0 ? (
            <DailyChart
              daily={data.daily}
              metric={metric}
              options={chartOptions}
              onMetricChange={setChartMetric}
              total={data.totals[metric]}
              currency={data.currency}
            />
          ) : null}

          {/* Tabela de Ranking por Nível */}
          {data.rankings.length > 0 ? (
            <RankingTable
              rankings={data.rankings}
              totals={data.totals}
              currency={data.currency}
              showAccount={data.accounts.length > 1 && !data.selectedAccount}
              periodSlug={periodSlug}
            />
          ) : null}
        </div>
      ) : (
        <Card className="px-6 py-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-slate-100 text-slate-500">
            <Calendar className="size-6" aria-hidden />
          </span>
          <h2 className="mt-3 text-[15.5px] font-bold text-slate-900">Sem resultados para o período selecionado</h2>
          <p className="mx-auto mt-1 max-w-md text-[13.5px] text-slate-500 font-medium">
            Os relatórios importados cobrem {formatDayRange(coverage.firstDay, coverage.lastDay)}.
          </p>
          <Button className="mt-5" onClick={() => choosePreset("all")}>
            Ver todo o período disponível
          </Button>
        </Card>
      )}
    </div>
  );
}
