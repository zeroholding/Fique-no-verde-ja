"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";

type Operation = {
  id: string;
  clientId: string;
  clientName: string;
  serviceName: string | null;
  saleId: string | null;
  attendantName: string;
  operationType: "compra" | "consumo";
  date: string;
  value: number;
  quantity: number;
  unitPrice: number;
  balanceAfter: number;
  balanceQuantityAfter: number;
  observations: string | null;
};

type Summary = {
  clientId: string;
  clientName: string;
  totalAcquired: number;
  totalConsumed: number;
  balanceCurrent: number;
  totalQuantityAcquired: number;
  totalQuantityConsumed: number;
  balanceQuantityCurrent: number;
  lastOperation: string | null;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatDateTime = (value: string) => {
  const d = new Date(value);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

function PackagesStatementContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [operations, setOperations] = useState<Operation[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filtros
  const [typeFilter, setTypeFilter] = useState<"" | "compra" | "consumo">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  
  const [selectedOperation, setSelectedOperation] = useState<Operation | null>(null);

  const hasValidToken = useMemo(() => Boolean(token), [token]);

  const fetchStatement = async () => {
    if (!hasValidToken) {
      setError("Link invalido ou token ausente.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("token", token);
      if (typeFilter) params.set("type", typeFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/packages/public-statement?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao carregar extrato");
      }

      const normalizedOperations: Operation[] = Array.isArray(data.operations)
        ? data.operations.map((op: any) => ({
            ...op,
            observations: op.observations ?? null,
          }))
        : [];

      setOperations(normalizedOperations);
      const firstSummary = Array.isArray(data.summary) ? data.summary[0] : null;
      setSummary(firstSummary);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar extrato";
      const friendlyMessage = message.toLowerCase().includes("jwt expired")
        ? "Link expirado. Solicite um novo com a equipe."
        : message;
      setError(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]); 
  // Nao incluir filtros no deps para evitar refetch automatico se nao desejado, 
  // mas geralmente em filtros de tabela eh bom ter botao de "Aplicar" ou debounce.
  // Aqui vamos manter o botao "Recarregar" como gatilho principal de atualizacao manual alem do mount.

  // O "Resumo" exibido nos cards deve refletir o que veio da API (que ja esta filtrado se os params foram enviados)
  // Como agora o filtro eh server-side, o summary retornado pela API ja deve considerar o filtro (se implementado no backend)
  // No backend public-statement, eu implementei o calculo de summary baseado nos filteredOps.

  const lastOperationLabel = useMemo(() => {
    if (!summary?.lastOperation) return "Sem movimento";
    return formatDateTime(summary.lastOperation);
  }, [summary?.lastOperation]);

  const hasObservation = (obs?: string | null) => Boolean(obs && String(obs).trim().length > 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#0f1115] to-black text-white">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        <div className="rounded-3xl bg-white/5 border border-white/10 shadow-2xl p-6 space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-blue-300/70">Extrato exclusivo</p>
          <h1 className="text-3xl font-semibold">
            Extrato de Pacotes{" "}
            {summary?.clientName ? (
              <span className="text-blue-200">- {summary.clientName}</span>
            ) : (
              <span className="text-gray-400">(Transportadora)</span>
            )}
          </h1>
          <p className="text-gray-300 max-w-3xl">
            Este link foi gerado pela equipe apenas para a sua transportadora. Use-o para acompanhar compras e
            consumos de pacotes sem precisar acessar o painel principal.
          </p>
          <div className="flex items-center gap-3">
            <Button size="sm" className="rounded-xl" onClick={fetchStatement} disabled={loading || !hasValidToken}>
              {loading ? "Atualizando..." : "Atualizar extrato"}
            </Button>
            {!hasValidToken && (
              <span className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-lg">
                Token ausente ou invalido
              </span>
            )}
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
            <p className="text-red-200 font-semibold mb-1">Nao foi possivel carregar o extrato</p>
            <p className="text-sm text-red-100/80">{error}</p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-4 space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-40">
                  <label className="text-xs uppercase text-gray-400 block">Tipo</label>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as "" | "compra" | "consumo")}
                    className="w-full rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white"
                  >
                    <option value="">Compra e Consumo</option>
                    <option value="compra">Compra</option>
                    <option value="consumo">Consumo</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase text-gray-400 block">Data inicio</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white placeholder-gray-500 focus:border-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-gray-400 block">Data fim</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white placeholder-gray-500 focus:border-white focus:outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="rounded-xl" onClick={fetchStatement} disabled={loading || !hasValidToken}>
                    {loading ? "Recarregando..." : "Filtrar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-xl"
                    onClick={() => {
                      setTypeFilter("");
                      setStartDate("");
                      setEndDate("");
                      // Opcional: chamar fetchStatement() aqui se quiser resetar imediato.
                      // Vamos deixar o usuario clicar em Filtrar (que vai virar "Recarregar" na UI)
                      // ou podemos forcar um reset visual e pedir pra recarregar.
                    }}
                  >
                    Limpar filtros
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/5 p-4">
                <p className="text-xs uppercase text-emerald-200/80 mb-1">Saldo de creditos (qtde)</p>
                <p className="text-3xl font-bold text-emerald-200">
                  {summary ? summary.balanceQuantityCurrent ?? 0 : "-"}
                </p>
                <p className="text-xs text-emerald-100/70 mt-1">
                  Saldo financeiro: {formatCurrency(summary?.balanceCurrent ?? 0)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
                <p className="text-xs uppercase text-gray-300 mb-1">Creditos adquiridos</p>
                <p className="text-xl font-semibold text-white">
                  {summary ? summary.totalQuantityAcquired ?? 0 : "-"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Valor: {formatCurrency(summary?.totalAcquired ?? 0)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
                <p className="text-xs uppercase text-gray-300 mb-1">Creditos consumidos</p>
                <p className="text-xl font-semibold text-white">
                  {summary ? summary.totalQuantityConsumed ?? 0 : "-"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Valor: {formatCurrency(summary?.totalConsumed ?? 0)}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-5 py-4 border-b border-white/10">
                <div>
                  <p className="text-sm text-gray-300">Ultima operacao registrada</p>
                  <p className="text-lg font-semibold text-white">{lastOperationLabel}</p>
                </div>
                <div className="text-xs text-gray-400">
                  Movimentos listados por ordem mais recente. O saldo acompanha cada operacao.
                </div>
              </div>

              <div className="overflow-x-auto">
                {loading ? (
                  <div className="px-6 py-10 text-center text-gray-300">Carregando extrato...</div>
                ) : operations.length === 0 ? (
                  <div className="px-6 py-10 text-center text-gray-400">
                    Nenhum lancamento encontrado para esta transportadora com estes filtros.
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-white/10 text-sm">
                    <thead className="bg-white/5">
                      <tr className="text-left text-gray-300">
                        <th className="px-4 py-3">Data</th>
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3">Servico</th>
                        <th className="px-4 py-3">Quantidade</th>
                        <th className="px-4 py-3">Saldo (qtde)</th>
                        <th className="px-4 py-3">Saldo (R$)</th>
                        <th className="px-4 py-3">Atendente</th>
                        <th className="px-4 py-3 text-right">Obs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {operations.map((op) => (
                        <tr key={op.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 text-gray-200">{formatDateTime(op.date)}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-3 py-1 rounded-full border text-xs ${
                                op.operationType === "compra"
                                  ? "border-emerald-400 text-emerald-200 bg-emerald-400/10"
                                  : "border-orange-400 text-orange-200 bg-orange-400/10"
                              }`}
                            >
                              {op.operationType === "compra" ? "Compra" : "Consumo"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-200">{op.serviceName || "-"}</td>
                          <td className="px-4 py-3 text-white">{op.quantity ?? 0}</td>
                          <td className="px-4 py-3 text-emerald-200">{op.balanceQuantityAfter ?? 0}</td>
                          <td className="px-4 py-3 text-gray-200">{formatCurrency(op.balanceAfter ?? 0)}</td>
                          <td className="px-4 py-3 text-gray-200">{op.attendantName}</td>
                          <td className="px-4 py-3 text-right">
                            {op.operationType === "consumo" ? (
                              hasObservation(op.observations) ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="rounded-lg px-3"
                                  onClick={() => setSelectedOperation(op)}
                                >
                                  Ver obs
                                </Button>
                              ) : (
                                <span className="text-xs text-gray-500">Sem obs</span>
                              )
                            ) : (
                              <span className="text-xs text-gray-500">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <Modal
        open={Boolean(selectedOperation)}
        onClose={() => setSelectedOperation(null)}
        title="Observacoes do consumo"
        widthClassName="max-w-2xl"
      >
        {selectedOperation && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-300">
              <div>
                <p className="text-gray-400">Data</p>
                <p className="font-semibold text-white">{formatDateTime(selectedOperation.date)}</p>
              </div>
              <div>
                <p className="text-gray-400">Servico</p>
                <p className="font-semibold text-white">{selectedOperation.serviceName || "-"}</p>
              </div>
              <div>
                <p className="text-gray-400">Atendente</p>
                <p className="font-semibold text-white">{selectedOperation.attendantName}</p>
              </div>
              <div>
                <p className="text-gray-400">Quantidade consumida</p>
                <p className="font-semibold text-white">{selectedOperation.quantity}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-gray-100 whitespace-pre-wrap">
              {selectedOperation.observations}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function PublicPackagesStatementPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-black via-[#0f1115] to-black text-white flex items-center justify-center">
          <div className="text-gray-300">Carregando extrato...</div>
        </div>
      }
    >
      <PackagesStatementContent />
    </Suspense>
  );
}
