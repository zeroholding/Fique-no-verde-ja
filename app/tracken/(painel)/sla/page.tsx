"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  Loader2,
  RefreshCw,
  Timer,
} from "lucide-react";
import { CarrierBadge } from "@/components/tracken/Badges";
import {
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  PageShell,
  PrimaryButton,
  ProgressRow,
  StatTile,
  formatDuration,
} from "@/components/tracken/PageShell";
import { useTrackenCatalogs } from "@/components/tracken/useTrackenCatalogs";
import { formatNumber, formatPercent, toInputDate } from "@/lib/tracken/format";

/**
 * Tela "SLA & Performance".
 *
 * SLA em uso: atendimento finalizado ANTES do limite de envio do Mercado Livre.
 * Passado o limite, a plataforma ja contabilizou o atraso.
 * (Definicao a confirmar com a Tracken - pergunta 15.5 do documento mestre.)
 */

const FIELD =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[15px] outline-none transition-colors focus:border-green-500 focus:ring-2 focus:ring-green-100";
const LABEL =
  "mb-1 block text-[12.5px] font-semibold uppercase tracking-wide text-slate-500";

type Breakdown = {
  key: string;
  label: string;
  color: string;
  measured: number;
  within: number;
  late: number;
  percentage: number;
  avgMinutesToStart: number | null;
  avgMinutesToFinish: number | null;
};

type SlaResponse = {
  target: number;
  overall: Breakdown;
  byCarrier: Breakdown[];
  byAttendant: Breakdown[];
  open: {
    overdue: number;
    next24h: number;
    onTime: number;
    withoutDeadline: number;
  };
};

const hoje = new Date();
const trintaDiasAtras = new Date(hoje.getTime() - 30 * 24 * 3_600_000);

export default function SlaPage() {
  const { carriers } = useTrackenCatalogs();

  const [startDate, setStartDate] = useState(toInputDate(trintaDiasAtras));
  const [endDate, setEndDate] = useState(toInputDate(hoje));
  const [carrier, setCarrier] = useState("");

  const [data, setData] = useState<SlaResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (carrier) params.set("carrier", carrier);
    return params.toString();
  }, [startDate, endDate, carrier]);

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (options?.silent) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/tracken/sla?${queryString}`, {
          credentials: "include",
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error?.message ?? "Falha ao carregar o SLA");
        }

        setData(payload as SlaResponse);
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Falha ao carregar o SLA"
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [queryString]
  );

  useEffect(() => {
    load();
  }, [load]);

  const atingiuMeta = (data?.overall.percentage ?? 0) >= (data?.target ?? 90);

  const renderBreakdown = (
    titulo: string,
    descricao: string,
    linhas: Breakdown[],
    comBadge: boolean
  ) => (
    <Card title={titulo} description={descricao}>
      {linhas.length === 0 ? (
        <EmptyState
          icon={Gauge}
          title="Sem atendimentos finalizados no periodo"
          hint="O SLA so considera atendimentos concluidos que tinham limite de envio."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left">
            <thead>
              <tr className="border-b border-slate-200 text-[12.5px] font-semibold uppercase tracking-wide text-slate-500">
                <th scope="col" className="py-2 pr-3">
                  {comBadge ? "Transportadora" : "Atendente"}
                </th>
                <th scope="col" className="py-2 pr-3">SLA</th>
                <th scope="col" className="py-2 pr-3 text-right">No prazo</th>
                <th scope="col" className="py-2 pr-3 text-right">Fora</th>
                <th scope="col" className="py-2 pr-3 text-right">Base</th>
                <th scope="col" className="py-2 pr-3">Ate assumir</th>
                <th scope="col" className="py-2">Ate concluir</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr
                  key={linha.key}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="py-2.5 pr-3">
                    {comBadge ? (
                      <CarrierBadge label={linha.key} color={linha.color} />
                    ) : (
                      <span className="text-[15px] text-slate-800">{linha.label}</span>
                    )}
                  </td>

                  <td className="w-40 py-2.5 pr-3">
                    <span
                      className={`text-[15px] font-semibold tabular-nums ${
                        linha.percentage >= (data?.target ?? 90)
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {formatPercent(linha.percentage)}
                    </span>
                    <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <span
                        className={`block h-full rounded-full ${
                          linha.percentage >= (data?.target ?? 90)
                            ? "bg-green-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${Math.min(100, linha.percentage)}%` }}
                      />
                    </span>
                  </td>

                  <td className="py-2.5 pr-3 text-right text-[15px] tabular-nums text-green-700">
                    {formatNumber(linha.within)}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-[15px] tabular-nums text-red-600">
                    {formatNumber(linha.late)}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-[15px] tabular-nums text-slate-600">
                    {formatNumber(linha.measured)}
                  </td>
                  <td className="py-2.5 pr-3 text-[15px] text-slate-600">
                    {formatDuration(linha.avgMinutesToStart)}
                  </td>
                  <td className="py-2.5 text-[15px] text-slate-600">
                    {formatDuration(linha.avgMinutesToFinish)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );

  return (
    <PageShell>
      <PageHeader
        title="SLA & Performance"
        subtitle="Cumprimento do limite de envio do Mercado Livre por transportadora e por atendente"
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

      <Card className="mt-6">
        {/* Eram tres colunas para dois filtros, deixando a terceira vazia e
            comprimindo o par de datas em um terco do card. O periodo agora
            ocupa duas colunas, que e o espaco que dois campos de data pedem. */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            {/* O recorte e pelo LIMITE DE ENVIO, nao pela data de recebimento. */}
            <label className={LABEL} htmlFor="sla-inicio">
              Limite de envio
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                id="sla-inicio"
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
            <label className={LABEL} htmlFor="sla-carrier">Transportadora</label>
            <select
              id="sla-carrier"
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
        </div>
      </Card>

      {isLoading && !data ? (
        <LoadingState label="Calculando SLA..." />
      ) : data ? (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="text-[15px] font-medium text-slate-500">
                  SLA no periodo
                </span>
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                    atingiuMeta
                      ? "bg-green-100 text-green-600"
                      : "bg-red-100 text-red-600"
                  }`}
                >
                  <Gauge className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
                </span>
              </div>
              <p
                className={`mt-3 text-3xl font-bold tabular-nums ${
                  atingiuMeta ? "text-green-600" : "text-red-600"
                }`}
              >
                {formatPercent(data.overall.percentage)}
              </p>
              <p className="mt-1 text-[13.5px] text-slate-500">
                Meta: {data.target}% · base de {formatNumber(data.overall.measured)}
              </p>
            </div>

            <StatTile
              label="Concluidos no prazo"
              value={data.overall.within}
              hint="Antes do limite de envio"
              color="green"
              icon={CheckCircle2}
            />
            <StatTile
              label="Tempo medio ate assumir"
              value={formatDuration(data.overall.avgMinutesToStart)}
              hint="Da chegada ate Em Atendimento"
              color="blue"
              icon={Clock}
            />
            <StatTile
              label="Tempo medio ate concluir"
              value={formatDuration(data.overall.avgMinutesToFinish)}
              hint="Da chegada ate o encerramento"
              color="purple"
              icon={Timer}
            />
          </div>

          {/* A tabela de quebra tem sete colunas e pede ~620px. Em dois tercos
              de `lg` ela rolava dentro do card; a divisao passa para `xl`. */}
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
            <Card
              title="Atendimentos em aberto"
              description="Situacao do prazo de quem ainda nao foi concluido"
            >
              <ul className="space-y-3">
                <ProgressRow
                  label="Limite vencido"
                  value={data.open.overdue}
                  max={Math.max(
                    1,
                    data.open.overdue,
                    data.open.next24h,
                    data.open.onTime,
                    data.open.withoutDeadline
                  )}
                  color="red"
                />
                <ProgressRow
                  label="Vence nas proximas 24h"
                  value={data.open.next24h}
                  max={Math.max(
                    1,
                    data.open.overdue,
                    data.open.next24h,
                    data.open.onTime,
                    data.open.withoutDeadline
                  )}
                  color="amber"
                />
                <ProgressRow
                  label="Dentro do prazo"
                  value={data.open.onTime}
                  max={Math.max(
                    1,
                    data.open.overdue,
                    data.open.next24h,
                    data.open.onTime,
                    data.open.withoutDeadline
                  )}
                  color="green"
                />
                <ProgressRow
                  label="Sem limite informado"
                  value={data.open.withoutDeadline}
                  max={Math.max(
                    1,
                    data.open.overdue,
                    data.open.next24h,
                    data.open.onTime,
                    data.open.withoutDeadline
                  )}
                  color="slate"
                />
              </ul>

              {data.open.overdue > 0 && (
                <p className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13.5px] text-red-700">
                  <AlertTriangle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    aria-hidden="true" strokeWidth={1.75} />
                  {formatNumber(data.open.overdue)} atendimentos com o limite de
                  envio ja vencido. Depois do limite o Mercado Livre ja
                  contabilizou o atraso.
                </p>
              )}
            </Card>

            <div className="xl:col-span-2">
              {renderBreakdown(
                "Por transportadora",
                "SLA e tempo medio de cada transportadora",
                data.byCarrier,
                true
              )}
            </div>
          </div>

          <div className="mt-4">
            {renderBreakdown(
              "Por atendente",
              "Desempenho individual da equipe nos atendimentos concluidos",
              data.byAttendant,
              false
            )}
          </div>

          <p className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-[12.5px] text-slate-500 shadow-sm">
            Como o SLA e calculado: considera apenas atendimentos ja finalizados
            que tinham limite de envio informado, e conta como dentro do prazo
            aquele cuja conclusao ocorreu antes desse limite. Atendimentos
            cancelados ficam fora da conta. Essa definicao ainda precisa de
            confirmacao da TRACKen.
          </p>
        </>
      ) : null}
    </PageShell>
  );
}
