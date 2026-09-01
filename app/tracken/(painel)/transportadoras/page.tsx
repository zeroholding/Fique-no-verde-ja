"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  Loader2,
  Package,
  Pencil,
  X,
} from "lucide-react";
import { CarrierBadge } from "@/components/tracken/Badges";
import {
  Card,
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  PageShell,
  ProgressRow,
  StatTile,
} from "@/components/tracken/PageShell";
import { useTrackenCatalogs } from "@/components/tracken/useTrackenCatalogs";
import type { PanelCarrier } from "@/components/tracken/panel-types";
import { formatDate, formatNumber } from "@/lib/tracken/format";
import { DOT_CLASSES, normalizeColor } from "@/components/tracken/tokens";

/**
 * Tela "Transportadoras": quem envia atendimentos pela TRACKen, quanto volume
 * cada uma traz e quantos estao com o limite de envio vencido.
 *
 * A cor definida aqui e a mesma usada nos badges da tabela e no grafico de
 * rosca do painel.
 */

const CORES = [
  { value: "green", label: "Verde" },
  { value: "blue", label: "Azul" },
  { value: "amber", label: "Ambar" },
  { value: "red", label: "Vermelho" },
  { value: "purple", label: "Roxo" },
  { value: "slate", label: "Cinza" },
];

type CarrierWithExtras = PanelCarrier & {
  overdue_tickets?: number;
  last_received_at?: string | null;
  is_active?: boolean;
};

export default function TransportadorasPage() {
  const { carriers, isLoading, error, reload } = useTrackenCatalogs({
    includeInactive: true,
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; color: string }>({
    name: "",
    color: "slate",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const lista = carriers as CarrierWithExtras[];
  const totalAtendimentos = lista.reduce((sum, c) => sum + c.total_tickets, 0);
  const totalAbertos = lista.reduce((sum, c) => sum + c.open_tickets, 0);
  const totalVencidos = lista.reduce(
    (sum, c) => sum + (c.overdue_tickets ?? 0),
    0
  );
  const maxVolume = Math.max(1, ...lista.map((c) => c.total_tickets));

  const salvar = async (id: string, patch: Record<string, unknown>) => {
    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/tracken/carriers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message ?? "Falha ao salvar");
      }

      setEditing(null);
      await reload();
    } catch (patchError) {
      setSaveError(
        patchError instanceof Error ? patchError.message : "Falha ao salvar"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Transportadoras"
        subtitle="Transportadoras que enviam atendimentos pela TRACKen e o volume de cada uma"
      />

      {error && <ErrorBanner message={error} />}
      {saveError && <ErrorBanner message={saveError} />}

      {isLoading ? (
        <LoadingState label="Carregando transportadoras..." />
      ) : lista.length === 0 ? (
        <Card className="mt-6">
          <EmptyState
            icon={Building2}
            title="Nenhuma transportadora cadastrada"
            hint="A migration 019 cadastra TM, J3, PEX e TRANSMOTO automaticamente."
          />
        </Card>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Transportadoras ativas"
              value={lista.filter((c) => c.is_active !== false).length}
              hint={`${lista.length} cadastradas`}
              color="blue"
              icon={Building2}
            />
            <StatTile
              label="Atendimentos recebidos"
              value={totalAtendimentos}
              hint="Todo o periodo"
              color="green"
              icon={Package}
            />
            <StatTile
              label="Em aberto"
              value={totalAbertos}
              hint="Ainda nao finalizados"
              color="amber"
              icon={Package}
            />
            <StatTile
              label="Com limite vencido"
              value={totalVencidos}
              hint="Prazo do ML ja passou"
              color="red"
              icon={AlertTriangle}
            />
          </div>

          {/* A tabela de cadastro tem oito colunas e pede ~760px. Em
              `lg:grid-cols-3` ela ficava em dois tercos de ~1024px menos a
              barra lateral, ou seja rolava na horizontal ja em `lg`. A divisao
              passa para `xl`. */}
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
            <Card
              title="Volume por transportadora"
              description="Total de atendimentos recebidos"
              className="xl:col-span-1"
            >
              <ul className="space-y-3">
                {lista
                  .slice()
                  .sort((a, b) => b.total_tickets - a.total_tickets)
                  .map((carrier) => (
                    <ProgressRow
                      key={carrier.id}
                      label={carrier.code}
                      sublabel={
                        totalAtendimentos > 0
                          ? `${((carrier.total_tickets / totalAtendimentos) * 100).toFixed(1).replace(".", ",")}%`
                          : undefined
                      }
                      value={carrier.total_tickets}
                      max={maxVolume}
                      color={carrier.color}
                    />
                  ))}
              </ul>
            </Card>

            <Card
              title="Cadastro"
              description="Nome e cor do badge usado no painel"
              className="xl:col-span-2"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-[12.5px] font-semibold uppercase tracking-wide text-slate-500">
                      <th scope="col" className="py-2 pr-3">Sigla</th>
                      <th scope="col" className="py-2 pr-3">Nome</th>
                      <th scope="col" className="py-2 pr-3">Cor</th>
                      <th scope="col" className="py-2 pr-3 text-right">Total</th>
                      <th scope="col" className="py-2 pr-3 text-right">Abertos</th>
                      <th scope="col" className="py-2 pr-3">Ultimo envio</th>
                      <th scope="col" className="py-2 pr-3">Situacao</th>
                      <th scope="col" className="py-2 text-right">Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((carrier) => {
                      const emEdicao = editing === carrier.id;

                      return (
                        <tr
                          key={carrier.id}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="py-2.5 pr-3">
                            <CarrierBadge
                              label={carrier.code}
                              color={carrier.color}
                            />
                          </td>

                          <td className="py-2.5 pr-3">
                            {emEdicao ? (
                              <input
                                type="text"
                                value={draft.name}
                                onChange={(event) =>
                                  setDraft((d) => ({
                                    ...d,
                                    name: event.target.value,
                                  }))
                                }
                                aria-label={`Nome da transportadora ${carrier.code}`}
                                className="w-full rounded-md border border-slate-200 px-2 py-1 text-[15px] outline-none focus:border-green-500"
                              />
                            ) : (
                              <span className="text-[15px] text-slate-800">
                                {carrier.name}
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 pr-3">
                            {emEdicao ? (
                              <select
                                value={draft.color}
                                onChange={(event) =>
                                  setDraft((d) => ({
                                    ...d,
                                    color: event.target.value,
                                  }))
                                }
                                aria-label={`Cor do badge de ${carrier.code}`}
                                className="rounded-md border border-slate-200 px-2 py-1 text-[15px] outline-none focus:border-green-500"
                              >
                                {CORES.map((cor) => (
                                  <option key={cor.value} value={cor.value}>
                                    {cor.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="flex items-center gap-1.5 text-[15px] text-slate-600">
                                <span
                                  className={`h-2.5 w-2.5 rounded-full ${
                                    DOT_CLASSES[normalizeColor(carrier.color)]
                                  }`}
                                  aria-hidden="true"
                                />
                                {CORES.find((c) => c.value === carrier.color)
                                  ?.label ?? carrier.color}
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 pr-3 text-right text-[15px] tabular-nums text-slate-800">
                            {formatNumber(carrier.total_tickets)}
                          </td>

                          <td className="py-2.5 pr-3 text-right text-[15px] tabular-nums">
                            <span
                              className={
                                (carrier.overdue_tickets ?? 0) > 0
                                  ? "font-semibold text-red-600"
                                  : "text-slate-800"
                              }
                            >
                              {formatNumber(carrier.open_tickets)}
                            </span>
                            {(carrier.overdue_tickets ?? 0) > 0 && (
                              <span className="block text-[11.5px] text-red-500">
                                {carrier.overdue_tickets} vencidos
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 pr-3 text-[15px] text-slate-600">
                            {carrier.last_received_at
                              ? formatDate(carrier.last_received_at)
                              : "-"}
                          </td>

                          <td className="py-2.5 pr-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[12.5px] font-semibold ${
                                carrier.is_active === false
                                  ? "bg-slate-100 text-slate-500"
                                  : "bg-green-50 text-green-700"
                              }`}
                            >
                              {carrier.is_active === false ? "Inativa" : "Ativa"}
                            </span>
                          </td>

                          <td className="py-2.5 text-right">
                            {emEdicao ? (
                              <span className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() =>
                                    salvar(carrier.id, {
                                      name: draft.name,
                                      color: draft.color,
                                    })
                                  }
                                  className="rounded-md p-1.5 text-green-600 transition-colors hover:bg-green-50 disabled:opacity-50"
                                  aria-label="Salvar"
                                >
                                  {isSaving ? (
                                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                                  ) : (
                                    <Check className="h-4 w-4" strokeWidth={1.75} />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditing(null)}
                                  className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100"
                                  aria-label="Cancelar"
                                >
                                  <X className="h-4 w-4" strokeWidth={1.75} />
                                </button>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditing(carrier.id);
                                    setDraft({
                                      name: carrier.name,
                                      color: carrier.color,
                                    });
                                  }}
                                  className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                  aria-label={`Editar ${carrier.code}`}
                                >
                                  <Pencil className="h-4 w-4" strokeWidth={1.75} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    salvar(carrier.id, {
                                      isActive: carrier.is_active === false,
                                    })
                                  }
                                  className="rounded-md px-2 py-1 text-[12.5px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                >
                                  {carrier.is_active === false
                                    ? "Ativar"
                                    : "Desativar"}
                                </button>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-[12.5px] text-slate-400">
                Editar nome e cor exige perfil administrativo. Transportadora
                desativada deixa de aparecer nos filtros, mas os atendimentos
                dela seguem preservados.
              </p>
            </Card>
          </div>
        </>
      )}
    </PageShell>
  );
}
