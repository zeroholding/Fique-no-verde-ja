import React from "react";

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
  saleType?: string;
  holidayName?: string | null;
};

interface Props {
  commissions: Commission[];
  startDate: string;
  endDate: string;
  attendantFilterName: string;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return `${date.toLocaleDateString("pt-BR")}`;
};

export const CommissionReportTemplate = ({ commissions, startDate, endDate, attendantFilterName }: Props) => {
    
    // Aggregations
    const totalAmount = commissions.reduce((acc, curr) => acc + (curr.amount || 0), 0);
    
    // Tipo de Dia
    let sumBusinessDays = 0;
    let sumWeekendsHolidays = 0;

    // Tipo de Atendimento
    let sumComum = 0;
    let sumConsumo = 0;

    // Tipo de Servico
    let sumAtraso = 0;
    let sumReclamacao = 0;
    let sumOutros = 0;

    commissions.forEach(c => {
        // --- Tipo de Dia ---
        const d = new Date(c.referenceDate);
        const dayOfWeek = d.getDay(); // 0 is Sunday, 6 is Saturday
        const isFds = dayOfWeek === 0 || dayOfWeek === 6;
        const isFeriado = !!c.holidayName;
        
        if (isFds || isFeriado) {
            sumWeekendsHolidays += c.amount;
        } else {
            sumBusinessDays += c.amount;
        }

        // --- Tipo de Atendimento ---
        if (c.saleType === "03") {
            sumConsumo += c.amount;
        } else {
            sumComum += c.amount; // 01 and 02
        }

        // --- Tipo de Serviço ---
        const pName = (c.productName || "").toLowerCase();
        if (pName.includes("atraso")) {
            sumAtraso += c.amount;
        } else if (pName.includes("reclamação") || pName.includes("reclamacao")) {
            sumReclamacao += c.amount;
        } else {
            sumOutros += c.amount;
        }
    });

    const periodStr = (startDate && endDate) 
        ? `Período: ${new Date(startDate+"T00:00:00").toLocaleDateString('pt-BR')} até ${new Date(endDate+"T00:00:00").toLocaleDateString('pt-BR')}`
        : "Período: Todo o histórico";

    return (
      <div 
         className="bg-white text-black p-8 mx-auto font-sans" 
         style={{ width: '210mm', minHeight: '297mm', padding: '20mm' }}
         id="pdf-report-container"
      >
        {/* Header */}
        <div className="flex justify-between items-center border-b-2 border-green-700 pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-green-800 uppercase tracking-wider">Fique no Verde Já</h1>
            <h2 className="text-xl font-semibold text-gray-700 mt-1">Relatório de Comissões</h2>
          </div>
          <div className="text-right text-sm text-gray-500">
            <p suppressHydrationWarning>Emissão: {new Date().toLocaleString('pt-BR')}</p>
            <p className="mt-1">{periodStr}</p>
            <p>Atendente Filtro: <span className="font-semibold text-gray-800">{attendantFilterName || "Todos"}</span></p>
          </div>
        </div>

        {/* Resumo Gerencial - Quadros */}
        <h3 className="text-lg font-bold text-gray-800 mb-3 border-b pb-1">Resumo Executivo</h3>
        <div className="grid grid-cols-2 gap-4 mb-8">
            
            <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Total Acumulado</p>
                <div className="flex items-end justify-between mt-1">
                   <p className="text-2xl font-black text-green-700">{formatCurrency(totalAmount)}</p>
                   <p className="text-sm font-medium text-gray-400">{commissions.length} registros</p>
                </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Soma Por Tipo de Dia</p>
                <div className="flex flex-col mt-1 gap-1 text-sm">
                   <div className="flex justify-between"><span>Dias Úteis:</span> <strong className="text-gray-800">{formatCurrency(sumBusinessDays)}</strong></div>
                   <div className="flex justify-between"><span>FDS ou Feriado:</span> <strong className="text-gray-800">{formatCurrency(sumWeekendsHolidays)}</strong></div>
                </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Soma Por Tipo Atendimento</p>
                <div className="flex flex-col mt-1 gap-1 text-sm">
                   <div className="flex justify-between"><span>Venda Comum/Pacotes:</span> <strong className="text-gray-800">{formatCurrency(sumComum)}</strong></div>
                   <div className="flex justify-between"><span>Consumo de Pacote:</span> <strong className="text-gray-800">{formatCurrency(sumConsumo)}</strong></div>
                </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Soma Por Serviço</p>
                <div className="flex flex-col mt-1 gap-1 text-sm">
                   <div className="flex justify-between"><span>Atrasos:</span> <strong className="text-gray-800">{formatCurrency(sumAtraso)}</strong></div>
                   <div className="flex justify-between"><span>Reclamações:</span> <strong className="text-gray-800">{formatCurrency(sumReclamacao)}</strong></div>
                   {sumOutros > 0 && <div className="flex justify-between"><span>Outros:</span> <strong className="text-gray-800">{formatCurrency(sumOutros)}</strong></div>}
                </div>
            </div>

        </div>

        {/* Detalhamento */}
        <h3 className="text-lg font-bold text-gray-800 mb-3 border-b pb-1">Detalhamento (Soma Diária)</h3>
        
        <table className="w-full text-left text-sm border-collapse mt-4">
            <thead>
                <tr className="bg-gray-100 text-gray-700">
                    <th className="p-2 border border-gray-200 font-semibold">Data</th>
                    <th className="p-2 border border-gray-200 font-semibold">Atendente</th>
                    <th className="p-2 border border-gray-200 font-semibold">Cliente</th>
                    <th className="p-2 border border-gray-200 font-semibold">Serviço/Atendimento</th>
                    <th className="p-2 border border-gray-200 font-semibold text-right">Valor</th>
                </tr>
            </thead>
            <tbody>
                {commissions.map((c, i) => (
                    <tr key={i} className="border-b border-gray-100">
                        <td className="p-2 border-x border-gray-200">{formatDateTime(c.referenceDate)} {c.holidayName && <span className="text-[10px] text-red-500 block leading-tight">{c.holidayName}</span>}</td>
                        <td className="p-2 border-x border-gray-200">{c.attendantName}</td>
                        <td className="p-2 border-x border-gray-200">{c.clientName}</td>
                        <td className="p-2 border-x border-gray-200">
                            <div>{c.productName}</div>
                            <div className="text-[10px] text-gray-500 uppercase">{c.saleType === "03" ? "Consumo" : "Comum"}</div>
                        </td>
                        <td className="p-2 border-x border-gray-200 text-right font-medium text-green-700">{formatCurrency(c.amount)}</td>
                    </tr>
                ))}
                {commissions.length === 0 && (
                    <tr>
                        <td colSpan={5} className="p-4 text-center text-gray-500 border border-gray-200">
                            Nenhuma comissão no filtro selecionado.
                        </td>
                    </tr>
                )}
            </tbody>
        </table>

        {/* Footer */}
        <div className="mt-10 text-center text-xs text-gray-400">
            Documento gerado eletronicamente pelo Sistema Fique no Verde Já. Uso restrito e confidencial.
        </div>
      </div>
    );
};
