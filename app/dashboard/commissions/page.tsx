"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";

type Commission = {
  id: string;
  referenceDate: string;
  amount: number;
  status: string;
  createdAt: string;
  attendantName: string;
  attendantId: string;
  saleId: string;
  saleNumber: number | null;
  saleSubtotal: number | null;
  saleDiscount: number | null;
  saleTotal: number | null;
  saleNetTotal: number | null;
  refundTotal: number | null;
  dayType: "weekday" | "non_working";
  clientName: string;
  productName: string;
  itemQuantity: number | null;
  saleType?: "01" | "02" | "03";
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

export default function CommissionsPage() {
  const { error } = useToast();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [attendants, setAttendants] = useState<Array<{ value: string; label: string }>>([]);
  const [attendantId, setAttendantId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dayType, setDayType] = useState<"" | "weekday" | "non_working">("");

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setIsAdmin(Boolean(parsed.isAdmin ?? parsed.is_admin));
        if (parsed.id) {
          setCurrentUserId(parsed.id);
        }
      } catch {
        setIsAdmin(false);
      }
    }
  }, []);

  useEffect(() => {
    const fetchAttendants = async () => {
      if (!isAdmin) return;
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
            })),
          );
        }
      } catch {
        // silencioso
      }
    };
    fetchAttendants();
  }, [isAdmin]);

  const fetchCommissions = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (isAdmin && attendantId) params.set("attendantId", attendantId);
      if (dayType) params.set("dayType", dayType);
      const url = `/api/commissions/list?${params.toString()}`;
      console.log("[COMMISSIONS PAGE] Fetching:", url);
      console.log("[COMMISSIONS PAGE] Filters:", { isAdmin, attendantId, dayType });

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      console.log("[COMMISSIONS PAGE] Response:", { ok: res.ok, status: res.status, data });

      if (!res.ok) {
        throw new Error(data.error || "Nao foi possivel carregar comissoes");
      }
      console.log("[COMMISSIONS PAGE] Commissions received:", data.commissions?.length || 0);
      setCommissions(data.commissions || []);
    } catch (err) {
      console.error("[COMMISSIONS PAGE] Error:", err);
      const msg = err instanceof Error ? err.message : "Erro ao carregar comissoes";
      error(msg);
    } finally {
      setLoading(false);
    }
  }, [attendantId, dayType, error, isAdmin]);

  useEffect(() => {
    fetchCommissions();
  }, [fetchCommissions]);

  const filteredCommissions = useMemo(() => {
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

    const start = startDate ? toStart(startDate) : null;
    const end = endDate ? toEnd(endDate) : null;

    return commissions.filter((comm) => {
      const refTs = new Date(comm.referenceDate).getTime();
      if (isNaN(refTs)) return false;
      if (start !== null && refTs < start) return false;
      if (end !== null && refTs > end) return false;
      if (statusFilter && comm.status !== statusFilter) return false;
      if (attendantId && comm.attendantId !== attendantId) return false;
      if (!isAdmin && currentUserId && comm.attendantId !== currentUserId) return false;
      if (dayType && comm.dayType !== dayType) return false;
      return true;
    });
  }, [attendantId, commissions, currentUserId, dayType, endDate, isAdmin, startDate, statusFilter]);

  const totalAmount = useMemo(() => {
    const sum = filteredCommissions.reduce((acc, curr) => acc + (curr.amount || 0), 0);
    return Math.round(sum * 100) / 100;
  }, [filteredCommissions]);

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    setStatusFilter("");
    setDayType("");
    if (isAdmin) {
      setAttendantId("");
    }
  };

  return (
    <div className="p-8 space-y-6 text-white">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-widest text-gray-400">Comissoes</p>
        <h1 className="text-3xl font-semibold">Extrato de Comissoes</h1>
        <p className="text-gray-300">
          Visualize suas comissoes geradas, filtre por periodo e acompanhe o total consolidado.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
        <div className="flex flex-col gap-3 px-6 py-4 border-b border-white/10">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-gray-300">
              {filteredCommissions.length} {filteredCommissions.length === 1 ? "registro" : "registros"} encontrados
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm">
              <span className="text-gray-300">Total filtrado</span>
              <span className="font-semibold text-emerald-200">{formatCurrency(totalAmount)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase text-gray-400">Data ref. (inicio)</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white placeholder-gray-500 focus:border-white focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase text-gray-400">Data ref. (fim)</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white placeholder-gray-500 focus:border-white focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase text-gray-400">Status</label>
              <Select
                value={statusFilter}
                onChange={(e: any) => setStatusFilter(e.target.value)}
                options={[
                  { value: "", label: "Todos" },
                  { value: "a_pagar", label: "A Pagar" },
                  { value: "pago", label: "Pago" },
                  { value: "cancelado", label: "Cancelado" },
                ]}
                placeholder="Todos"
                containerClassName="h-[42px]"
                className="py-2 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase text-gray-400">Tipo de dia</label>
              <Select
                value={dayType}
                onChange={(e: any) => setDayType(e.target.value)}
                options={[
                  { value: "", label: "Todos" },
                  { value: "weekday", label: "Dia útil" },
                  { value: "non_working", label: "Dia não útil" },
                ]}
                placeholder="Todos"
                containerClassName="h-[42px]"
                className="py-2 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase text-gray-400">Atendente</label>
              <Select
                value={attendantId}
                onChange={(e: any) => setAttendantId(e.target.value)}
                disabled={!isAdmin}
                options={[
                  { value: "", label: isAdmin ? "Todos" : "Somente minhas comissoes" },
                  ...attendants,
                ]}
                placeholder={isAdmin ? "Todos" : "Somente minhas comissoes"}
                containerClassName="h-[42px]"
                className="py-2 text-sm"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button size="sm" variant="ghost" className="rounded-xl w-full" onClick={clearFilters}>
                Limpar filtros
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="rounded-xl"
                onClick={fetchCommissions}
                disabled={loading}
              >
                {loading ? "Atualizando..." : "Atualizar"}
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-10 text-center text-gray-300">Carregando comissoes...</div>
        ) : filteredCommissions.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400">Nenhuma comissao encontrada com os filtros atuais.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/5">
              <tr className="text-left text-gray-300">
                <th className="px-6 py-3">Data Ref.</th>
                <th className="px-6 py-3">Venda</th>
                <th className="px-6 py-3">Tipo</th>
                <th className="px-6 py-3">Servico/Produto</th>
                <th className="px-6 py-3 text-right">Qtde</th>
                <th className="px-6 py-3 text-right">Bruto</th>
                <th className="px-6 py-3 text-right">Desconto</th>
                <th className="px-6 py-3 text-right">Estorno</th>
                <th className="px-6 py-3 text-right">Liq.</th>
                <th className="px-6 py-3 text-right">Comissao</th>
              </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredCommissions.map((comm) => (
                  <tr key={comm.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-3 text-gray-200">
                      {new Date(comm.referenceDate).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-6 py-3">
                      <a
                        href={`/dashboard/sales?saleId=${comm.saleId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline text-blue-300 font-semibold"
                      >
                        {comm.saleNumber ? `#${comm.saleNumber}` : `${comm.saleId.slice(0, 8)}...`}
                      </a>
                      <p className="text-xs text-gray-400">{comm.clientName}</p>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`text-xs px-2 py-1 rounded border font-medium ${
                        comm.saleType === "03"
                          ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
                          : "bg-blue-500/20 text-blue-300 border-blue-500/40"
                      }`}>
                        {comm.saleType === "03" ? "CONSUMO" : "COMUM"}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-300">
                      <div className="flex flex-col">
                        <span className="font-medium text-white">{comm.productName}</span>
                        <span className="text-xs text-gray-400">
                          {comm.status === "a_pagar" ? "A Pagar" : comm.status}
                          {" · "}
                          {formatDateTime(comm.createdAt)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right text-gray-200">
                      {comm.itemQuantity ?? "-"}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-200">
                      {comm.saleSubtotal !== null ? formatCurrency(comm.saleSubtotal) : "-"}
                    </td>
                    <td className="px-6 py-3 text-right text-amber-200">
                      {comm.saleDiscount !== null ? formatCurrency(comm.saleDiscount) : "-"}
                    </td>
                    <td className="px-6 py-3 text-right text-yellow-200">
                      {comm.refundTotal !== null ? formatCurrency(comm.refundTotal) : "-"}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-200">
                      {comm.saleNetTotal !== null ? formatCurrency(comm.saleNetTotal) : "-"}
                    </td>
                    <td className="px-6 py-3 text-right font-bold text-emerald-400">
                      {formatCurrency(comm.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-white/10 font-bold">
                <tr>
                  <td colSpan={9} className="px-6 py-4 text-right text-white uppercase tracking-wider">
                    Total Geral (Filtrado)
                  </td>
                  <td className="px-6 py-4 text-right text-emerald-300 text-lg">
                    {formatCurrency(totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
