"use client";

import { Button } from "@/components/Button";

export default function Settings() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-white mb-8">Configurações</h1>

      <div className="space-y-6 max-w-2xl">
        {/* Aparência */}
        <div
          className="p-6 rounded-2xl backdrop-blur-3xl bg-white/10 border border-white/20"
          style={{
            boxShadow:
              "0 0 6px rgba(0,0,0,0.03), 0 2px 6px rgba(0,0,0,0.08), inset 3px 3px 0.5px -3px rgba(255,255,255,0.4), inset -3px -3px 0.5px -3px rgba(255,255,255,0.35), inset 0 0 6px 6px rgba(255,255,255,0.08)",
          }}
        >
          <h2 className="text-xl font-semibold text-white mb-4">Aparência</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">Modo Escuro</p>
                <p className="text-sm text-gray-400">
                  Ativar tema escuro da interface
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600/50"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Notificações */}
        <div
          className="p-6 rounded-2xl backdrop-blur-3xl bg-white/10 border border-white/20"
          style={{
            boxShadow:
              "0 0 6px rgba(0,0,0,0.03), 0 2px 6px rgba(0,0,0,0.08), inset 3px 3px 0.5px -3px rgba(255,255,255,0.4), inset -3px -3px 0.5px -3px rgba(255,255,255,0.35), inset 0 0 6px 6px rgba(255,255,255,0.08)",
          }}
        >
          <h2 className="text-xl font-semibold text-white mb-4">
            Notificações
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">Notificações por Email</p>
                <p className="text-sm text-gray-400">
                  Receber atualizações por email
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600/50"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">Notificações Push</p>
                <p className="text-sm text-gray-400">
                  Receber notificações no navegador
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600/50"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Privacidade */}
        <div
          className="p-6 rounded-2xl backdrop-blur-3xl bg-white/10 border border-white/20"
          style={{
            boxShadow:
              "0 0 6px rgba(0,0,0,0.03), 0 2px 6px rgba(0,0,0,0.08), inset 3px 3px 0.5px -3px rgba(255,255,255,0.4), inset -3px -3px 0.5px -3px rgba(255,255,255,0.35), inset 0 0 6px 6px rgba(255,255,255,0.08)",
          }}
        >
          <h2 className="text-xl font-semibold text-white mb-4">
            Privacidade e Segurança
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">Perfil Público</p>
                <p className="text-sm text-gray-400">
                  Permitir que outros vejam seu perfil
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600/50"></div>
              </label>
            </div>

            <Button variant="outline" size="md" className="mt-4">
              Alterar Senha
            </Button>
          </div>
        </div>

        {/* Conta */}
        <div
          className="p-6 rounded-2xl backdrop-blur-3xl bg-white/10 border border-white/20"
          style={{
            boxShadow:
              "0 0 6px rgba(0,0,0,0.03), 0 2px 6px rgba(0,0,0,0.08), inset 3px 3px 0.5px -3px rgba(255,255,255,0.4), inset -3px -3px 0.5px -3px rgba(255,255,255,0.35), inset 0 0 6px 6px rgba(255,255,255,0.08)",
          }}
        >
          <h2 className="text-xl font-semibold text-white mb-4">Conta</h2>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Ações relacionadas à sua conta
            </p>
            <div className="flex gap-4">
              <Button variant="outline" size="md">
                Exportar Dados
              </Button>
              <Button variant="outline" size="md" className="text-red-400 border-red-400/50 hover:bg-red-500/20">
                Excluir Conta
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
