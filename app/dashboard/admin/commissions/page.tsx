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
  const { error, success } = useToast();
  const [policies, setPolicies] = useState<CommissionPolicy[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<CommissionPolicy | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    value: "",
    type: "percentage",
    applies_to: "all",
    valid_from: "",
    valid_until: "",
    description: "",
  });

  const fetchPolicies = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/commission-policies", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPolicies(data.policies || []);
    } catch (err: any) {
      error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  // Handlers
  const handleOpenCreate = () => {
    setEditingPolicy(null);
    setFormData({
      name: "",
      value: "",
      type: "percentage",
      applies_to: "all",
      valid_from: new Date().toISOString().split("T")[0],
      valid_until: "",
      description: "",
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (policy: CommissionPolicy) => {
    setEditingPolicy(policy);
    setFormData({
      name: policy.name,
      value: policy.value.toString(),
      type: policy.type,
      applies_to: policy.applies_to,
      valid_from: policy.valid_from.split("T")[0],
      valid_until: policy.valid_until ? policy.valid_until.split("T")[0] : "",
      description: policy.description || "",
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta politica?")) return;
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/admin/commission-policies?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erro ao excluir");
      success("Politica excluida com sucesso!");
      fetchPolicies();
    } catch (err: any) {
      error(err.message);
    }
  };

  const handleToggleStatus = async (policy: CommissionPolicy) => {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch("/api/admin/commission-policies", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: policy.id, is_active: !policy.is_active }),
      });
      if (!res.ok) throw new Error("Erro ao atualizar status");
      success(`Politica ${!policy.is_active ? "ativada" : "pausada"}!`);
      fetchPolicies();
    } catch (err: any) {
      error(err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    
    const payload = {
      ...formData,
      value: parseFloat(formData.value),
      valid_until: formData.valid_until || null,
    };

    try {
      let res;
      if (editingPolicy) {
        res = await fetch("/api/admin/commission-policies", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id: editingPolicy.id, ...payload }),
        });
      } else {
        res = await fetch("/api/admin/commission-policies", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao salvar");
      }

      success("Politica salva com sucesso!");
      setIsModalOpen(false);
      fetchPolicies();
    } catch (err: any) {
      error(err.message);
    }
  };

  return (
    <>
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <p className="text-sm text-gray-300">
            {policies.length} {policies.length === 1 ? "politica" : "politicas"} encontradas
          </p>
          <div className="flex gap-2">
             <Button
              size="sm"
              variant="primary" // Assuming primary looks better for Create
              className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-500/20"
              onClick={handleOpenCreate}
            >
              + Nova Politica
            </Button>
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
                  <th className="px-4 py-3">Aplica em</th>
                  <th className="px-4 py-3">Vigencia</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {policies.map((p) => (
                  <tr key={p.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">{p.name}</p>
                       {p.description && (
                         <p className="text-xs text-gray-400 mt-1 line-clamp-1">{p.description}</p>
                       )}
                    </td>
                    <td className="px-4 py-3 text-gray-200">
                      {p.type === "percentage" ? "Percentual" : "Fixo"} —{" "}
                      {formatPolicyValue(p.type, p.value)}
                    </td>
                    <td className="px-4 py-3 text-gray-200">
                      {p.applies_to === "all"
                        ? "Todos"
                        : p.applies_to === "weekdays"
                        ? "Somente uteis"
                        : "Finais/feriados"}
                    </td>
                    <td className="px-4 py-3 text-gray-200">
                      {new Date(p.valid_from).toLocaleDateString("pt-BR", { timeZone: "UTC" })}{" "}
                      {p.valid_until ? `- ${new Date(p.valid_until).toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : "• aberto"}
                    </td>
                    <td className="px-4 py-3">
                       <button
                        onClick={() => handleToggleStatus(p)}
                        className={`px-3 py-1 rounded-full border text-xs transition-all hover:scale-105 ${
                          p.is_active
                            ? "border-green-400 text-green-200 bg-green-400/10 hover:bg-green-400/20"
                            : "border-red-400 text-red-200 bg-red-400/10 hover:bg-red-400/20"
                        }`}
                      >
                        {p.is_active ? "Ativa" : "Inativa"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                       <button 
                         onClick={() => handleOpenEdit(p)}
                         className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-400/10 transition-colors"
                         title="Editar"
                       >
                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                       </button>
                       <button 
                         onClick={() => handleDelete(p.id)}
                         className="p-1.5 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors"
                         title="Excluir"
                       >
                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#121214] p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingPolicy ? "Editar Politica" : "Nova Politica"}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                 <div className="col-span-2">
                   <label className="text-xs uppercase text-gray-400">Nome</label>
                   <input
                     required
                     className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white focus:border-blue-500 outline-none"
                     value={formData.name}
                     onChange={e => setFormData({...formData, name: e.target.value})}
                     placeholder="Ex: Bonus de Natal"
                   />
                 </div>

                 <div>
                   <label className="text-xs uppercase text-gray-400">Tipo Valor</label>
                   <Select
                     options={[{value: 'percentage', label: 'Percentual (%)'}, {value: 'fixed', label: 'Fixo (R$)'}, {value: 'fixed_unit', label: 'Fixo Unidade'}]}
                     value={formData.type}
                     onChange={(e: any) => setFormData({...formData, type: e.target.value})}
                     className="py-2"
                   />
                 </div>

                 <div>
                    <label className="text-xs uppercase text-gray-400">Valor</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white focus:border-blue-500 outline-none"
                      value={formData.value}
                      onChange={e => setFormData({...formData, value: e.target.value})}
                      placeholder="Ex: 5.0"
                    />
                 </div>

                 <div>
                   <label className="text-xs uppercase text-gray-400">Aplica em</label>
                   <Select
                     options={[
                       {value: 'all', label: 'Todos os dias'},
                       {value: 'weekdays', label: 'Dias Uteis'}, 
                       {value: 'weekends_holidays', label: 'Fins de semana/Feriados'}
                     ]}
                     value={formData.applies_to}
                     onChange={(e: any) => setFormData({...formData, applies_to: e.target.value})}
                     className="py-2"
                   />
                 </div>

                 <div>
                    <label className="text-xs uppercase text-gray-400">Vigencia Inicio</label>
                    <input
                      required
                      type="date"
                      className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white focus:border-blue-500 outline-none"
                      value={formData.valid_from}
                      onChange={e => setFormData({...formData, valid_from: e.target.value})}
                    />
                 </div>
                 
                 <div>
                    <label className="text-xs uppercase text-gray-400">Vigencia Fim</label>
                    <input
                      type="date"
                      className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white focus:border-blue-500 outline-none"
                      value={formData.valid_until}
                      onChange={e => setFormData({...formData, valid_until: e.target.value})}
                    />
                 </div>

                 <div className="col-span-2">
                    <label className="text-xs uppercase text-gray-400">Descricao (Opcional)</label>
                    <textarea
                      rows={2}
                      className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white focus:border-blue-500 outline-none resize-none"
                      value={formData.description}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                    />
                 </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button variant="primary" type="submit" className="bg-blue-600 hover:bg-blue-500">
                  Salvar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
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
      if (!value) return null;
      const [y, m, d] = value.split("-").map(Number);
      // Cria data LOCAL 00:00:00
      return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    };
    const toEnd = (value: string) => {
      if (!value) return null;
      const [y, m, d] = value.split("-").map(Number);
      // Cria data LOCAL 23:59:59
      return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
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
                    {formatDateTime(comm.referenceDate)}
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

