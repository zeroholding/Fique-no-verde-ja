"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useRouter } from "next/navigation";

interface Cupom {
  id: string;
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: string | number;
  commission_percentage: string | number;
  max_uses: number | null;
  expires_at: string | null;
  is_active: boolean;
  current_uses: string | number;
  created_at: string;
  partner_slug: string | null;
}

export default function CuponsAdminPage() {
  const router = useRouter();
  const [cupons, setCupons] = useState<Cupom[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCupomId, setEditingCupomId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todos" | "ativos" | "inativos">("todos");

  // Form State
  const [newCode, setNewCode] = useState("");
  const [newType, setNewType] = useState<"percent"|"fixed">("percent");
  const [newValue, setNewValue] = useState("");
  const [newCommission, setNewCommission] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCupons();
  }, []);

  const fetchCupons = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/cupons");
      const data = await res.json();
      if (data.success) {
        setCupons(data.data);
      }
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const isEditing = !!editingCupomId;
      const url = isEditing ? `/api/admin/cupons/${editingCupomId}` : "/api/admin/cupons";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCode,
          type: newType,
          value: Number(newValue),
          commission_percentage: newCommission ? Number(newCommission) : 0,
          max_uses: newMaxUses ? Number(newMaxUses) : null,
          expires_at: newExpiresAt ? new Date(newExpiresAt).toISOString() : null,
          partner_slug: newSlug || null
        })
      });
      const data = await res.json();
      if (data.success) {
        closeModal();
        fetchCupons();
      } else {
        alert(data.error);
      }
    } catch (error) {
      console.error(error);
      alert(editingCupomId ? "Erro ao atualizar cupom" : "Erro ao criar cupom");
    }
    setSaving(false);
  };

  const openNewModal = () => {
    setEditingCupomId(null);
    setNewCode("");
    setNewType("percent");
    setNewValue("");
    setNewCommission("");
    setNewMaxUses("");
    setNewExpiresAt("");
    setNewSlug("");
    setIsModalOpen(true);
  };

  const openEditModal = (cupom: Cupom) => {
    setEditingCupomId(cupom.id);
    setNewCode(cupom.code);
    setNewType(cupom.discount_type);
    setNewValue(String(cupom.discount_value));
    setNewCommission(String(cupom.commission_percentage));
    setNewMaxUses(cupom.max_uses !== null ? String(cupom.max_uses) : "");
    setNewExpiresAt(cupom.expires_at ? new Date(cupom.expires_at).toISOString().split('T')[0] : "");
    setNewSlug(cupom.partner_slug || "");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCupomId(null);
  };

  const handleToggleStatus = async (cupom: Cupom) => {
    try {
      const res = await fetch(`/api/admin/cupons/${cupom.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: cupom.code, // required by the form parser in route, though ideally it should support partial
          type: cupom.discount_type,
          value: cupom.discount_value,
          is_active: !cupom.is_active
        })
      });
      const data = await res.json();
      if (data.success) {
         fetchCupons(); // Refresh the list
      } else {
         alert(data.error);
      }
    } catch (err) {
      alert("Erro ao alterar status do cupom");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esse cupom? Essa ação não pode ser desfeita.")) return;
    try {
      const res = await fetch(`/api/admin/cupons/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchCupons();
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert("Erro ao excluir cupom. Verifique sua conexão.");
    }
  };

  const copyLink = (cupom: Cupom) => {
    const slug = cupom.partner_slug || cupom.id;
    const url = `${window.location.origin}/cupom/${slug}`;
    navigator.clipboard.writeText(url);
    alert("Link do parceiro copiado!");
  };

  const filteredCupons = cupons.filter(c => {
    const matchesSearch = c.code.toLowerCase().includes(search.toLowerCase());
    if (filter === "ativos") return matchesSearch && c.is_active;
    if (filter === "inativos") return matchesSearch && !c.is_active;
    return matchesSearch;
  });

  return (
    <div className="p-4 sm:p-8 space-y-6 text-white min-h-screen">
      <div className="flex flex-col gap-2 mb-6">
        <p className="text-xs sm:text-sm uppercase tracking-widest text-emerald-500 font-semibold">
          Administração de Vendas
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold">Cupons de Desconto</h1>
        <p className="text-sm sm:text-base text-gray-400">
          Crie e gerencie cupons de desconto para acompanhamento de parceiros. Defina valores fixos em reais ou percentuais.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
           <div className="w-full sm:w-auto flex-1 max-w-md relative">
              <input 
                type="text"
                placeholder="Buscar por código do cupom..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3 border border-white/20 rounded-xl bg-black/30 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-shadow"
              />
              <svg className="w-5 h-5 absolute left-4 top-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
           </div>
           
           <div className="flex items-center gap-3 w-full sm:w-auto">
              {/* Filtros rápidos estilo botões toggle */}
              <div className="flex bg-black/40 border border-white/10 rounded-xl p-1 shrink-0 overflow-x-auto">
                <button 
                  onClick={() => setFilter("todos")}
                  className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filter === 'todos' ? 'bg-white/10 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                  Todos
                </button>
                <button 
                  onClick={() => setFilter("ativos")}
                  className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filter === 'ativos' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-gray-400 hover:text-white'}`}
                >
                  Ativos
                </button>
                <button 
                  onClick={() => setFilter("inativos")}
                  className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filter === 'inativos' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-gray-400 hover:text-white'}`}
                >
                  Inativos
                </button>
              </div>

              <button
                onClick={openNewModal}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3 rounded-xl flex items-center gap-2 font-semibold transition-colors shrink-0 whitespace-nowrap"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                <span className="hidden sm:inline">Novo Cupom</span>
              </button>
           </div>
        </div>

        <p className="text-sm text-gray-500 mb-6">{filteredCupons.length} cupons encontrados</p>

        {/* Grid de Cupons */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">
             <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
             Carregando cupons...
          </div>
        ) : filteredCupons.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
             <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>
             Nenhum cupom encontrado com os filtros selecionados.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredCupons.map(cupom => (
              <div key={cupom.id} className="bg-black/30 border border-white/10 rounded-2xl p-5 flex flex-col justify-between hover:border-emerald-500/40 transition-colors group relative overflow-hidden">
                {/* Efeito luminoso fraco no background */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors"></div>
                
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-white text-xl uppercase tracking-wider font-mono">{cupom.code}</h3>
                    <div className="flex flex-col items-end gap-2">
                       <button 
                         onClick={() => handleToggleStatus(cupom)}
                         title={cupom.is_active ? "Desativar cupom" : "Ativar cupom"}
                         className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider border transition-colors hover:opacity-80 ${cupom.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30' : 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-emerald-500/20 hover:text-emerald-400 hover:border-emerald-500/30'}`}>
                         {cupom.is_active ? 'Ativo' : 'Inativo'}
                       </button>
                    </div>
                  </div>
                  
                  <div className="inline-block bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg mb-4">
                     <p className="text-emerald-400 font-semibold text-sm">
                       {cupom.discount_type === 'percent' 
                         ? `${Number(cupom.discount_value).toFixed(0)}% de desconto`
                         : `R$ ${Number(cupom.discount_value).toFixed(2)} desconto`}
                     </p>
                  </div>
                  <div className="inline-block bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-lg mb-4 ml-2">
                     <p className="text-indigo-400 font-semibold text-sm">
                       {Number(cupom.commission_percentage).toFixed(0)}% repasse
                     </p>
                  </div>

                  <div className="space-y-2 mt-2">
                     <div className="flex justify-between text-sm text-gray-400 border-t border-white/5 pt-3">
                       <span>Total de Usos:</span>
                       <span className="font-semibold text-white">
                         {cupom.current_uses} <span className="text-gray-600 font-normal">/ {cupom.max_uses === null ? 'Ilimitado' : cupom.max_uses}</span>
                       </span>
                     </div>

                     {cupom.expires_at && (
                       <div className="flex justify-between text-sm text-gray-400">
                         <span>Validade:</span>
                         <span className="font-semibold text-red-300">
                           {format(new Date(cupom.expires_at), 'dd/MM/yyyy')}
                         </span>
                       </div>
                     )}
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-white/5 flex justify-between items-center relative z-10">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                    Criado: {format(new Date(cupom.created_at), 'dd/MM/yyyy')}
                  </span>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => router.push(`/dashboard/admin/cupons/${cupom.id}`)}
                      title="Painel Analítico"
                      className="text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center justify-center bg-indigo-500/10 w-8 h-8 rounded-lg hover:bg-indigo-500/20 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </button>
                    
                    <button 
                      onClick={() => copyLink(cupom)}
                      className="text-emerald-400 hover:text-emerald-300 text-sm font-medium flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1.5 rounded-lg hover:bg-emerald-500/20 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      {cupom.partner_slug ? `/${cupom.partner_slug}` : 'Link'}
                    </button>
                    <button 
                      onClick={() => openEditModal(cupom)}
                      title="Editar"
                      className="text-white hover:text-white flex items-center justify-center bg-white/5 w-8 h-8 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>

                    <button 
                      onClick={() => handleDelete(cupom.id)}
                      title="Excluir"
                      className="text-red-400 hover:text-red-300 flex items-center justify-center bg-red-500/10 w-8 h-8 rounded-lg hover:bg-red-500/20 transition-colors ml-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Criar Cupom */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#111111] border border-white/10 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
              <h2 className="text-xl font-bold text-white">{editingCupomId ? "Editar Cupom" : "Criar Novo Cupom"}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-white transition-colors bg-white/5 p-1 rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-xs uppercase text-gray-400 tracking-wider mb-2 font-semibold">Código do Cupom</label>
                <input 
                  type="text" 
                  required
                  value={newCode}
                  onChange={e => setNewCode(e.target.value.toUpperCase())}
                  placeholder="EX: NATAL20"
                  className="w-full px-4 py-3 border border-white/20 rounded-xl bg-black/50 text-white font-mono uppercase focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder-gray-600 shadow-inner"
                />
              </div>

              <div>
                <label className="block text-xs uppercase text-gray-400 tracking-wider mb-2 font-semibold">Tipo de Desconto</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    type="button"
                    onClick={() => setNewType('percent')}
                    className={`py-3 border rounded-xl flex flex-col items-center justify-center transition-all ${newType === 'percent' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'border-white/10 bg-black/30 text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}
                  >
                    <span className="text-2xl mb-1">%</span>
                    <span className="text-[11px] uppercase tracking-wider">Percentual</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => setNewType('fixed')}
                    className={`py-3 border rounded-xl flex flex-col items-center justify-center transition-all ${newType === 'fixed' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'border-white/10 bg-black/30 text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}
                  >
                    <span className="text-2xl mb-1">R$</span>
                    <span className="text-[11px] uppercase tracking-wider">Fixo</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase text-gray-400 tracking-wider mb-2 font-semibold">Valor do Desconto</label>
                <div className="relative">
                  <span className="absolute left-4 top-3.5 text-gray-500 font-semibold">{newType === 'percent' ? '%' : 'R$'}</span>
                  <input 
                    type="number" 
                    step="0.01"
                    required
                    value={newValue}
                    onChange={e => setNewValue(e.target.value)}
                    placeholder="10.00"
                    className="w-full pl-11 pr-4 py-3 border border-white/20 rounded-xl bg-black/50 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder-gray-600 shadow-inner"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase text-gray-400 tracking-wider mb-2 font-semibold">% de Repasse (Opcional)</label>
                <div className="relative">
                  <span className="absolute left-4 top-3.5 text-gray-500 font-semibold">%</span>
                  <input 
                    type="number" 
                    step="0.01"
                    value={newCommission}
                    onChange={e => setNewCommission(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-11 pr-4 py-3 border border-white/20 rounded-xl bg-black/50 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder-gray-600 shadow-inner"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase text-gray-400 tracking-wider mb-2 font-semibold">Máximo de Usos <span className="text-gray-600 font-normal lowercase tracking-normal pl-1">(opcional)</span></label>
                <input 
                  type="number" 
                  value={newMaxUses}
                  onChange={e => setNewMaxUses(e.target.value)}
                  placeholder="Deixe vazio para uso ilimitado"
                  className="w-full px-4 py-3 border border-white/20 rounded-xl bg-black/50 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder-gray-600 shadow-inner"
                />
              </div>

              <div>
                <label className="block text-xs uppercase text-gray-400 tracking-wider mb-2 font-semibold">Data de Expiração <span className="text-gray-600 font-normal lowercase tracking-normal pl-1">(opcional)</span></label>
                <input 
                  type="date" 
                  value={newExpiresAt}
                  onChange={e => setNewExpiresAt(e.target.value)}
                  className="w-full px-4 py-3 border border-white/20 rounded-xl bg-black/50 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-inner"
                  style={{ colorScheme: 'dark' }}
                />
              </div>

              <div>
                <label className="block text-xs uppercase text-gray-400 tracking-wider mb-2 font-semibold">Link Personalizado do Parceiro <span className="text-gray-600 font-normal lowercase tracking-normal pl-1">(opcional)</span></label>
                <div className="flex items-center gap-2 w-full border border-white/20 rounded-xl bg-black/50 overflow-hidden focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
                   <span className="text-gray-500 text-sm pl-4 shrink-0 select-none">.../cupom/</span>
                   <input 
                     type="text" 
                     value={newSlug}
                     onChange={e => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, ''))}
                     placeholder="ex: jhonny"
                     className="w-full pr-4 py-3 bg-transparent text-white focus:outline-none placeholder-gray-600"
                   />
                </div>
                <p className="text-xs text-gray-500 mt-1.5">Letras, números e hifens. Gera um link curto como: fiquenoverdeja.com.br/cupom/jhonny</p>
              </div>

              <div className="pt-6 border-t border-white/10 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={closeModal}
                  className="px-6 py-2.5 bg-transparent border border-white/20 text-gray-300 hover:bg-white/5 hover:text-white rounded-xl font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={saving}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium disabled:opacity-50 transition-colors shadow-lg shadow-emerald-600/20"
                >
                  {saving ? 'Salvando...' : editingCupomId ? 'Salvar Alterações' : 'Confirmar e Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
