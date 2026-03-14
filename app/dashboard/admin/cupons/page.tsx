"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Cupom {
  id: string;
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: string | number;
  max_uses: number | null;
  expires_at: string | null;
  is_active: boolean;
  current_uses: string | number;
  created_at: string;
}

export default function CuponsAdminPage() {
  const [cupons, setCupons] = useState<Cupom[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todos" | "ativos" | "inativos">("todos");

  // Form State
  const [newCode, setNewCode] = useState("");
  const [newType, setNewType] = useState<'percent'|'fixed'>("percent");
  const [newValue, setNewValue] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");
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

  const handleCreateMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/cupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCode,
          type: newType,
          value: Number(newValue),
          max_uses: newMaxUses ? Number(newMaxUses) : null,
          expires_at: newExpiresAt ? new Date(newExpiresAt).toISOString() : null
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        setNewCode("");
        setNewType("percent");
        setNewValue("");
        setNewMaxUses("");
        setNewExpiresAt("");
        fetchCupons();
      } else {
        alert(data.error);
      }
    } catch (error) {
      console.error(error);
      alert("Erro ao criar cupom");
    }
    setSaving(false);
  };

  const copyLink = (id: string) => {
    const url = `${window.location.origin}/parceiro/cupom/${id}`;
    navigator.clipboard.writeText(url);
    alert("Link do parceiro copiado para área de transferência!");
  };

  const filteredCupons = cupons.filter(c => {
    const matchesSearch = c.code.toLowerCase().includes(search.toLowerCase());
    if (filter === "ativos") return matchesSearch && c.is_active;
    if (filter === "inativos") return matchesSearch && !c.is_active;
    return matchesSearch;
  });

  return (
    <div className="p-8 pb-32">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Cupons de Desconto</h1>
            <p className="text-gray-500 mt-2">
              Crie e gerencie cupons de desconto para compra de créditos. Defina valores fixos em reais ou percentuais.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-[#2A3756] hover:bg-slate-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-medium"
          >
            <span className="text-lg">+</span> Criar Cupom
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[250px] max-w-sm">
            <input 
              type="text"
              placeholder="Buscar por código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-[#383C47] rounded-lg bg-white dark:bg-[#1C212A] text-gray-900 dark:text-white"
            />
            <svg className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div className="flex bg-white dark:bg-[#1C212A] border border-gray-200 dark:border-[#383C47] rounded-lg p-1">
            <button 
              onClick={() => setFilter("todos")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === 'todos' ? 'bg-[#2A3756] text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2A3756]'}`}
            >
              Todos
            </button>
            <button 
              onClick={() => setFilter("ativos")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === 'ativos' ? 'bg-[#2A3756] text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2A3756]'}`}
            >
              Ativos
            </button>
            <button 
              onClick={() => setFilter("inativos")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === 'inativos' ? 'bg-[#2A3756] text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2A3756]'}`}
            >
              Inativos
            </button>
          </div>
        </div>

        <p className="text-sm text-gray-500">{filteredCupons.length} cupons no total</p>

        {/* Grid de Cupons */}
        {loading ? (
          <div className="text-center py-10">Calculando estatísticas...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCupons.map(cupom => (
              <div key={cupom.id} className="bg-white dark:bg-[#1C212A] border border-gray-200 dark:border-[#383C47] rounded-xl p-6 flex flex-col justify-between hover:shadow-lg transition-shadow">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-bold text-gray-900 dark:text-white text-xl uppercase tracking-wider">{cupom.code}</h3>
                    <span className={`px-2 py-1 text-xs font-medium rounded ${cupom.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                      {cupom.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  
                  <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                    {cupom.discount_type === 'percent' 
                      ? `${Number(cupom.discount_value).toFixed(2)}% de desconto`
                      : `R$ ${Number(cupom.discount_value).toFixed(2)} de desconto`}
                  </p>

                  <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-[#383C47] pt-4 mt-2">
                    <span>Usos:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {cupom.current_uses} / {cupom.max_uses === null ? '∞' : cupom.max_uses}
                    </span>
                  </div>

                  {cupom.expires_at && (
                    <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mt-2">
                      <span>Expira em:</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {format(new Date(cupom.expires_at), 'dd/MM/yyyy')}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-between items-end">
                  <span className="text-xs text-gray-400">
                    Criado em {format(new Date(cupom.created_at), 'dd/MM/yyyy')}
                  </span>
                  
                  <button 
                    onClick={() => copyLink(cupom.id)}
                    className="text-[#2A3756] dark:text-[#5B8EFF] text-sm font-medium hover:underline flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Link Parceiro
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Criar Cupom */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-[#202736] w-full max-w-md rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-[#383C47]">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Criar Novo Cupom</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <form onSubmit={handleCreateMenu} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Código do Cupom</label>
                <input 
                  type="text" 
                  required
                  value={newCode}
                  onChange={e => setNewCode(e.target.value.toUpperCase())}
                  placeholder="EX: DESCONTO10"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-[#383C47] rounded-lg bg-transparent text-gray-900 dark:text-white font-mono uppercase focus:ring-2 focus:ring-[#2A3756]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de Desconto</label>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    type="button"
                    onClick={() => setNewType('percent')}
                    className={`py-3 border rounded-lg flex flex-col items-center justify-center transition-colors ${newType === 'percent' ? 'border-[#2A3756] bg-blue-50 dark:bg-[#2A3756]/20 text-[#2A3756] dark:text-[#5B8EFF] font-bold' : 'border-gray-200 dark:border-[#383C47] text-gray-500'}`}
                  >
                    <span className="text-xl">%</span>
                    <span className="text-xs mt-1 font-medium">Percentual</span>
                  </button>
                  <button 
                    type="button"
                    onClick={() => setNewType('fixed')}
                    className={`py-3 border rounded-lg flex flex-col items-center justify-center transition-colors ${newType === 'fixed' ? 'border-[#2A3756] bg-blue-50 dark:bg-[#2A3756]/20 text-[#2A3756] dark:text-[#5B8EFF] font-bold' : 'border-gray-200 dark:border-[#383C47] text-gray-500'}`}
                  >
                    <span className="text-xl">R$</span>
                    <span className="text-xs mt-1 font-medium">Fixo</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor do Desconto</label>
                <div className="relative">
                  <span className="absolute left-4 top-2.5 text-gray-500">{newType === 'percent' ? '%' : 'R$'}</span>
                  <input 
                    type="number" 
                    step="0.01"
                    required
                    value={newValue}
                    onChange={e => setNewValue(e.target.value)}
                    placeholder="10"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-[#383C47] rounded-lg bg-transparent text-gray-900 dark:text-white focus:ring-2 focus:ring-[#2A3756]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Máximo de Usos <span className="text-gray-400 text-xs font-normal">(opcional)</span></label>
                <input 
                  type="number" 
                  value={newMaxUses}
                  onChange={e => setNewMaxUses(e.target.value)}
                  placeholder="Deixe vazio para ilimitado"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-[#383C47] rounded-lg bg-transparent text-gray-900 dark:text-white focus:ring-2 focus:ring-[#2A3756]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data de Expiração <span className="text-gray-400 text-xs font-normal">(opcional)</span></label>
                <input 
                  type="date" 
                  value={newExpiresAt}
                  onChange={e => setNewExpiresAt(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-[#383C47] rounded-lg bg-transparent text-gray-900 dark:text-white focus:ring-2 focus:ring-[#2A3756]"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#383C47] rounded-lg font-medium"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={saving}
                  className="px-5 py-2 bg-[#2A3756] hover:bg-slate-700 text-white rounded-lg font-medium disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Criar Cupom'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
