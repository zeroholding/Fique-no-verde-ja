"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/Button";

type Refund = {
  id: string;
  saleId: string;
  saleNumber: number | null;
  saleDate: string;
  createdAt: string;
  amount: number;
  reason: string | null;
  createdBy: string | null;
  createdByName: string | null;
  clientName: string | null;
  productName: string | null;
  quantity: number | null;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return `${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

export default function RefundsPage() {
  const { error } = useToast();
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(false);
  const [saleDateStart, setSaleDateStart] = useState("");
  const [saleDateEnd, setSaleDateEnd] = useState("");
  const [refundDateStart, setRefundDateStart] = useState("");
  const [refundDateEnd, setRefundDateEnd] = useState("");

  const fetchRefunds = useMemo(
    () => async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        error("Sessao expirada. Faca login novamente.");
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/sales/refunds", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Nao foi possivel carregar estornos");
        }
        setRefunds(data.refunds || []);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao carregar estornos";
        error(msg);
      } finally {
        setLoading(false);
      }
    },
    [error]
  );

  useEffect(() => {
    fetchRefunds();
  }, [fetchRefunds]);

  const filteredRefunds = useMemo(() => {
    const toStart = (value: string) => {
      const d = new Date(value);
      if (isNaN(d.getTime())) return null;
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };
    const toEnd = (value: string) => {
      const d = new Date(value);
      if (isNaN(d.getTime())) return null;
      d.setHours(23, 59, 59, 999);
      return d.getTime();
    };

    const saleStart = saleDateStart ? toStart(saleDateStart) : null;
    const saleEnd = saleDateEnd ? toEnd(saleDateEnd) : null;
    const refStart = refundDateStart ? toStart(refundDateStart) : null;
    const refEnd = refundDateEnd ? toEnd(refundDateEnd) : null;

    return refunds.filter((ref) => {
      const saleTs = new Date(ref.saleDate).getTime();
      const refundTs = new Date(ref.createdAt).getTime();
      if (isNaN(saleTs) || isNaN(refundTs)) return false;
      if (saleStart !== null && saleTs < saleStart) return false;
      if (saleEnd !== null && saleTs > saleEnd) return false;
      if (refStart !== null && refundTs < refStart) return false;
      if (refEnd !== null && refundTs > refEnd) return false;
      return true;
    });
  }, [refunds, saleDateStart, saleDateEnd, refundDateStart, refundDateEnd]);

  const clearFilters = () => {
    setSaleDateStart("");
    setSaleDateEnd("");
    setRefundDateStart("");
    setRefundDateEnd("");
  };

  return (
    <div className="p-8 space-y-6 text-white">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-widest text-gray-400">Estornos</p>
        <h1 className="text-3xl font-semibold">Relatorio de Estornos</h1>
        <p className="text-gray-300">
          Visualize todos os estornos lancados, com referencia da venda, datas e usuario que lancou.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
        <div className="flex flex-col gap-3 px-6 py-4 border-b border-white/10">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-300">
              {filteredRefunds.length} {filteredRefunds.length === 1 ? "estorno" : "estornos"} encontrados
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="rounded-xl" onClick={clearFilters}>
                Limpar filtros
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="rounded-xl"
                onClick={fetchRefunds}
                disabled={loading}
              >
                {loading ? "Atualizando..." : "Atualizar"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase text-gray-400">Data da venda (inicio)</label>
                <input
                  type="date"
                  value={saleDateStart}
                  onChange={(e) => setSaleDateStart(e.target.value)}
                  className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white placeholder-gray-500 focus:border-white focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase text-gray-400">Data da venda (fim)</label>
                <input
                  type="date"
                  value={saleDateEnd}
                  onChange={(e) => setSaleDateEnd(e.target.value)}
                  className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white placeholder-gray-500 focus:border-white focus:outline-none"
                />
              </div>
            </div>

            <div className="h-px bg-white/10" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase text-gray-400">Data do estorno (inicio)</label>
                <input
                  type="date"
                  value={refundDateStart}
                  onChange={(e) => setRefundDateStart(e.target.value)}
                  className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white placeholder-gray-500 focus:border-white focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase text-gray-400">Data do estorno (fim)</label>
                <input
                  type="date"
                  value={refundDateEnd}
                  onChange={(e) => setRefundDateEnd(e.target.value)}
                  className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white placeholder-gray-500 focus:border-white focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-10 text-center text-gray-300">Carregando estornos...</div>
        ) : filteredRefunds.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400">Nenhum estorno registrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/5">
                <tr className="text-left text-gray-300">
                  <th className="px-6 py-3">ID da venda</th>
                  <th className="px-6 py-3">Cliente</th>
                  <th className="px-6 py-3">Servico</th>
                  <th className="px-6 py-3">Qtde</th>
                  <th className="px-6 py-3">Data da venda</th>
                  <th className="px-6 py-3">Data/Hora estorno</th>
                  <th className="px-6 py-3">Valor do estorno</th>
                  <th className="px-6 py-3">Usuario</th>
                  <th className="px-6 py-3">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredRefunds.map((ref) => {
                  const saleDisplay = ref.saleNumber !== null ? `#${ref.saleNumber}` : ref.saleId.slice(0, 8);
                  return (
                    <tr key={ref.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-3 font-semibold text-white">{saleDisplay}</td>
                      <td className="px-6 py-3 text-gray-200">{ref.clientName || "-"}</td>
                      <td className="px-6 py-3 text-gray-200">{ref.productName || "-"}</td>
                      <td className="px-6 py-3 text-gray-200">{ref.quantity ?? "-"}</td>
                      <td className="px-6 py-3 text-gray-200">
                        {new Date(ref.saleDate).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-6 py-3 text-gray-200">{formatDateTime(ref.createdAt)}</td>
                      <td className="px-6 py-3 text-yellow-200">{formatCurrency(ref.amount)}</td>
                      <td className="px-6 py-3 text-gray-200">{ref.createdByName || ref.createdBy || "-"}</td>
                      <td className="px-6 py-3 text-gray-300">{ref.reason ? ref.reason : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
