"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useParams, useRouter } from "next/navigation";
type AdminCouponData = {
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  currentUses: number;
  maxUses: number | null;
  totalSaved: number;
  isActive: boolean;
  expiresAt: string | null;
  history: Array<{
    id: string;
    saleDate: string;
    discountAmount: number;
    clientName: string;
    services: string;
    quantity: number;
    grossValue: number;
    commissionValue: number;
  }>;
};

export default function AdminCouponDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [data, setData] = useState<AdminCouponData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  // Serviços são extraídos automaticamente do histórico retornado em tempo real
  const availableServices = data?.history
    ? [...new Set(data.history.map(h => h.services).filter(s => s && s !== "-"))]
    : [];

  // Histórico filtrado localmente por serviço
  const filteredHistory = data?.history?.filter(item => {
    if (!serviceFilter) return true;
    return item.services?.toLowerCase().includes(serviceFilter.toLowerCase());
  }) || [];

  useEffect(() => {
    const fetchCouponData = async () => {
      try {
        setLoading(true);
        const paramsStr = new URLSearchParams();
        if (startDate) paramsStr.set("startDate", startDate);
        if (endDate) paramsStr.set("endDate", endDate);
        // Filtro de serviço agora é feito no frontend para evitar erros de UUID no banco

        // API Interna (Requer os Cookies)
        const res = await fetch(`/api/admin/cupons/${id}?${paramsStr.toString()}`);
        const json = await res.json();
        
        if (res.ok && json.success) {
          setData(json.data);
          setError(null);
        } else {
          setError(json.error || "Cupom não encontrado ou indisponível.");
        }
      } catch (err) {
        setError("Erro de conexão ao buscar dados analíticos do cupom.");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchCouponData();
    }
  }, [id, startDate, endDate]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <div className="p-4 sm:p-8 space-y-2 text-white min-h-screen font-sans selection:bg-emerald-500/30">
        <div className="flex flex-col relative">
            <div className="mb-8 flex items-center gap-4">
              <button 
                onClick={() => router.push('/dashboard/admin/cupons')}
                className="bg-white/5 border border-white/10 hover:bg-white/10 text-gray-400 hover:text-white p-2.5 rounded-xl transition-colors"
                title="Voltar"
              >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              </button>
              <div>
                  <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard Analítico de Cupom</h1>
                  <p className="text-gray-400 mt-1">Visão completa, irrestrita e estatística da performance do código</p>
              </div>
            </div>

            {loading ? (
                <div className="min-h-[400px] flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-gray-400 animate-pulse">Cruzando dados de vendas...</p>
                    </div>
                </div>
            ) : error || !data ? (
                <div className="min-h-[400px] flex items-center justify-center p-4">
                    <div className="max-w-md w-full bg-red-500/10 border border-red-500/20 rounded-2xl p-8 text-center space-y-4 shadow-2xl shadow-red-500/10">
                        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-2 text-red-500">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold text-white">Oops!</h1>
                        <p className="text-red-300">{error}</p>
                    </div>
                </div>
            ) : (
                <>
                    {/* Header Identidade */}
                    <div className="flex flex-wrap items-center gap-4 mb-8">
                        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                            <span className="text-emerald-400 bg-emerald-400/10 px-4 py-1.5 rounded-lg border border-emerald-400/20 font-mono shadow-lg shadow-emerald-500/20">{data.code}</span>
                        </h2>
                        
                        <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/10">
                            <div className={`w-2.5 h-2.5 rounded-full ${data.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                            <span className="text-sm font-medium text-gray-300">
                            {data.isActive ? 'Ativo e Operante' : 'Inativo ou Expirado'}
                            </span>
                        </div>
                        
                        <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/10">
                            <span className="text-sm font-medium text-gray-300">
                            Desconto Real: <strong className="text-white bg-white/10 px-2 py-0.5 rounded">{data.discountType === 'percent' ? `${data.discountValue}%` : formatCurrency(data.discountValue)}</strong>
                            </span>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 mb-12">
                        {/* Usos */}
                        <div className="bg-gradient-to-b from-white/10 to-white/5 rounded-3xl p-6 border border-white/10">
                            <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4 text-blue-400">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                            </div>
                            <h3 className="text-gray-400 text-sm font-medium mb-1 uppercase tracking-wider">Usos Convertidos</h3>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-bold text-white">{data.currentUses}</span>
                                {data.maxUses && <span className="text-gray-500 text-sm">/ {data.maxUses} limite global</span>}
                            </div>
                        </div>

                        {/* Receita da Empresa */}
                        <div className="bg-gradient-to-b from-emerald-900/40 to-emerald-900/10 rounded-3xl p-6 border border-emerald-500/20 lg:col-span-2">
                            <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-4 text-emerald-400">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <h3 className="text-emerald-400/80 text-sm font-medium mb-1 uppercase tracking-wider">Descontos Abatidos x Receita (Custo de Vendas)</h3>
                            <div className="flex flex-wrap items-baseline gap-2">
                                <span className="text-3xl sm:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-emerald-100">{formatCurrency(data.totalSaved)}</span>
                                <span className="text-emerald-500/80 font-medium">investidos em cashback ao cliente</span>
                            </div>
                        </div>
                    </div>

                    {/* Histórico Analítico Tabela */}
                    <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                        <div className="px-6 py-5 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-semibold text-white">Relatório Completo de Transações</h2>
                                <span className="text-xs text-gray-400 mt-1 block">Rastreabilidade End-to-End sem filtros de LGPD aplicados</span>
                            </div>
                            
                            <div className="flex flex-wrap gap-2">
                                <input 
                                    type="date"
                                    value={startDate}
                                    onChange={e => setStartDate(e.target.value)}
                                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                                />
                                <input 
                                    type="date"
                                    value={endDate}
                                    onChange={e => setEndDate(e.target.value)}
                                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                                />
                                <select
                                    value={serviceFilter}
                                    onChange={e => setServiceFilter(e.target.value)}
                                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                                >
                                    <option value="">Todos os Serviços</option>
                                    {availableServices.map((svc, i) => (
                                        <option key={i} value={svc}>{svc}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="p-0 sm:p-2">
                            {filteredHistory.length === 0 ? (
                                <div className="text-center py-16 px-4">
                                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-500">
                                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                    <p className="text-gray-400">Nenhum uso registrado neste filtro.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-white/5 overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[800px]">
                                        <thead>
                                            <tr className="bg-black/20 text-gray-400 text-xs uppercase tracking-wider">
                                                <th className="px-6 py-4 font-semibold">Data da Venda</th>
                                                <th className="px-6 py-4 font-semibold">Cliente Final</th>
                                                <th className="px-6 py-4 font-semibold max-w-[200px]">Serviços (Carrinho)</th>
                                                <th className="px-6 py-4 font-semibold text-center">Qtde</th>
                                                <th className="px-6 py-4 font-semibold text-right">Valor Bruto</th>
                                                <th className="px-6 py-4 font-semibold text-right text-emerald-400">Cupom</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {filteredHistory.map((item, idx) => (
                                                <tr key={item.id || idx} className="hover:bg-white/5 transition-colors group">
                                                    <td className="px-6 py-4">
                                                        <p className="text-white font-medium text-sm">
                                                            {format(new Date(item.saleDate), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                                                        </p>
                                                        <p className="text-xs text-gray-500">
                                                            {format(new Date(item.saleDate), "HH:mm")}
                                                        </p>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-sm font-medium text-white">
                                                            {item.clientName}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-gray-400 max-w-[200px] truncate" title={item.services}>
                                                        {item.services}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className="bg-white/5 px-2 py-1 rounded text-xs font-mono text-gray-300 border border-white/10">
                                                            {item.quantity}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <span className="text-gray-300 font-medium">{formatCurrency(item.grossValue)}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-1 rounded inline-block">
                                                            -{formatCurrency(item.discountAmount)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    </div>
  );
}
