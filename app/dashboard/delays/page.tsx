"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type DelayItem = {
  id: string;
  ml_user_id: string;
  product_name: string;
  shipping_mode: string;
  logistic_type: string;
  limit_date: string;
  shipped_date: string | null;
  delay_hours: number;
  delay_range: string;
  status: string;
};

type DelayKPIs = {
  totalSynced: number;
  totalDelayed: number;
  delayedPercentage: number;
  ranges: Record<string, number>;
};

// Componente para badge da faixa de atraso
function RangeBadge({ range }: { range: string }) {
  const map: Record<string, { label: string; color: string }> = {
    "no_delay": { label: "Sem Atraso", color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
    "same_day": { label: "Mesmo Dia (Fora do Horário)", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    "0-24h": { label: "Atraso até 24h", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
    "24-48h": { label: "Atraso 24h a 48h", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
    "48-72h": { label: "Atraso 48h a 72h", color: "bg-red-500/20 text-red-400 border-red-500/30" },
    "+72h": { label: "Mais de 72h", color: "bg-red-900/40 text-red-300 border-red-700/50 blink-slow" },
  };
  const d = map[range] || { label: range, color: "bg-gray-500/20 text-gray-400" };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${d.color}`}>
      {d.label}
    </span>
  );
}

export default function DelaysDashboard() {
  const [data, setData] = useState<DelayItem[]>([]);
  const [kpis, setKpis] = useState<DelayKPIs | null>(null);
  
  // State from User's Global Context (Simulated here since this module is standalone, but you would normally import `useContext(SellerContext)`)
  // We will fetch credentials to get available accounts.
  const [accounts, setAccounts] = useState<{ml_user_id: string, name: string}[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);

  // Filters
  const [onlyDelayed, setOnlyDelayed] = useState(true);
  const [delayRange, setDelayRange] = useState("all");
  const [sortParam, setSortParam] = useState("recent");
  
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Load Accounts
  useEffect(() => {
    fetch("/api/integrations/mercadolivre/status")
      .then(res => res.json())
      .then(json => {
         if (json.accounts) {
            setAccounts(json.accounts);
            if (json.accounts.length > 0) {
               setSelectedAccounts(json.accounts.map((a: any) => a.ml_user_id));
            }
         }
      })
      .catch(() => {});
  }, []);

  // Fetch Data
  const loadData = async () => {
    if (selectedAccounts.length === 0) return;
    setLoading(true);
    try {
      const url = `/api/integrations/mercadolivre/delays/list?accounts=${selectedAccounts.join(",")}&only_delayed=${onlyDelayed}&delay_range=${delayRange}&sort=${sortParam}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setKpis(json.kpis);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedAccounts, onlyDelayed, delayRange, sortParam]);

  // Sync Data
  const handleSync = async () => {
    if (selectedAccounts.length === 0) return;
    setSyncing(true);
    try {
      // Sync each account
      for (const account of selectedAccounts) {
         await fetch("/api/integrations/mercadolivre/delays/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ml_user_id: account })
         });
      }
      await loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  // Export Data
  const handleExport = () => {
    if (data.length === 0) return;
    
    // Group by account
    const grouped: Record<string, string[]> = {};
    data.forEach(item => {
       const accName = accounts.find(a => String(a.ml_user_id) === String(item.ml_user_id))?.name || item.ml_user_id;
       if (!grouped[accName]) grouped[accName] = [];
       grouped[accName].push(`${item.id}`);
    });

    let content = "";
    Object.keys(grouped).forEach(accName => {
       content += `[ CONTA: ${accName.toUpperCase()} ]\n`;
       content += grouped[accName].join("\n");
       content += "\n\n";
    });

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `atrasos_ml_${format(new Date(), "yyyy-MM-dd_HH-mm")}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 bg-[#0E0E10] min-h-screen text-gray-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
             Módulo de Atrasos ML
             <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-1 rounded-full border border-emerald-500/30">Análise Logística</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">Acompanhe e exporte infrações de envios fora do prazo.</p>
        </div>
        <button 
          onClick={handleSync} 
          disabled={syncing || selectedAccounts.length === 0}
          className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2 rounded-lg text-sm transition flex items-center gap-2 disabled:opacity-50"
        >
          {syncing ? (
             <div className="w-4 h-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          ) : (
             <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          )}
          {syncing ? "Sincronizando SLA..." : "Sincronizar Atualizações"}
        </button>
      </div>

      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/5 border border-white/10 p-5 rounded-xl">
             <p className="text-sm text-gray-400 mb-1">Vendas Sincronizadas (60d)</p>
             <p className="text-3xl font-bold text-white">{kpis.totalSynced}</p>
          </div>
          <div className="bg-[#591C1C]/20 border border-red-500/20 p-5 rounded-xl">
             <p className="text-sm text-red-300 mb-1">Qtd Atrasadas (Global)</p>
             <p className="text-3xl font-bold text-red-500">{kpis.totalDelayed}</p>
          </div>
          <div className="bg-[#1C2036]/50 border border-blue-500/20 p-5 rounded-xl">
             <p className="text-sm text-blue-300 mb-1">Taxa de Atraso (%)</p>
             <p className="text-3xl font-bold text-blue-400">{kpis.delayedPercentage.toFixed(2)}%</p>
          </div>
          <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex flex-col justify-center">
             <div className="flex justify-between items-center text-xs text-gray-300 border-b border-white/5 pb-1 mb-1">
                <span>Passou até 24h:</span>
                <span className="font-bold text-yellow-400">{kpis.ranges["same_day"] + kpis.ranges["0-24h"]}</span>
             </div>
             <div className="flex justify-between items-center text-xs text-gray-300 border-b border-white/5 pb-1 mb-1">
                <span>Passou até 48h:</span>
                <span className="font-bold text-orange-400">{kpis.ranges["24-48h"]}</span>
             </div>
             <div className="flex justify-between items-center text-xs text-gray-300">
                <span>Passou &gt;48h:</span>
                <span className="font-bold text-red-500">{kpis.ranges["48-72h"] + kpis.ranges["+72h"]}</span>
             </div>
          </div>
        </div>
      )}

      {/* Control Bar */}
      <div className="bg-black/30 border border-white/5 rounded-xl p-4 flex flex-wrap gap-4 items-center justify-between">
         <div className="flex flex-wrap gap-3">
            <select 
               className="bg-white/5 border border-white/10 text-gray-200 text-sm rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
               value={onlyDelayed ? "delayed" : "all"}
               onChange={e => setOnlyDelayed(e.target.value === "delayed")}
            >
               <option value="delayed">Mostrar Somente Atrasados</option>
               <option value="all">Mostrar Todas as Vendas</option>
            </select>

            <select 
               className="bg-white/5 border border-white/10 text-gray-200 text-sm rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
               value={delayRange}
               onChange={e => setDelayRange(e.target.value)}
               disabled={!onlyDelayed}
            >
               <option value="all">Filtro: Todas as Faixas</option>
               <option value="same_day">Mesmo dia (fora de hora)</option>
               <option value="0-24h">Até 24h depois</option>
               <option value="24-48h">Entre 24h e 48h</option>
               <option value="48-72h">Entre 48h e 72h</option>
               <option value="+72h">Mais de 72h (Crítico)</option>
            </select>

            <select 
               className="bg-white/5 border border-white/10 text-gray-200 text-sm rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
               value={sortParam}
               onChange={e => setSortParam(e.target.value)}
            >
               <option value="recent">Ordenar: Data Prazo Mais Recente</option>
               <option value="max_delay">Ordenar: Maior Atraso (Horas)</option>
               <option value="account">Ordenar: Por Conta</option>
            </select>
         </div>

         <button 
           onClick={handleExport}
           disabled={data.length === 0}
           className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
         >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
            Exportar IDs para chamado
         </button>
      </div>

      {/* Table */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-black/40 text-gray-400 border-b border-white/10">
                <th className="px-4 py-3 font-semibold whitespace-nowrap">ID Venda</th>
                <th className="px-4 py-3 font-semibold">Conta</th>
                <th className="px-4 py-3 font-semibold">Produto</th>
                <th className="px-4 py-3 font-semibold">Logística</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Prazo Limite</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Enviado Em</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Faixa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                     <div className="flex justify-center mb-2"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div></div>
                     Carregando base logística...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">Nenhuma venda encontrada para estes filtros. Ufa!</td>
                </tr>
              ) : (
                data.map((item) => (
                  <tr key={item.id} className="hover:bg-white/5 transition group">
                    <td className="px-4 py-3 text-white font-mono">{item.id}</td>
                    <td className="px-4 py-3">
                       <span className="bg-white/10 text-gray-300 px-2 py-0.5 rounded text-xs border border-white/5">
                          {accounts.find(a => String(a.ml_user_id) === String(item.ml_user_id))?.name || item.ml_user_id}
                       </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 truncate max-w-[200px]" title={item.product_name}>
                      {item.product_name}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {item.shipping_mode} {(item.logistic_type && item.logistic_type !== 'unknown') ? `(${item.logistic_type})` : ''}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-400 text-xs">
                      {item.limit_date ? format(new Date(item.limit_date), "dd/MM/yy HH:mm", { locale: ptBR }) : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                       {item.shipped_date ? (
                         <span className="text-gray-300 text-xs">
                            {format(new Date(item.shipped_date), "dd/MM/yy HH:mm", { locale: ptBR })}
                         </span>
                       ) : (
                         <span className="text-yellow-600 text-xs italic">Aguardando Envio</span>
                       )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                       <div className="flex items-center gap-2">
                         <RangeBadge range={item.delay_range} />
                         {item.delay_hours > 0 && <span className="text-xs text-red-500 font-mono">+{Math.floor(item.delay_hours)}h</span>}
                       </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
