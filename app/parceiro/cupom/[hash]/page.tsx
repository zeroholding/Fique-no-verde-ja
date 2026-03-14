"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type CouponData = {
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
  }>;
};

export default function ParceiroCupomPage({
  params,
}: {
  params: { hash: string };
}) {
  const [data, setData] = useState<CouponData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCouponData = async () => {
      try {
        const res = await fetch(`/api/parceiros/cupons/${params.hash}`);
        const json = await res.json();
        
        if (res.ok && json.success) {
          setData(json.data);
        } else {
          setError(json.error || "Cupom não encontrado ou indisponível.");
        }
      } catch (err) {
        setError("Erro de conexão ao buscar dados do cupom.");
      } finally {
        setLoading(false);
      }
    };

    fetchCouponData();
  }, [params.hash]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400 animate-pulse">Carregando estatísticas...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
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
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-100 flex flex-col font-sans selection:bg-emerald-500/30">
      {/* Header Banner */}
      <div className="h-48 w-full bg-gradient-to-br from-emerald-900 via-[#0a0a0a] to-[#0a0a0a] absolute top-0 left-0 z-0 opacity-40"></div>
      
      <main className="flex-1 w-full max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 relative z-10 pt-12 sm:pt-20">
        
        {/* Branding/Header */}
        <div className="mb-10 text-center sm:text-left">
          <p className="text-emerald-500 font-semibold tracking-wider text-sm uppercase mb-2">Painel do Parceiro</p>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight flex items-center justify-center sm:justify-start gap-3 flex-wrap">
            Cupom <span className="text-emerald-400 bg-emerald-400/10 px-4 py-1 rounded-xl border border-emerald-400/20 font-mono inline-block mt-2 sm:mt-0 shadow-lg shadow-emerald-500/20">{data.code}</span>
          </h1>
          <p className="text-gray-400 mt-4 max-w-xl mx-auto sm:mx-0">
            Acompanhe em tempo real o desempenho do seu cupom de desconto. Compartilhe seu código com sua audiência para gerar mais vendas!
          </p>
        </div>

        {/* Status indicator */}
        <div className="flex gap-4 mb-8 flex-wrap justify-center sm:justify-start">
          <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/10 backdrop-blur">
            <div className={`w-2.5 h-2.5 rounded-full ${data.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-sm font-medium text-gray-300">
              Status: <span className={data.isActive ? 'text-emerald-400' : 'text-red-400'}>{data.isActive ? 'Ativo e Operante' : 'Inativo ou Expirado'}</span>
            </span>
          </div>
          
          <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/10 backdrop-blur">
            <span className="text-sm font-medium text-gray-300">
              Desconto OFERECIDO: <strong className="text-white bg-white/10 px-2 py-0.5 rounded">{data.discountType === 'percent' ? `${data.discountValue}%` : formatCurrency(data.discountValue)}</strong>
            </span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 mb-12">
          
          {/* Card: Total Uses */}
          <div className="bg-gradient-to-b from-white/10 to-white/5 rounded-3xl p-6 border border-white/10 relative overflow-hidden group hover:border-emerald-500/30 transition-colors shadow-2xl">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-blue-500/20 rounded-full blur-2xl group-hover:bg-blue-500/30 transition-colors"></div>
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div>
                <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4 text-blue-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                </div>
                <h3 className="text-gray-400 text-sm font-medium mb-1 uppercase tracking-wider">Usos Totais</h3>
              </div>
              <div>
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-black text-white">{data.currentUses}</span>
                  {data.maxUses && (
                    <span className="text-gray-500 text-lg mb-1">/ {data.maxUses} max</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Card: Total Saved */}
          <div className="bg-gradient-to-b from-emerald-900/40 to-emerald-900/10 rounded-3xl p-6 border border-emerald-500/20 relative overflow-hidden group hover:border-emerald-500/50 transition-colors shadow-2xl lg:col-span-2">
            <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-emerald-500/20 rounded-full blur-3xl group-hover:bg-emerald-500/40 transition-colors"></div>
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="flex justify-between items-start">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-4 text-emerald-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                {/* Visual impact indicator */}
                <div className="bg-emerald-500/20 px-3 py-1 rounded-full border border-emerald-500/30 flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                  <span className="text-xs font-semibold tracking-widest uppercase text-emerald-300">Tempo Real</span>
                </div>
              </div>
              
              <div className="mt-4">
                <h3 className="text-emerald-400/80 text-sm font-medium mb-1 uppercase tracking-wider">Desconto Total Gerado para seus seguidores</h3>
                <div className="flex items-end gap-2 text-wrap break-all">
                  <span className="text-4xl sm:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-white">{formatCurrency(data.totalSaved)}</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* History Section */}
        <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-sm shadow-2xl">
          <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Últimas utilizações</h2>
            <span className="text-xs bg-white/10 text-white px-2.5 py-1 rounded-full font-medium">Top {Math.min(data.history.length, 50)} recentes</span>
          </div>
          
          <div className="p-0 sm:p-2">
            {data.history.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-500">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <p className="text-gray-400">Nenhum uso registrado ainda.</p>
                <p className="text-sm text-gray-500 mt-1">Divulgue seu cupom para ver esta seção crescer!</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5 overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="bg-black/20 text-gray-400 text-xs uppercase tracking-wider">
                      <th className="px-6 py-4 font-semibold">Data e Hora</th>
                      <th className="px-6 py-4 font-semibold">Status do Desconto</th>
                      <th className="px-6 py-4 font-semibold text-right">Valor Economizado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.history.map((item, idx) => (
                      <tr key={idx} className="hover:bg-white/5 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/20 transition-colors shrink-0">
                               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <div>
                                <p className="text-white font-medium text-sm">
                                  {format(new Date(item.saleDate), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {format(new Date(item.saleDate), "HH:mm")}
                                </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                           <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-xs font-semibold tracking-wider uppercase">
                              Desconto Aplicado
                           </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-white font-bold">{formatCurrency(item.discountAmount)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </main>
      
      <footer className="w-full py-8 text-center text-xs text-gray-600 border-t border-white/5 mt-auto bg-black/50">
         <p>© {new Date().getFullYear()} Sistema de Parcerias. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
