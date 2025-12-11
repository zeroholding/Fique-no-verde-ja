"use client";
import { useEffect, useState } from "react";

export default function DebugPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/debug/commissions")
      .then(res => res.json())
      .then(json => {
        if(json.data) setData(json.data);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 text-white">
      <h1 className="text-2xl font-bold mb-4">DEBUG: Tabela de Comissões (Raw)</h1>
      {loading ? "Carregando..." : (
        <div className="border border-white/20 rounded">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/10 uppercase">
              <tr>
                <th className="p-2">ID</th>
                <th className="p-2">Data</th>
                <th className="p-2">Atendente</th>
                <th className="p-2">Valor (R$)</th>
                <th className="p-2">Tipo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {data.map((row) => (
                <tr key={row.id}>
                  <td className="p-2 font-mono text-xs">{row.id.slice(0,8)}...</td>
                  <td className="p-2">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="p-2">{row.attendant}</td>
                  <td className="p-2 font-bold text-green-400">R$ {row.commission_amount}</td>
                  <td className="p-2">{row.commission_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
