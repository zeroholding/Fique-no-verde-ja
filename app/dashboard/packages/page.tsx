"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/Button";

type PackageSummary = {
  clientId: string;
  clientName: string;
  balanceQuantityCurrent: number;
  totalQuantityAcquired: number;
  totalQuantityConsumed: number;
  balanceCurrent: number;
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

export default function PackagesIndexPage() {
  const { error, success } = useToast();
  const [summaries, setSummaries] = useState<PackageSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingLinkFor, setGeneratingLinkFor] = useState<string | null>(null);
  const [generatedLinks, setGeneratedLinks] = useState<Record<string, string>>({});

  // [NEW] Edit State
  const [editingPackage, setEditingPackage] = useState<PackageSummary | null>(null);
  const [editForm, setEditForm] = useState({ balance: "", price: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  // [NEW] Show/hide zero-balance packages (hidden by default)
  const [showZeroBalance, setShowZeroBalance] = useState(false);

  const fetchSummaries = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setLoading(true);
    try {
      // Reaproveita o endpoint de extrato, sem filtros, pegando apenas summary
      const res = await fetch("/api/packages/statement", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao carregar pacotes");
      }
      setSummaries((data.summary as PackageSummary[]) || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar pacotes";
      error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummaries();
  }, []);

  const totalSaldoQtde = useMemo(
    () => summaries.reduce((acc, s) => acc + (s.balanceQuantityCurrent ?? 0), 0),
    [summaries]
  );
  
  const totalSaldoFinanceiro = useMemo(
     () => summaries.reduce((acc, s) => acc + (s.balanceCurrent ?? 0), 0),
     [summaries]
  );
  
  const globalAveragePrice = useMemo(() => {
      if (totalSaldoQtde <= 0) return 0;
      return totalSaldoFinanceiro / totalSaldoQtde;
  }, [totalSaldoFinanceiro, totalSaldoQtde]);

  // [NEW] Filter out zero-balance packages unless toggled
  const zeroCount = useMemo(() => summaries.filter(s => (s.balanceQuantityCurrent ?? 0) <= 0).length, [summaries]);
  const visibleSummaries = useMemo(
    () => showZeroBalance ? summaries : summaries.filter(s => (s.balanceQuantityCurrent ?? 0) > 0),
    [summaries, showZeroBalance]
  );

  const handleGenerateShareLink = async (clientId: string) => {
    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setGeneratingLinkFor(clientId);
    try {
      const res = await fetch("/api/packages/public-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ clientId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao gerar link do extrato");
      }

      const link = data.url as string;
      setGeneratedLinks((prev) => ({ ...prev, [clientId]: link }));

      const canCopy = typeof navigator !== "undefined" && !!navigator.clipboard;
      if (canCopy && link) {
        await navigator.clipboard.writeText(link);
        success("Link copiado para a area de transferencia");
      } else {
        success("Link gerado. Copie e envie para o responsavel.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao gerar link do extrato";
      error(msg);
    } finally {
      setGeneratingLinkFor(null);
    }
  };

  const handleEditClick = (pkg: PackageSummary) => {
      const balance = pkg.balanceCurrent ?? 0;
      const qty = pkg.balanceQuantityCurrent ?? 0;
      // Because balanceCurrent is now derived from unit_price * quantity in the API fix,
      // we can calculate unit_price safely.
      const avg = qty !== 0 ? balance / qty : 0;

      setEditingPackage(pkg);
      setEditForm({
          balance: String(pkg.balanceQuantityCurrent ?? 0),
          price: avg !== 0 ? Math.abs(avg).toFixed(2) : "0.00"
      });
  };

  const handleSaveEdit = async () => {
      if (!editingPackage) return;
      
      setSavingEdit(true);
      try {
          const token = localStorage.getItem("token");
          if (!token) throw new Error("Sessão expirada");

          const res = await fetch("/api/packages/update", {
              method: "POST",
              headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({
                  clientId: editingPackage.clientId,
                  newBalance: Number(editForm.balance),
                  newUnitPrice: Number(editForm.price)
              })
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Erro ao atualizar pacote");

          success("Pacote atualizado com sucesso!");
          setEditingPackage(null);
          // Refresh list to show new values
          fetchSummaries(); 
      } catch (err: any) {
          error(err.message || "Erro ao salvar");
      } finally {
          setSavingEdit(false);
      }
  };

  return (
    <div className="px-4 py-6 sm:p-8 space-y-6 text-white overflow-x-hidden">
      <div className="flex flex-col gap-2">
        <p className="text-xs sm:text-sm uppercase tracking-widest text-gray-400">Pacotes</p>
        <h1 className="text-2xl sm:text-3xl font-semibold">Contas de Pacotes</h1>
        <p className="text-sm sm:text-base text-gray-300">
          Visão geral por cliente parceiro: saldo de créditos, adquiridos/consumidos e acesso rápido ao extrato.
        </p>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
            <div>
              <p className="text-sm text-gray-400">Saldo total (qtde)</p>
              <p className="text-2xl font-bold text-emerald-300">{totalSaldoQtde}</p>
            </div>
            {/* [NEW] Global Average Price Display */}
            <div>
               <p className="text-sm text-gray-400">Média Global / Un</p>
               <p className="text-2xl font-bold text-blue-300">
                  {globalAveragePrice > 0 ? formatCurrency(globalAveragePrice) : "-"}
               </p>
            </div>
        </div>
        <div className="flex gap-2">
          {zeroCount > 0 && (
            <button
              onClick={() => setShowZeroBalance(prev => !prev)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-all border ${
                showZeroBalance
                  ? "bg-yellow-500/20 border-yellow-500/40 text-yellow-200 hover:bg-yellow-500/30"
                  : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              {showZeroBalance ? `Ocultar zerados (${zeroCount})` : `Mostrar zerados (${zeroCount})`}
            </button>
          )}
          <Button size="sm" variant="secondary" className="rounded-xl" onClick={fetchSummaries} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </Button>
        </div>

      </div>

      {loading ? (
        <div className="px-4 sm:px-6 py-10 text-center text-gray-300">Carregando...</div>
      ) : visibleSummaries.length === 0 && !showZeroBalance ? (
        <div className="px-4 sm:px-6 py-10 text-center text-gray-400">
          Todos os pacotes têm saldo zero.{" "}
          <button onClick={() => setShowZeroBalance(true)} className="underline text-yellow-300 hover:text-yellow-200 transition">
            Clique aqui para exibi-los.
          </button>
        </div>
      ) : visibleSummaries.length === 0 ? (
        <div className="px-4 sm:px-6 py-10 text-center text-gray-400">Nenhum cliente parceiro com pacotes.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleSummaries.map((s) => (

            <div
              key={s.clientId}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-2 hover:border-white/20 transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Cliente parceiro</p>
                  <p className="text-lg font-semibold text-white">{s.clientName}</p>
                </div>
                {/* [NEW] Edit Button */}
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {s.lastOperation ? formatDateTime(s.lastOperation) : "Sem movimento"}
                    </span>
                    <button 
                        onClick={() => handleEditClick(s)}
                        className="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition"
                        title="Editar Pacote Manualmente"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                </div>
              </div>
              
              {/* [NEW] Average Unit Price for this Carrier */}
              {(() => {
                 const balance = s.balanceCurrent ?? 0;
                 const qty = s.balanceQuantityCurrent ?? 0;
                 // Use summary values, which are now correctly fetched from DB (via statement/route.ts update)
                 const avg = qty !== 0 ? balance / qty : 0;
                 
                 return (
                    <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 w-fit">
                       <span className="text-xs uppercase text-blue-200 font-bold">Valor Médio Uni:</span>
                       <span className="text-sm font-mono text-white">{avg !== 0 ? formatCurrency(Math.abs(avg)) : "-"}</span>
                    </div>
                 );
              })()}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className={`rounded-lg border p-3 ${
                  (s.balanceQuantityCurrent ?? 0) < 0 
                    ? "bg-red-500/10 border-red-500/20" 
                    : (s.balanceQuantityCurrent ?? 0) === 0 
                      ? "bg-yellow-500/10 border-yellow-500/20" 
                      : "bg-emerald-500/10 border-emerald-500/20"
                }`}>
                  <p className="text-xs text-gray-300">Saldo (qtde)</p>
                  <p className={`text-xl font-bold ${
                    (s.balanceQuantityCurrent ?? 0) < 0 
                      ? "text-red-400" 
                      : (s.balanceQuantityCurrent ?? 0) === 0 
                        ? "text-yellow-400" 
                        : "text-emerald-200"
                  }`}>
                    {s.balanceQuantityCurrent ?? 0}
                  </p>
                </div>
                <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                  <p className="text-xs text-gray-300">Saldo financeiro</p>
                  <p className="text-lg font-semibold text-white">{formatCurrency(s.balanceCurrent ?? 0)}</p>
                </div>
              </div>
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Link
                    href={`/dashboard/packages/statement?clientId=${s.clientId}`}
                    className="inline-flex items-center justify-center rounded-xl bg-blue-500/20 border border-blue-500/30 px-4 py-2 text-sm font-medium text-blue-100 hover:bg-blue-500/30 transition"
                  >
                    Ver extrato
                  </Link>
                  <Button
                    size="sm"
                    className="w-full rounded-xl"
                    onClick={() => handleGenerateShareLink(s.clientId)}
                    disabled={generatingLinkFor === s.clientId}
                  >
                    {generatingLinkFor === s.clientId ? "Gerando link..." : "Gerar link compartilhavel"}
                  </Button>
                </div>
                {generatedLinks[s.clientId] && (
                  <div className="text-xs text-blue-100 bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 break-all">
                    {generatedLinks[s.clientId]}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* [NEW] Edit Modal */}
      {editingPackage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
              <div className="w-full max-w-md bg-[#1c1c1c] border border-white/10 rounded-2xl p-6 shadow-2xl">
                  <h2 className="text-xl font-bold mb-4">Editar Pacote Manualmente</h2>
                  <p className="text-sm text-gray-400 mb-6">
                      Atenção: Esta ação altera diretamente o saldo e preço atual do pacote no banco de dados. 
                      O histórico passado não será afetado.
                  </p>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="text-xs text-gray-300 uppercase block mb-1">Cliente</label>
                          <input 
                              type="text" 
                              value={editingPackage.clientName} 
                              disabled 
                              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-gray-400 cursor-not-allowed"
                          />
                      </div>
                      
                      <div>
                          <label className="text-xs text-gray-300 uppercase block mb-1">Novo Saldo (Quantidade)</label>
                          <input 
                              type="number" 
                              value={editForm.balance} 
                              onChange={e => setEditForm(prev => ({ ...prev, balance: e.target.value }))}
                              className="w-full bg-black/30 border border-white/20 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none"
                          />
                      </div>

                      <div>
                          <label className="text-xs text-gray-300 uppercase block mb-1">Novo Preço Unitário (R$)</label>
                          <input 
                              type="number" 
                              step="0.01"
                              value={editForm.price} 
                              onChange={e => setEditForm(prev => ({ ...prev, price: e.target.value }))}
                              className="w-full bg-black/30 border border-white/20 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none"
                          />
                      </div>
                  </div>

                  <div className="flex gap-3 mt-8">
                      <Button 
                          variant="secondary" 
                          className="flex-1" 
                          onClick={() => setEditingPackage(null)}
                          disabled={savingEdit}
                      >
                          Cancelar
                      </Button>
                      <Button 
                          className="flex-1 bg-blue-600 hover:bg-blue-500" 
                          onClick={handleSaveEdit}
                          disabled={savingEdit}
                      >
                          {savingEdit ? "Salvando..." : "Salvar Alterações"}
                      </Button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}
