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
import { BarChart3, LineChart as LineChartIcon, SlidersHorizontal } from "lucide-react";

import { formatDay, formatDayRange, formatIndicator, formatShortDay } from "@/lib/ads/format";
import { ADS_INDICATORS, type AdsIndicatorFormat, type AdsIndicatorKey } from "@/lib/ads/metrics";
import type { AdsDailyPoint } from "@/lib/ads/types";

import { Card } from "./ui";

const SERIES_COLOR = "#2563eb";
const SERIES_HOVER_COLOR = "#1d4ed8";
const GRID_COLOR = "#f1f5f9";
const AXIS_COLOR = "#64748b";

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
    <div className="rounded-xl border border-slate-200/90 bg-white/95 px-3.5 py-2.5 text-[12.5px] shadow-[0_10px_25px_-5px_rgba(15,23,42,0.15)] backdrop-blur-sm">
      <p className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-400">
        {formatDay(point.day) || label}
      </p>
      <p className="mt-1 text-[15px] font-bold text-slate-900 tabular-nums">
        {point.covered ? formatIndicator(point.value, format, currency) : "Sem relatório para este dia"}
      </p>
      {!point.covered ? (
        <span className="mt-0.5 inline-block text-[11px] font-medium text-amber-600">Dia sem veiculação ou sem arquivo</span>
      ) : null}
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
  const ChartIcon = definition.chart === "bar" ? BarChart3 : LineChartIcon;

  const axes = (
    <>
      <CartesianGrid stroke={GRID_COLOR} vertical={false} strokeDasharray="3 3" />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 11, fill: AXIS_COLOR, fontWeight: 500 }}
        tickLine={false}
        axisLine={{ stroke: "#e2e8f0" }}
        minTickGap={16}
        interval="preserveStartEnd"
      />
      <YAxis
        tick={{ fontSize: 11, fill: AXIS_COLOR, fontWeight: 500 }}
        tickLine={false}
        axisLine={false}
        width={70}
        tickFormatter={tickFormatter}
        allowDecimals={definition.format !== "count"}
      />
      <Tooltip
        cursor={{ fill: "rgba(37, 99, 235, 0.05)", stroke: "#cbd5e1" }}
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
    <Card aria-labelledby={titleId} className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/40 px-5 py-3.5 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600">
            <ChartIcon className="size-4.5" aria-hidden />
          </span>
          <div>
            <h2 id={titleId} className="text-[15px] font-bold tracking-tight text-slate-900">
              Evolução diária
            </h2>
            <p className="text-[12.5px] text-slate-500 font-medium">
              {totalLabel}:{" "}
              <span className="font-bold text-slate-900 tabular-nums">
                {formatIndicator(total, definition.format, currency)}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor={selectId} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500">
            <SlidersHorizontal className="size-3.5 text-slate-400" aria-hidden />
            <span>Métrica:</span>
          </label>
          <select
            id={selectId}
            value={metric}
            onChange={(event) => onMetricChange(event.target.value as AdsIndicatorKey)}
            className="h-9 max-w-[240px] rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] font-semibold text-slate-800 shadow-xs hover:border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer"
          >
            {options.map((key) => (
              <option key={key} value={key}>
                {ADS_INDICATORS[key].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <figure className="px-3 pb-4 pt-5 sm:px-5">
        <figcaption className="sr-only">
          {`${definition.label} por dia${first && last ? `, de ${formatDayRange(first, last)}` : ""}. ${totalLabel}: ${formatIndicator(total, definition.format, currency)}.`}
        </figcaption>
        {hasValues ? (
          <div className="h-[270px] w-full sm:h-[290px]">
            <ResponsiveContainer width="100%" height="100%">
              {definition.chart === "bar" ? (
                <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  {axes}
                  <Bar
                    dataKey="value"
                    name={definition.label}
                    fill={SERIES_COLOR}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                    isAnimationActive={false}
                  />
                </BarChart>
              ) : (
                <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                  {axes}
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={definition.label}
                    stroke={SERIES_COLOR}
                    strokeWidth={2.5}
                    dot={data.length <= 31 ? { r: 3, fill: SERIES_COLOR, strokeWidth: 0 } : false}
                    activeDot={{ r: 5, fill: SERIES_HOVER_COLOR }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[200px] flex-col items-center justify-center gap-1.5 px-4 text-center text-[13px] text-slate-400">
            <BarChart3 className="size-6 text-slate-300" aria-hidden />
            <p className="font-medium">Sem valores desta métrica no período selecionado.</p>
          </div>
        )}
      </figure>
    </Card>
  );
}
