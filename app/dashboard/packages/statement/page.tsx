"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";

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
  const { error } = useToast();
  const [operations, setOperations] = useState<Operation[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(false);

  // Inicializa com o parametro da URL, se existir
  const [clientId, setClientId] = useState(searchParams.get("clientId") || "");
  const [typeFilter, setTypeFilter] = useState<"" | "compra" | "consumo">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [attendantId, setAttendantId] = useState("");
  const [attendants, setAttendants] = useState<Array<{ value: string; label: string }>>([]);

  const clientsOptions = useMemo(() => {
    const unique = new Map<string, string>();
    operations.forEach((op) => {
      if (!unique.has(op.clientId)) {
        unique.set(op.clientId, op.clientName);
      }
    });
    return Array.from(unique.entries()).map(([value, label]) => ({ value, label }));
  }, [operations]);

  const fetchAttendants = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.users)) {
        setAttendants(
          data.users.map((u: any) => ({
            value: u.id,
            label: `${u.first_name} ${u.last_name}`.trim() || u.email,
          }))
        );
      }
    } catch {
      // silencioso
    }
  };

  const fetchStatement = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      // Usa o state atual de clientId
      if (clientId) params.set("clientId", clientId);
      if (typeFilter) params.set("type", typeFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
       if (attendantId) params.set("attendantId", attendantId);

      const res = await fetch(`/api/packages/statement?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao carregar extrato de pacotes");
      }
      setOperations(data.operations || []);
      setSummary(data.summary || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar extrato de pacotes";
      error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch quando filtros chave mudam
  useEffect(() => {
    fetchStatement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, typeFilter]); // Removemos attendantId para evitar fetch excessivo, mas poderiamos incluir

  useEffect(() => {
    fetchAttendants();
  }, []);

  const filteredSummary = useMemo(() => {
    if (!clientId) return summary;
    return summary.filter((s) => s.clientId === clientId);
  }, [clientId, summary]);

  const filteredOperations = useMemo(() => {
    if (!clientId) return operations;
    return operations.filter((op) => op.clientId === clientId);
  }, [clientId, operations]);

  const selectedSummary = filteredSummary[0];

  return (
    <div className="p-8 space-y-6 text-white">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-widest text-gray-400">Pacotes</p>
        <h1 className="text-3xl font-semibold">Extrato de Pacotes</h1>
        <p className="text-gray-300">
          Visao consolidada das compras e consumos de pacotes, com saldo e rastreabilidade por cliente parceiro.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur space-y-4">
        <div className="flex flex-col gap-3 px-6 py-4 border-b border-white/10">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-56">
              <Select
                label="Cliente parceiro"
                value={clientId}
                onChange={(e: any) => setClientId(e.target.value)}
                options={[{ value: "", label: "Todos" }, ...clientsOptions]}
              />
            </div>
            {attendants.length > 0 && (
              <div className="w-56">
                <Select
                  label="Atendente (só master)"
                  value={attendantId}
                  onChange={(e: any) => setAttendantId(e.target.value)}
                  options={[{ value: "", label: "Todos" }, ...attendants]}
                />
              </div>
            )}
            <div className="w-40">
              <Select
                label="Tipo"
                value={typeFilter}
                onChange={(e: any) => setTypeFilter(e.target.value)}
                options={[
                  { value: "", label: "Compra e Consumo" },
                  { value: "compra", label: "Compra" },
                  { value: "consumo", label: "Consumo" },
                ]}
              />
            </div>
            <div className="flex items-end gap-2">
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
              <Button size="sm" className="rounded-xl" onClick={fetchStatement} disabled={loading}>
                {loading ? "Filtrando..." : "Aplicar"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-xl"
                onClick={() => {
                  setClientId("");
                  setTypeFilter("");
                  setStartDate("");
                  setEndDate("");
                  setAttendantId("");
                  // Forcar reload para limpar
                  setTimeout(() => document.getElementById("btn-reload")?.click(), 100);
                }}
              >
                Limpar
              </Button>
            </div>
          </div>

          {selectedSummary && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 pt-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase text-gray-400 mb-1">Saldo de créditos (qtde)</p>
                <p className="text-2xl font-bold text-emerald-300">
                  {selectedSummary.balanceQuantityCurrent ?? 0}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Saldo financeiro: {formatCurrency(selectedSummary.balanceCurrent ?? 0)}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase text-gray-400 mb-1">Créditos adquiridos (qtde)</p>
                <p className="text-xl font-semibold text-white">
                  {selectedSummary.totalQuantityAcquired ?? 0}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Valor: {formatCurrency(selectedSummary.totalAcquired ?? 0)}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase text-gray-400 mb-1">Créditos consumidos (qtde)</p>
                <p className="text-xl font-semibold text-white">
                  {selectedSummary.totalQuantityConsumed ?? 0}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Valor: {formatCurrency(selectedSummary.totalConsumed ?? 0)}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase text-gray-400 mb-1">Última operação</p>
                <p className="text-sm text-gray-200">
                  {selectedSummary.lastOperation
                    ? formatDateTime(selectedSummary.lastOperation)
                    : "Sem movimento"}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="px-6 py-10 text-center text-gray-300">Carregando extrato...</div>
          ) : filteredOperations.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-400">Nenhum lancamento encontrado.</div>
          ) : (
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/5">
                <tr className="text-left text-gray-300">
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Serviço</th>
                  <th className="px-4 py-3">Quantidade</th>
                  <th className="px-4 py-3">Saldo (qtde)</th>
                  <th className="px-4 py-3">Atendente</th>
                  <th className="px-4 py-3">Venda</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredOperations.map((op) => (
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
                    <td className="px-4 py-3 text-gray-200">{op.clientName}</td>
                    <td className="px-4 py-3 text-gray-200">{op.serviceName || "-"}</td>
                    <td className="px-4 py-3 text-white">{op.quantity ?? 0}</td>
                    <td className="px-4 py-3 text-emerald-200">{op.balanceQuantityAfter ?? 0}</td>
                    <td className="px-4 py-3 text-gray-200">{op.attendantName}</td>
                    <td className="px-4 py-3 text-blue-300">
                      {op.saleId ? <a href={`/dashboard/sales?saleId=${op.saleId}`}>Ver venda</a> : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PackagesStatementPage() {
  return (
    <Suspense fallback={<div className="p-8 text-white">Carregando...</div>}>
      <PackagesStatementContent />
    </Suspense>
  );
}
