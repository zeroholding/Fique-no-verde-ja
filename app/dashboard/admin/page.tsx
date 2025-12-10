"use client";

import { useAdminGuard } from "@/hooks/useAdminGuard";

export default function AdminOverviewPage() {
  const { user, isAuthorized } = useAdminGuard();

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="p-8 space-y-8 text-white">
      <div>
        <p className="text-sm uppercase tracking-widest text-gray-400">
          Central Administrativa
        </p>
        <h1 className="text-3xl font-semibold mt-2">
          Bem-vindo, {user?.firstName}
        </h1>
        <p className="text-gray-300 mt-2 max-w-2xl">
          Visualize o resumo geral do sistema antes de aprofundar nos módulos de usuários e relatórios.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Usuários ativos", value: "1.284", trend: "+12%" },
          { label: "Novos cadastros (30d)", value: "96", trend: "+4%" },
          { label: "Tickets pendentes", value: "8", trend: "-35%" },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl p-6 border border-white/10 bg-white/5 backdrop-blur"
          >
            <p className="text-sm uppercase tracking-widest text-gray-400">
              {card.label}
            </p>
            <div className="flex items-baseline gap-2 mt-4">
              <span className="text-3xl font-semibold">{card.value}</span>
              <span className="text-xs text-emerald-300">{card.trend}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-6">
          <h2 className="text-xl font-semibold mb-4">Atividades recentes</h2>
          <div className="space-y-3 text-gray-300 text-sm">
            <p>• Atualização de permissões concluída com sucesso</p>
            <p>• 3 novos relatórios aguardando aprovação</p>
            <p>• Último acesso administrador: há 12 minutos</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-6">
          <h2 className="text-xl font-semibold mb-4">Próximas ações</h2>
          <ul className="space-y-3 text-gray-300 text-sm">
            <li>• Revisar solicitações de novos usuários</li>
            <li>• Exportar relatório trimestral</li>
            <li>• Configurar alertas automáticos</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
