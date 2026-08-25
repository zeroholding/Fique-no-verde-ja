"use client";

import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber, formatPercent, formatShortDate } from "@/lib/tracken/format";
import {
  BAR_CLASSES,
  BRAND_GREEN,
  CHART_HEX,
  DOT_CLASSES,
  normalizeColor,
} from "./tokens";

const EMPTY_MESSAGE = "Sem dados no periodo selecionado";

function ChartFrame({
  title,
  children,
  isEmpty,
}: {
  title: string;
  children: React.ReactNode;
  isEmpty?: boolean;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {isEmpty ? (
        <p className="flex h-44 items-center justify-center text-center text-xs text-slate-400">
          {EMPTY_MESSAGE}
        </p>
      ) : (
        <div className="mt-3">{children}</div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------
// 1) Por Transportadora - donut com total ao centro
// ---------------------------------------------------------------

export type CarrierSlice = {
  code: string;
  name: string;
  color: string;
  count: number;
  percentage: number;
};

export function CarrierDonut({
  data,
  total,
}: {
  data: CarrierSlice[];
  total: number;
}) {
  return (
    <ChartFrame title="Por Transportadora" isEmpty={data.length === 0}>
      <div className="flex items-center gap-4">
        <div className="relative h-40 w-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="code"
                innerRadius="66%"
                outerRadius="100%"
                paddingAngle={2}
                strokeWidth={0}
                isAnimationActive={false}
              >
                {data.map((slice) => (
                  <Cell
                    key={slice.code}
                    fill={CHART_HEX[normalizeColor(slice.color)]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [
                  formatNumber(Number(value ?? 0)),
                  String(name ?? ""),
                ]}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #E2E8F0",
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold tabular-nums text-slate-900">
              {formatNumber(total)}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Total
            </span>
          </div>
        </div>

        <ul className="min-w-0 flex-1 space-y-2">
          {data.map((slice) => (
            <li key={slice.code} className="flex items-center gap-2 text-xs">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  DOT_CLASSES[normalizeColor(slice.color)]
                }`}
                aria-hidden="true"
              />
              <span
                className="min-w-0 flex-1 truncate font-semibold text-slate-700"
                title={slice.name}
              >
                {slice.code}
              </span>
              <span className="tabular-nums font-semibold text-slate-900">
                {formatNumber(slice.count)}
              </span>
              <span className="tabular-nums text-slate-400">
                ({formatPercent(slice.percentage)})
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ChartFrame>
  );
}

// ---------------------------------------------------------------
// 2) Atendimentos por Status - barras horizontais
// ---------------------------------------------------------------

export type StatusSlice = {
  code: string;
  label: string;
  color: string;
  count: number;
  percentage: number;
};

export function StatusBars({ data }: { data: StatusSlice[] }) {
  const max = Math.max(1, ...data.map((item) => item.count));

  return (
    <ChartFrame
      title="Atendimentos por Status"
      isEmpty={data.every((item) => item.count === 0)}
    >
      <ul className="space-y-3 pt-1">
        {data.map((item) => (
          <li key={item.code}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600">{item.label}</span>
              <span className="tabular-nums font-semibold text-slate-900">
                {formatNumber(item.count)}
              </span>
            </div>
            <div
              className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100"
              role="img"
              aria-label={`${item.label}: ${item.count} atendimentos`}
            >
              <div
                className={`h-full rounded-full ${
                  BAR_CLASSES[normalizeColor(item.color)]
                }`}
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
}

// ---------------------------------------------------------------
// 3) Tendencia dos ultimos 7 dias - linha
// ---------------------------------------------------------------

export type TrendPoint = { date: string; count: number };

export function TrendLine({ data }: { data: TrendPoint[] }) {
  const chartData = data.map((point) => ({
    ...point,
    label: formatShortDate(`${point.date}T12:00:00-03:00`),
  }));

  return (
    <ChartFrame
      title="Tendencia dos ultimos 7 dias"
      isEmpty={data.length === 0}
    >
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#94A3B8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#94A3B8" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              formatter={(value) => [
                formatNumber(Number(value ?? 0)),
                "Recebidos",
              ]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #E2E8F0",
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke={BRAND_GREEN}
              strokeWidth={2}
              dot={{ r: 3, fill: BRAND_GREEN, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

// ---------------------------------------------------------------
// 4) SLA de Atendimento - gauge radial
// ---------------------------------------------------------------

export function SlaGauge({
  percentage,
  target,
  measured,
}: {
  percentage: number;
  target: number;
  measured: number;
}) {
  const meetsTarget = percentage >= target;
  const color = meetsTarget ? CHART_HEX.green : CHART_HEX.red;

  return (
    <ChartFrame title="SLA de Atendimento">
      <div className="relative h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            data={[{ name: "sla", value: percentage }]}
            innerRadius="72%"
            outerRadius="100%"
            startAngle={210}
            endAngle={-30}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              angleAxisId={0}
              tick={false}
            />
            <RadialBar
              dataKey="value"
              background={{ fill: "#F1F5F9" }}
              cornerRadius={8}
              fill={color}
              isAnimationActive={false}
            />
          </RadialBarChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-4">
          <span
            className={`text-3xl font-bold tabular-nums ${
              meetsTarget ? "text-green-600" : "text-red-600"
            }`}
          >
            {Math.round(percentage)}%
          </span>
          <span className="text-xs font-medium text-slate-500">
            Dentro do prazo
          </span>
          <span className="mt-0.5 text-[11px] text-slate-400">
            Meta: {target}%
          </span>
        </div>
      </div>

      <p className="mt-1 text-center text-[11px] text-slate-400">
        {measured > 0
          ? `Base: ${formatNumber(measured)} atendimentos finalizados com limite de envio`
          : "Nenhum atendimento finalizado com limite de envio no periodo"}
      </p>
    </ChartFrame>
  );
}
