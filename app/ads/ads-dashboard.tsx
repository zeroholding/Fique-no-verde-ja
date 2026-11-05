"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CalendarRange,
  Download,
  Layers,
  Megaphone,
  RotateCw,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";

import { adsRequest, errorMessage, isAbortError, isSessionError } from "@/lib/ads/client";
import {
  resolvePresetRange,
  todayInSaoPaulo,
  type AdsPeriodPreset,
} from "@/lib/ads/dates";
import { exportDailyToCsv } from "@/lib/ads/export";
import { formatCount, formatDateTime, formatDayRange, pluralize } from "@/lib/ads/format";
import { ADS_INDICATOR_KEYS, type AdsIndicatorKey } from "@/lib/ads/metrics";
import type { AdsDashboardData, AdsSyncResult } from "@/lib/ads/types";

import { CreativeGallery } from "./_components/creative-gallery";
import { DailyChart } from "./_components/daily-chart";
import { FilterBar, type AdsFilters } from "./_components/filter-bar";
import { KpiCards, pickKpis } from "./_components/kpi-cards";
import { MetaConnectedBadge, MetaSyncButton } from "./_components/meta-button";
import { RankingTable } from "./_components/ranking-table";
import { Button, Card, Notice, Spinner, buttonClasses } from "./_components/ui";
import { useAdsViewer } from "./_components/viewer-context";

type ViewState = {
  key: string;
  data: AdsDashboardData | null;
  error: string | null;
  sessionExpired: boolean;
};

const today = todayInSaoPaulo();

function PageTitle({ children }: { children?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="text-[22px] font-extrabold tracking-tight text-slate-900">Resultados do Meta Ads</h1>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
          Sincronizado
        </span>
      </div>
      {children}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Carregando painel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="h-7 w-56 rounded-md bg-slate-200" />
          <div className="h-4 w-72 rounded-md bg-slate-100" />
        </div>
        <div className="h-10 w-64 rounded-md bg-slate-200" />
      </div>
      <div className="h-14 rounded-xl border border-slate-100 bg-white" />
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className="h-28 rounded-xl border border-slate-100 bg-white p-4 shadow-xs" />
        ))}
      </div>
      <div className="h-80 rounded-xl border border-slate-100 bg-white shadow-xs" />
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
        <span className="mx-auto grid size-12 place-items-center rounded-full border border-rose-100 bg-rose-50 text-rose-600">
          <AlertCircle className="size-6" aria-hidden />
        </span>
        <h2 className="mt-4 text-[16px] font-bold text-slate-900">Não foi possível carregar os dados</h2>
        <p className="mx-auto mt-1 max-w-md text-[13.5px] font-medium text-slate-500">{message}</p>
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
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-[#0866FF]/20 bg-[#0866FF]/8 text-[#0866FF]">
          <Layers className="size-7" aria-hidden />
        </span>
        <h2 className="mt-4 text-[17px] font-bold text-slate-900">Ainda não há números sincronizados</h2>
        <p className="mx-auto mt-1.5 max-w-md text-[14px] font-medium text-slate-500">
          Os dados vêm direto da conta de anúncios pela integração com a Meta. Clique em sincronizar para
          buscar os últimos 30 dias.
        </p>
        {isAdmin ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <MetaSyncButton onClick={onSync} syncing={syncing} />
          </div>
        ) : (
          <p className="mt-4 text-[13px] font-medium text-slate-400">
            A sincronização é feita por um administrador.
          </p>
        )}
      </Card>
    </div>
  );
}

function SummaryChips({ data }: { data: AdsDashboardData }) {
  const counts = data.rankings.reduce<Record<string, number>>((accumulator, item) => {
    accumulator[item.level] = item.rows.length;
    return accumulator;
  }, {});

  const items = [
    { icon: Megaphone, label: "Campanhas", value: counts.campaign ?? 0 },
    { icon: Layers, label: "Conjuntos", value: counts.adset ?? 0 },
    { icon: Target, label: "Anúncios", value: counts.ad ?? 0 },
    { icon: CalendarRange, label: "Dias no recorte", value: data.range.days },
  ];

  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <li
            key={item.label}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-slate-700 shadow-xs"
          >
            <Icon className="size-3.5 text-slate-400" aria-hidden />
            <span className="tabular-nums text-slate-900">{formatCount(item.value)}</span>
            <span className="font-medium text-slate-500">{item.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function describeRanges(ranges: { from: string; to: string }[]): string {
  const shown = ranges.slice(0, 3).map((range) => formatDayRange(range.from, range.to));
  return ranges.length > 3 ? `${shown.join(", ")} e outros` : shown.join(", ");
}

export default function AdsDashboard() {
  const viewer = useAdsViewer();
  const [filters, setFilters] = useState<AdsFilters>({
    preset: "30d",
    range: { from: "", to: "" },
    onlyToday: false,
    campaignId: "",
    status: "",
    search: "",
  });
  const [initialized, setInitialized] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [chartMetric, setChartMetric] = useState<AdsIndicatorKey>("spend");
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ tone: "success" | "warning" | "error"; text: string } | null>(
    null
  );

  const [view, setView] = useState<ViewState>({
    key: "",
    data: null,
    error: null,
    sessionExpired: false,
  });

  const queryKey = [
    filters.range.from,
    filters.range.to,
    filters.onlyToday ? "1" : "0",
    filters.campaignId,
    filters.status,
    filters.search,
    attempt,
  ].join("|");
  const loading = view.key !== queryKey;

  // O período inicial vem do servidor (últimos 30 dias com dados): sem isso, o
  // primeiro pedido sairia sem data e o atalho escolhido se perderia.
  useEffect(() => {
    if (!initialized || !view.data?.coverage) return;
    if (filters.range.from && filters.range.to) return;
    const resolved = resolvePresetRange("30d", view.data.coverage, today);
    setFilters((current) => ({ ...current, range: resolved }));
  }, [initialized, view.data, filters.range.from, filters.range.to]);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams();
    if (filters.range.from) query.set("from", filters.range.from);
    if (filters.range.to) query.set("to", filters.range.to);
    if (filters.onlyToday) query.set("today", "1");
    if (filters.status) query.set("status", filters.status);
    if (filters.campaignId) query.set("campaign", filters.campaignId);
    if (filters.search) query.set("q", filters.search);
    const qs = query.toString();

    adsRequest<AdsDashboardData>(`/api/ads/dashboard${qs ? `?${qs}` : ""}`, {
      signal: controller.signal,
    })
      .then((data) => {
        setView({ key: queryKey, data, error: null, sessionExpired: false });
        if (!initialized && data.coverage) {
          const resolved = resolvePresetRange("30d", data.coverage, today);
          setFilters((current) =>
            current.range.from ? current : { ...current, range: resolved }
          );
          setInitialized(true);
        }
      })
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
  }, [queryKey, filters, initialized]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  /** Troca o atalho de período mantendo o recorte atual. */
  const handleFilters = useCallback((next: AdsFilters) => {
    setFilters((current) => {
      if (next.preset === current.preset || next.preset === "custom") return next;
      const coverage = view.data?.coverage;
      if (!coverage) return next;
      const resolved = resolvePresetRange(next.preset as Exclude<AdsPeriodPreset, "custom">, coverage, today);
      return { ...next, range: resolved };
    });
  }, [view.data]);

  const handleSyncMeta = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncNotice(null);
    try {
      const res = await adsRequest<AdsSyncResult>("/api/ads/sync", { method: "POST" });
      // Erro só nas peças visuais não invalida a sincronização dos números, mas
      // precisa aparecer: senão a galeria fica vazia e parece defeito nosso.
      setSyncNotice({ tone: res.creativeError ? "warning" : "success", text: res.message });
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

  const hasRows = data.rowsInRange > 0;
  const kpis = pickKpis(data.totals);
  const chartOptions = ADS_INDICATOR_KEYS.filter((key) => data.totals[key] !== null);
  const metric = chartOptions.includes(chartMetric) ? chartMetric : (chartOptions[0] ?? "spend");
  const periodSlug = `${data.range.from}_ate_${data.range.to}`;
  const periodLabel = formatDayRange(data.range.from, data.range.to);
  const accountName = data.accounts[0] ?? "";
  const hasFilters = Boolean(filters.status || filters.campaignId || filters.search || filters.onlyToday);

  const handleExportDaily = () => {
    exportDailyToCsv(data.daily, chartOptions, data.currency, periodSlug);
  };

  return (
    <div className="space-y-5" aria-busy={loading}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageTitle>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[13.5px] font-medium text-slate-600">
            <MetaConnectedBadge />
            {accountName ? <span className="text-slate-700">{accountName}</span> : null}
          </p>
          <p className="mt-1 text-[13px] font-medium text-slate-500">
            {filters.onlyToday ? "Hoje, " : ""}
            {periodLabel}
            {data.previousRange && !filters.onlyToday ? (
              <span className="text-slate-400">
                {" "}
                · comparado com {formatDayRange(data.previousRange.from, data.previousRange.to)}
              </span>
            ) : null}
          </p>
          {data.lastImport ? (
            <p className="mt-0.5 text-[12px] font-medium text-slate-400">
              Última sincronização: {formatDateTime(data.lastImport.createdAt)}
            </p>
          ) : null}
        </PageTitle>

        <div className="flex flex-wrap items-center gap-2.5">
          {loading ? <Spinner label="Atualizando…" className="mr-1 text-[12.5px] text-slate-400" /> : null}

          {hasRows ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleExportDaily}
              className="h-9.5 gap-1.5"
              title="Exportar o dia a dia deste período em CSV"
            >
              <Download className="size-4 text-slate-500" aria-hidden />
              <span className="hidden sm:inline">Exportar</span>
            </Button>
          ) : null}

          {viewer.isAdmin ? (
            <MetaSyncButton onClick={handleSyncMeta} syncing={syncing} disabled={loading} />
          ) : null}
        </div>
      </div>

      <FilterBar
        value={filters}
        campaigns={data.campaigns}
        currency={data.currency}
        loading={loading}
        onChange={handleFilters}
      />

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

      {data.missingDays > 0 && !filters.onlyToday ? (
        <Notice
          tone="info"
          action={
            viewer.isAdmin ? (
              <Button size="sm" variant="secondary" onClick={handleSyncMeta} disabled={syncing}>
                Sincronizar agora
              </Button>
            ) : undefined
          }
        >
          {pluralize(data.missingDays, "dia deste período está", "dias deste período estão")} sem sincronização:{" "}
          {describeRanges(data.missingRanges)}. O gráfico mostra lacuna nesses dias.
        </Notice>
      ) : null}

      {filters.onlyToday && !hasRows ? (
        <Notice tone="info">
          Hoje ainda não tem veiculação registrada. A Meta fecha o dia com atraso — sincronize novamente
          mais tarde.
        </Notice>
      ) : null}

      {hasRows ? <SummaryChips data={data} /> : null}

      {hasRows ? (
        <KpiCards indicators={kpis} totals={data.totals} previous={data.previous} currency={data.currency} />
      ) : null}

      <div className="space-y-5">
        {chartOptions.length > 0 && hasRows ? (
          <DailyChart
            daily={data.daily}
            metric={metric}
            options={chartOptions}
            onMetricChange={setChartMetric}
            total={data.totals[metric]}
            currency={data.currency}
          />
        ) : (
          <Card className="px-6 py-12 text-center">
            <div className="mx-auto flex max-w-sm flex-col items-center gap-1.5">
              <TrendingUp className="size-6 text-slate-300" aria-hidden />
              <p className="text-[14px] font-semibold text-slate-600">
                {hasFilters ? "Nenhum número com estes filtros" : "Nenhuma veiculação neste recorte"}
              </p>
              <p className="text-[12.5px] font-medium text-slate-400">
                {hasFilters
                  ? "Tire um filtro para ver mais anúncios."
                  : "Ajuste o período ou sincronize novamente."}
              </p>
            </div>
          </Card>
        )}

        <CreativeGallery
          items={data.creatives}
          counts={data.creativeCounts}
          currency={data.currency}
          periodLabel={periodLabel}
        />
      </div>

      {data.rankings.length > 0 ? (
        <RankingTable
          rankings={data.rankings}
          totals={data.totals}
          currency={data.currency}
          periodLabel={periodLabel}
          periodSlug={periodSlug}
        />
      ) : null}

      {!hasRows && !hasFilters ? (
        <Card className="px-6 py-10 text-center">
          <p className="flex items-center justify-center gap-2 text-[14px] font-medium text-slate-500">
            <Sparkles className="size-4 text-slate-400" aria-hidden />
            O período tem cobertura, mas nenhuma veiculação registrada.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
