"use client";

import { useId } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatDay, formatDayRange, formatIndicator, formatShortDay } from "@/lib/ads/format";
import { ADS_INDICATORS, type AdsIndicatorFormat, type AdsIndicatorKey } from "@/lib/ads/metrics";
import type { AdsDailyPoint } from "@/lib/ads/types";

import { Card } from "./ui";

/** Uma métrica por vez: misturar escalas (reais e impressões) no mesmo eixo confunde. */

const SERIES_COLOR = "#2563eb";
const GRID_COLOR = "#eef0f3";
const AXIS_COLOR = "#667085";

type ChartPoint = { day: string; label: string; value: number | null; covered: boolean };

type TooltipEntry = { payload?: ChartPoint };

function ChartTooltip({
  active,
  payload,
  label,
  format,
  currency,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
  label?: string | number;
  format: AdsIndicatorFormat;
  currency: string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border border-[var(--ads-line)] bg-white px-3 py-2 text-[12.5px] shadow-[0_8px_24px_-12px_rgba(16,24,40,0.25)]">
      <p className="text-[var(--ads-ink-muted)]">{formatDay(point.day) || label}</p>
      <p className="mt-0.5 font-semibold text-[var(--ads-ink)] tabular-nums">
        {point.covered ? formatIndicator(point.value, format, currency) : "Sem relatório para este dia"}
      </p>
    </div>
  );
}

export function DailyChart({
  daily,
  metric,
  options,
  onMetricChange,
  total,
  currency,
}: {
  daily: AdsDailyPoint[];
  metric: AdsIndicatorKey;
  options: AdsIndicatorKey[];
  onMetricChange: (metric: AdsIndicatorKey) => void;
  /** Valor do período inteiro na métrica escolhida. */
  total: number | null;
  currency: string;
}) {
  const titleId = useId();
  const selectId = useId();
  const definition = ADS_INDICATORS[metric];
  const data: ChartPoint[] = daily.map((point) => ({
    day: point.day,
    label: formatShortDay(point.day),
    value: point.values[metric],
    covered: point.covered,
  }));
  const hasValues = data.some((point) => point.value !== null);
  const first = daily[0]?.day;
  const last = daily[daily.length - 1]?.day;
  const totalLabel =
    metric === "reach_per_day"
      ? "Média por dia"
      : definition.chart === "bar"
        ? "Total no período"
        : "No período";
  const tickFormatter = (value: number) => formatIndicator(value, definition.format, currency, true);

  const axes = (
    <>
      <CartesianGrid stroke={GRID_COLOR} vertical={false} />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 11.5, fill: AXIS_COLOR }}
        tickLine={false}
        axisLine={{ stroke: GRID_COLOR }}
        minTickGap={18}
        interval="preserveStartEnd"
      />
      <YAxis
        tick={{ fontSize: 11.5, fill: AXIS_COLOR }}
        tickLine={false}
        axisLine={false}
        width={72}
        tickFormatter={tickFormatter}
        allowDecimals={definition.format !== "count"}
      />
      <Tooltip
        cursor={{ fill: "rgba(37, 99, 235, 0.06)", stroke: GRID_COLOR }}
        content={(props) => (
          <ChartTooltip
            active={props.active}
            payload={props.payload as ReadonlyArray<TooltipEntry> | undefined}
            label={props.label}
            format={definition.format}
            currency={currency}
          />
        )}
      />
    </>
  );

  return (
    <Card aria-labelledby={titleId}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--ads-line)] px-4 py-3 sm:px-5">
        <div>
          <h2 id={titleId} className="text-[15px] font-semibold text-[var(--ads-ink)]">
            Evolução por dia
          </h2>
          <p className="mt-0.5 text-[13px] text-[var(--ads-ink-muted)]">
            {totalLabel}:{" "}
            <span className="font-medium text-[var(--ads-ink)] tabular-nums">
              {formatIndicator(total, definition.format, currency)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={selectId} className="text-[13px] text-[var(--ads-ink-muted)]">
            Métrica
          </label>
          <select
            id={selectId}
            value={metric}
            onChange={(event) => onMetricChange(event.target.value as AdsIndicatorKey)}
            className="h-9 max-w-[240px] rounded-md border border-[var(--ads-line-strong)] bg-white px-2.5 text-[14px] text-[var(--ads-ink)]"
          >
            {options.map((key) => (
              <option key={key} value={key}>
                {ADS_INDICATORS[key].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <figure className="px-2 pb-3 pt-4 sm:px-4">
        <figcaption className="sr-only">
          {`${definition.label} por dia${first && last ? `, de ${formatDayRange(first, last)}` : ""}. ${totalLabel}: ${formatIndicator(total, definition.format, currency)}.`}
        </figcaption>
        {hasValues ? (
          <div className="h-[260px] w-full sm:h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              {definition.chart === "bar" ? (
                <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  {axes}
                  <Bar
                    dataKey="value"
                    name={definition.label}
                    fill={SERIES_COLOR}
                    radius={[2, 2, 0, 0]}
                    maxBarSize={28}
                    isAnimationActive={false}
                  />
                </BarChart>
              ) : (
                <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  {axes}
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={definition.label}
                    stroke={SERIES_COLOR}
                    strokeWidth={2}
                    dot={data.length <= 31 ? { r: 2.5, fill: SERIES_COLOR, strokeWidth: 0 } : false}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="flex h-[200px] items-center justify-center px-4 text-center text-[13.5px] text-[var(--ads-ink-muted)]">
            Sem valores desta métrica no período.
          </p>
        )}
      </figure>
    </Card>
  );
}
