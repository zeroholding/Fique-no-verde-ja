"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { adsRequest, errorMessage, isAbortError, isSessionError } from "@/lib/ads/client";
import {
  resolvePresetRange,
  todayInSaoPaulo,
  type AdsDayRange,
  type AdsPeriodPreset,
} from "@/lib/ads/dates";
import { formatDateTime, formatDayRange, pluralize } from "@/lib/ads/format";
import { ADS_INDICATOR_KEYS, type AdsIndicatorKey } from "@/lib/ads/metrics";
import type { AdsDashboardData } from "@/lib/ads/types";

import { DailyChart } from "./_components/daily-chart";
import { KpiCards, pickKpis } from "./_components/kpi-cards";
import { PeriodPicker } from "./_components/period-picker";
import { RankingTable } from "./_components/ranking-table";
import { Button, Card, Notice, Spinner, buttonClasses } from "./_components/ui";
import { useAdsViewer } from "./_components/viewer-context";

/**
 * Painel do /ads: indicadores do período, evolução por dia e desempenho por
 * campanha, conjunto ou anúncio. Tudo vem de `/api/ads/dashboard`; a tela só
 * formata. Enquanto um período novo carrega, os números anteriores continuam
 * visíveis e esmaecidos.
 */

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
      <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ads-ink)]">{PAGE_TITLE}</h1>
      {children}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <PageTitle>
        <p className="mt-1 text-[13.5px] text-[var(--ads-ink-muted)]">
          <Spinner label="Carregando os resultados" />
        </p>
      </PageTitle>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden>
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-[92px] animate-pulse rounded-lg border border-[var(--ads-line)] bg-white" />
        ))}
      </div>
      <div className="h-[340px] animate-pulse rounded-lg border border-[var(--ads-line)] bg-white" aria-hidden />
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
    <div className="space-y-5">
      <PageTitle />
      <Card className="px-6 py-10 text-center">
        <h2 className="text-[15px] font-semibold text-[var(--ads-ink)]">Não foi possível carregar o painel</h2>
        <p className="mx-auto mt-1.5 max-w-md text-[14px] text-[var(--ads-ink-muted)]">{message}</p>
        {sessionExpired ? (
          <a href="/api/auth/logout?redirect=%2Fads" className={`${buttonClasses("primary")} mt-5`}>
            Entrar de novo
          </a>
        ) : (
          <Button className="mt-5" onClick={onRetry}>
            Tentar de novo
          </Button>
        )}
      </Card>
    </div>
  );
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="space-y-5">
      <PageTitle />
      <Card className="px-6 py-12 text-center">
        <h2 className="text-[16px] font-semibold text-[var(--ads-ink)]">Nenhum relatório enviado ainda</h2>
        <p className="mx-auto mt-1.5 max-w-md text-[14px] text-[var(--ads-ink-muted)]">
          Quando o relatório do Gerenciador de Anúncios for enviado, os resultados das campanhas aparecem aqui.
        </p>
        {isAdmin ? (
          <Link href="/ads/relatorios" className={`${buttonClasses("primary")} mt-5`}>
            Enviar relatório
          </Link>
        ) : (
          <p className="mt-4 text-[13.5px] text-[var(--ads-ink-muted)]">
            Os relatórios são enviados pelo responsável pelo tráfego.
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
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [preset, setPreset] = useState<AdsPeriodPreset>("30d");
  const [chartMetric, setChartMetric] = useState<AdsIndicatorKey>("spend");
  const [view, setView] = useState<ViewState>({
    key: "",
    data: null,
    error: null,
    sessionExpired: false,
  });

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
    setQuery(new URLSearchParams({ from: range.from, to: range.to }).toString());
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

  return (
    <div className="space-y-5" aria-busy={loading}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageTitle>
          <p className="mt-1 text-[13.5px] text-[var(--ads-ink-soft)]">
            {formatDayRange(data.range.from, data.range.to)}
            {data.previousRange
              ? `, comparado com ${formatDayRange(data.previousRange.from, data.previousRange.to)}`
              : ""}
          </p>
          {data.lastImport ? (
            <p className="mt-0.5 text-[12.5px] text-[var(--ads-ink-muted)]">
              Último relatório enviado em {formatDateTime(data.lastImport.createdAt)}
            </p>
          ) : null}
        </PageTitle>
        <div className="flex items-start gap-3">
          {loading ? (
            <Spinner label="Atualizando" className="mt-2 text-[13px] text-[var(--ads-ink-muted)]" />
          ) : null}
          <PeriodPicker
            preset={preset}
            range={{ from: data.range.from, to: data.range.to }}
            onPreset={choosePreset}
            onCustom={chooseCustom}
          />
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
          {describeRanges(data.missingRanges)}). Os números consideram só os dias enviados.
        </Notice>
      ) : null}

      {data.currencies.length > 1 ? (
        <Notice tone="warning">
          Há relatórios em moedas diferentes ({data.currencies.join(", ")}). Os totais misturam essas moedas.
        </Notice>
      ) : null}

      {hasRows ? (
        <div className={`space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <KpiCards
            indicators={kpis}
            totals={data.totals}
            previous={data.previous}
            currency={data.currency}
          />

          {data.totals.results !== null && data.resultTypes.length > 1 ? (
            <p className="text-[12.5px] text-[var(--ads-ink-muted)]">
              “Resultados” soma tipos diferentes: {data.resultTypes.join(", ")}.
            </p>
          ) : null}

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

          {data.rankings.length > 0 ? (
            <RankingTable
              rankings={data.rankings}
              totals={data.totals}
              currency={data.currency}
              showAccount={data.accounts.length > 1}
            />
          ) : null}
        </div>
      ) : (
        <Card className="px-6 py-10 text-center">
          <h2 className="text-[15px] font-semibold text-[var(--ads-ink)]">Sem resultados neste período</h2>
          <p className="mx-auto mt-1.5 max-w-md text-[14px] text-[var(--ads-ink-muted)]">
            Os relatórios enviados cobrem {formatDayRange(coverage.firstDay, coverage.lastDay)}.
          </p>
          <Button className="mt-5" onClick={() => choosePreset("all")}>
            Ver todo o período
          </Button>
        </Card>
      )}
    </div>
  );
}
