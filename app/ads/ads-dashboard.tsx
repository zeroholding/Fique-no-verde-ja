"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Building2,
  Calendar,
  Download,
  FileSpreadsheet,
  RefreshCw,
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
          Atualizado
        </span>
      </div>
      {children}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Carregando painel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="h-7 w-56 rounded-md bg-slate-200" />
          <div className="h-4 w-72 rounded-md bg-slate-100" />
        </div>
        <div className="h-9 w-64 rounded-md bg-slate-200" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl border border-slate-100 bg-white p-4 shadow-xs" />
        ))}
      </div>
      <div className="h-80 rounded-xl border border-slate-100 bg-white shadow-xs" />
      <div className="h-96 rounded-xl border border-slate-100 bg-white shadow-xs" />
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

function EmptyState({
  isAdmin,
  onSync,
  syncing,
}: {
  isAdmin: boolean;
  onSync: () => void;
  syncing: boolean;
}) {
  return (
    <div className="space-y-6">
      <PageTitle />
      <Card className="px-6 py-16 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-100">
          <UploadCloud className="size-7" aria-hidden />
        </span>
        <h2 className="mt-4 text-[17px] font-bold text-slate-900">Nenhum dado importado ainda</h2>
        <p className="mx-auto mt-1.5 max-w-md text-[14px] text-slate-500 font-medium">
          Sincronize diretamente via Meta Marketing API ou envie o relatório exportado (.csv ou .xlsx) para visualizar os indicadores e gráficos de desempenho.
        </p>
        {isAdmin ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={onSync} disabled={syncing} className="gap-2">
              <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} aria-hidden />
              <span>{syncing ? "Sincronizando..." : "Sincronizar Meta Ads"}</span>
            </Button>
            <Link href="/ads/relatorios" className={`${buttonClasses("secondary")} gap-2`}>
              <FileSpreadsheet className="size-4" aria-hidden />
              <span>Importar arquivo</span>
            </Link>
          </div>
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
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const [view, setView] = useState<ViewState>({
    key: "",
    data: null,
    error: null,
    sessionExpired: false,
  });

  const queryKey = `${paramsMap.from ?? ""}|${paramsMap.to ?? ""}|${paramsMap.account ?? ""}|${attempt}`;
  const loading = view.key !== queryKey;

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams();
    if (paramsMap.from) query.set("from", paramsMap.from);
    if (paramsMap.to) query.set("to", paramsMap.to);
    if (paramsMap.account) query.set("account", paramsMap.account);
    const qs = query.toString();
    const url = `/api/ads/dashboard${qs ? `?${qs}` : ""}`;

    adsRequest<AdsDashboardData>(url, { signal: controller.signal })
      .then((data) =>
        setView({
          key: queryKey,
          data,
          error: null,
          sessionExpired: false,
        })
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setView((current) => ({
          ...current,
          key: queryKey,
          error: errorMessage(error),
          sessionExpired: isSessionError(error),
        }));
      });

    return () => controller.abort();
  }, [queryKey, paramsMap]);

  const choosePreset = (nextPreset: AdsPeriodPreset) => {
    setPreset(nextPreset);
    if (nextPreset === "custom") return;
    if (!view.data?.coverage) return;
    const resolved = resolvePresetRange(nextPreset, view.data.coverage, todayInSaoPaulo());
    setParamsMap((prev) => ({
      ...prev,
      from: resolved.from,
      to: resolved.to,
    }));
  };

  const chooseCustom = (range: AdsDayRange) => {
    setPreset("custom");
    setParamsMap((prev) => ({
      ...prev,
      from: range.from,
      to: range.to,
    }));
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

  const handleSyncMeta = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncNotice(null);
    try {
      const res = await adsRequest<{ success: boolean; message: string }>("/api/ads/sync", {
        method: "POST",
      });
      setSyncNotice({ tone: "success", text: res.message });
      retry();
    } catch (err) {
      setSyncNotice({ tone: "error", text: errorMessage(err) });
    } finally {
      setSyncing(false);
    }
  };

  const data = view.data;
  if (!data) {
    if (!loading && view.error) {
      return <DashboardError message={view.error} sessionExpired={view.sessionExpired} onRetry={retry} />;
    }
    return <DashboardSkeleton />;
  }
  if (!data.hasData || !data.coverage) {
    return <EmptyState isAdmin={viewer.isAdmin} onSync={handleSyncMeta} syncing={syncing} />;
  }

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
              Último envio/sincronização: {data.lastImport.fileName} ({formatDateTime(data.lastImport.createdAt)})
            </p>
          ) : null}
        </PageTitle>

        <div className="flex flex-wrap items-center gap-2.5">
          {loading ? (
            <Spinner label="Atualizando…" className="text-[12.5px] text-slate-400 mr-1" />
          ) : null}

          {/* Sincronização direta com a Meta */}
          {viewer.isAdmin ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleSyncMeta}
              disabled={syncing || loading}
              className="h-9.5 gap-1.5 shadow-xs"
              title="Sincronizar métricas recentes via Meta Marketing API"
            >
              <RefreshCw className={`size-4 text-indigo-600 ${syncing ? "animate-spin" : ""}`} aria-hidden />
              <span className="hidden sm:inline">{syncing ? "Sincronizando..." : "Sincronizar Meta"}</span>
            </Button>
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

      {syncNotice ? (
        <Notice
          tone={syncNotice.tone}
          action={
            <Button size="sm" variant="ghost" onClick={() => setSyncNotice(null)}>
              Fechar
            </Button>
          }
        >
          {syncNotice.text}
        </Notice>
      ) : null}

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

      {/* Avisos de lacunas no período */}
      {data.missingDays > 0 ? (
        <Notice tone="info">
          {pluralize(data.missingDays, "dia deste período não tem", "dias deste período não têm")} relatório
          ou sincronização: {describeRanges(data.missingRanges)}. O gráfico mostra lacuna nesses dias. Para preencher,
          sincronize via API ou envie o relatório correspondente em{" "}
          <Link href="/ads/relatorios" className="font-semibold underline underline-offset-2">
            Relatórios
          </Link>
          .
        </Notice>
      ) : null}

      {/* Cartões de Indicadores */}
      <KpiCards
        indicators={kpis}
        totals={data.totals}
        previous={data.previous}
        currency={data.currency}
      />

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

      {/* Tabela de Desempenho e Ranking */}
      {data.rankings.length > 0 ? (
        <RankingTable
          rankings={data.rankings}
          totals={data.totals}
          currency={data.currency}
          showAccount={data.accounts.length > 1}
          periodSlug={periodSlug}
        />
      ) : null}
    </div>
  );
}
