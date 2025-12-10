"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { WebGLShader } from "@/components/webgl-shader";

function SuccessContent() {
  const searchParams = useSearchParams();
  const nickname = searchParams.get("nickname");
  const id = searchParams.get("id");

  return (
    <div className="relative z-10 w-full max-w-md">
      <div
        className="relative rounded-3xl p-8 backdrop-blur-3xl bg-white/10 border border-white/10 text-center"
        style={{
          boxShadow:
            "0_0_6px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3px_rgba(255,255,255,0.9),inset_-3px_-3px_0.5px_-3px_rgba(255,255,255,0.85),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.6),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.6),inset_0_0_6px_6px_rgba(255,255,255,0.12),inset_0_0_2px_2px_rgba(255,255,255,0.06),0_0_40px_rgba(255,255,255,0.08),0_0_80px_rgba(255,255,255,0.04)",
        }}
      >
        <div className="flex justify-center mx-auto mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-20 h-20 text-green-500 drop-shadow-[0_0_15px_rgba(34,197,94,0.4)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M8.56 3.69a9 9 0 0 0 -2.92 1.95" />
            <path d="M3.69 8.56a9 9 0 0 0 -.69 3.44" />
            <path d="M3.69 15.44a9 9 0 0 0 1.95 2.92" />
            <path d="M8.56 20.31a9 9 0 0 0 3.44 .69" />
            <path d="M15.44 20.31a9 9 0 0 0 2.92 -1.95" />
            <path d="M20.31 15.44a9 9 0 0 0 .69 -3.44" />
            <path d="M20.31 8.56a9 9 0 0 0 -1.95 -2.92" />
            <path d="M15.44 3.69a9 9 0 0 0 -3.44 -.69" />
            <path d="M9 12l2 2l4 -4" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">
          Conexão Realizada!
        </h1>
        <p className="text-gray-300 mb-8">
          A conta do Mercado Livre foi conectada com sucesso ao sistema.
        </p>

        {/* Card de Resumo da Conta */}
        <div className="bg-black/20 border border-white/10 rounded-xl p-4 mb-6 flex items-center gap-4 text-left hover:bg-black/30 transition-colors">
          <div className="w-12 h-12 bg-[#FFE600] rounded-lg flex items-center justify-center shrink-0 shadow-lg">
            <span className="text-[#2D3277] font-bold text-lg">ML</span>
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold truncate">
              {nickname || "Usuário Mercado Livre"}
            </p>
            <p className="text-gray-400 text-xs font-mono">
              ID: {id || "..."}
            </p>
          </div>
          <div className="ml-auto">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          </div>
        </div>

        <button
          onClick={() => window.close()}
          className="text-sm text-gray-400 hover:text-white transition-colors underline underline-offset-4"
        >
          Fechar esta janela
        </button>
      </div>
    </div>
  );
}

export default function IntegrationSuccess() {
  return (
    <div className="min-h-screen relative flex items-center justify-center p-4">
      {/* WebGL Background */}
      <WebGLShader />
      
      <Suspense fallback={<div className="text-white">Carregando...</div>}>
        <SuccessContent />
      </Suspense>
    </div>
  );
}