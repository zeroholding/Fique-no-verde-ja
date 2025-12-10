"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";

// --- Tipos e Componentes para Políticas ---

type CommissionPolicy = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  value: number;
  scope: string;
  product_id: string | null;
  user_id: string | null;
  sale_type: string;
  applies_to: string;
  consider_business_days: boolean;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const formatPolicyValue = (type: string, value: number) =>
  type === "percentage" ? `${value}%` : `R$ ${value.toFixed(2)}`;

function CommissionsPolicies() {
  const { error } = useToast();
  const [policies, setPolicies] = useState<CommissionPolicy[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPolicies = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/commission-policies", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao carregar politicas de comissao");
      }
      setPolicies(data.policies || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar politicas de comissao";
      error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <p className="text-sm text-gray-300">
          {policies.length} {policies.length === 1 ? "politica" : "politicas"} encontradas
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="rounded-xl"
          onClick={fetchPolicies}
          disabled={loading}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </Button>
      </div>

      {loading ? (
        <div className="px-6 py-10 text-center text-gray-300">Carregando politicas...</div>
      ) : policies.length === 0 ? (
        <div className="px-6 py-10 text-center text-gray-400">Nenhuma politica cadastrada.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="bg-white/5">
              <tr className="text-left text-gray-300">
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Tipo/Valor</th>
                <th className="px-4 py-3">Escopo</th>
                <th className="px-4 py-3">Tipo venda</th>
                <th className="px-4 py-3">Aplica em</th>
                <th className="px-4 py-3">Vigencia</th>
                <th className="px-4 py-3">Ativa</th>
                <th className="px-4 py-3">Criada em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {policies.map((p) => (
                <tr key={p.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-white">{p.name}</p>
                    {p.description && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">{p.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-200">
                    {p.type === "percentage" ? "Percentual" : "Fixo por unidade"} —{" "}
                    {formatPolicyValue(p.type, p.value)}
                  </td>
                  <td className="px-4 py-3 text-gray-200">
                    {p.scope === "general"
                      ? "Geral"
                      : p.scope === "product"
                        ? "Produto"
                        : p.scope === "user"
                          ? "Usuario"
                          : "Usuario + Produto"}
                  </td>
                  <td className="px-4 py-3 text-gray-200">
                    {p.sale_type === "all"
                      ? "Todos"
                      : p.sale_type === "01"
                        ? "Venda comum (01)"
                        : p.sale_type === "02"
                          ? "Venda de pacote (02)"
                          : p.sale_type === "03"
                            ? "Consumo de pacote (03)"
                            : p.sale_type}
                  </td>
                  <td className="px-4 py-3 text-gray-200">
                    {p.applies_to === "all"
                      ? "Todos os dias"
                      : p.applies_to === "weekdays"
                        ? "Somente uteis"
                        : "Finais/feriados"}
                    {p.consider_business_days ? " (considera dias uteis)" : ""}
                  </td>
                  <td className="px-4 py-3 text-gray-200">
                    {new Date(p.valid_from).toLocaleDateString("pt-BR")}{" "}
                    {p.valid_until ? `- ${new Date(p.valid_until).toLocaleDateString("pt-BR")}` : "• aberto"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-3 py-1 rounded-full border text-xs ${
                        p.is_active
                          ? "border-green-400 text-green-200 bg-green-400/10"
                          : "border-red-400 text-red-200 bg-red-400/10"
                      }`}
                    >
                      {p.is_active ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(p.created_at).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- Tipos e Componentes para Extrato ---

type Commission = {
  id: string;
  referenceDate: string;
  amount: number;
  status: string;
  createdAt: string;
  attendantId: string;
  attendantName: string;
  saleId: string;
  clientName: string;
  productName: string;
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

function CommissionsStatement() {
  const { error } = useToast();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [attendants, setAttendants] = useState<Array<{ value: string; label: string }>>([]);
  const [loading, setLoading] = useState(false);

  // Filtros
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [attendantId, setAttendantId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

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

  useEffect(() => {
    fetchAttendants();
  }, []);

  const fetchCommissions = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/commissions/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Nao foi possivel carregar comissoes");
      }
      setCommissions(data.commissions || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar comissoes";
      error(msg);
    } finally {
      setLoading(false);
    }
  }, [error]);

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
      if (attendantId && comm.attendantId !== attendantId) return false;
      if (statusFilter && comm.status !== statusFilter) return false;
      return true;
    });
  }, [commissions, startDate, endDate, attendantId, statusFilter]);

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    setAttendantId("");
    setStatusFilter("");
  };

  const totalAmount = useMemo(() => {
    return filteredCommissions.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  }, [filteredCommissions]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
      <div className="flex flex-col gap-3 px-6 py-4 border-b border-white/10">
        {/* Filtros */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase text-gray-400">Data inicial</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white placeholder-gray-500 focus:border-white focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase text-gray-400">Data final</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white placeholder-gray-500 focus:border-white focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase text-gray-400">Atendente</label>
            <Select
              value={attendantId}
              onChange={(e: any) => setAttendantId(e.target.value)}
              options={[{ value: "", label: "Todos" }, ...attendants]}
              placeholder="Todos"
              containerClassName="h-[42px]"
              className="py-2 text-sm"
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
        </div>

        <div className="flex items-center justify-between mt-2 flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm text-gray-300">
              {filteredCommissions.length} {filteredCommissions.length === 1 ? "registro" : "registros"} encontrados
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm">
              <span className="text-gray-300">Total filtrado</span>
              <span className="font-semibold text-emerald-200">{formatCurrency(totalAmount)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="rounded-xl" onClick={clearFilters}>
              Limpar
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
        <div className="px-6 py-10 text-center text-gray-300">Carregando extrato...</div>
      ) : filteredCommissions.length === 0 ? (
        <div className="px-6 py-10 text-center text-gray-400">Nenhuma comissao encontrada com os filtros atuais.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="bg-white/5">
              <tr className="text-left text-gray-300">
                <th className="px-6 py-3">Data Ref.</th>
                <th className="px-6 py-3">Venda</th>
                <th className="px-6 py-3">Atendente</th>
                <th className="px-6 py-3">Cliente</th>
                <th className="px-6 py-3">Serviço/Produto</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredCommissions.map((comm) => (
                <tr key={comm.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-3 text-gray-200">
                    {new Date(comm.referenceDate).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-6 py-3 text-blue-300 font-mono text-xs">
                    <a href={`/dashboard/sales?saleId=${comm.saleId}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {comm.saleId.slice(0, 8)}...
                    </a>
                  </td>
                  <td className="px-6 py-3 text-white font-medium">{comm.attendantName}</td>
                  <td className="px-6 py-3 text-gray-300">{comm.clientName}</td>
                  <td className="px-6 py-3 text-gray-300">{comm.productName}</td>
                  <td className="px-6 py-3">
                    <span
                      className={`px-2 py-1 rounded text-[10px] uppercase tracking-wide border ${
                        comm.status === "pago"
                          ? "border-green-500/30 bg-green-500/10 text-green-300"
                          : comm.status === "cancelado"
                            ? "border-red-500/30 bg-red-500/10 text-red-300"
                            : "border-yellow-500/30 bg-yellow-500/10 text-yellow-300"
                      }`}
                    >
                      {comm.status === "a_pagar" ? "A Pagar" : comm.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right font-bold text-emerald-400">
                    {formatCurrency(comm.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* TOTALZÃO NO FINAL DA TABELA */}
            <tfoot className="bg-white/10 font-bold">
              <tr>
                <td colSpan={6} className="px-6 py-4 text-right text-white uppercase tracking-wider">
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
  );
}

// --- Página Principal ---

export default function AdminCommissionsPage() {
  const [activeTab, setActiveTab] = useState<"statement" | "policies">("statement");

  return (
    <div className="p-8 space-y-6 text-white">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-widest text-gray-400">Admin</p>
          <h1 className="text-3xl font-semibold">Gestão de Comissões</h1>
          <p className="text-gray-300">
            Acompanhe o extrato de comissões geradas ou configure as políticas de pagamento.
          </p>
        </div>
        <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 self-start md:self-auto">
          <button
            onClick={() => setActiveTab("statement")}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "statement"
                ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Extrato
          </button>
          <button
            onClick={() => setActiveTab("policies")}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "policies"
                ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Políticas
          </button>
        </div>
      </div>

      {activeTab === "statement" ? <CommissionsStatement /> : <CommissionsPolicies />}
    </div>
  );
}

