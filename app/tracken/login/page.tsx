import type { Metadata } from "next";
import { FnvjLogo } from "@/components/tracken/BrandLogo";
import TrackenLoginForm from "@/components/tracken/TrackenLoginForm";

/**
 * Tela de login do painel FNVJ x TRACKEN.
 *
 * As credenciais sao as MESMAS do Fique no Verde: mesmo e-mail, mesma senha,
 * mesma tabela `users`, mesmo endpoint /api/auth/signin. O que muda e a porta
 * de entrada e a identidade visual.
 *
 * Cartao unico centralizado, com divisoria curva entre o painel da marca e o
 * formulario. So o formulario vai como JavaScript para o navegador; todo o
 * resto e renderizado no servidor.
 */

export const metadata: Metadata = {
  title: "Entrar | Painel TRACKen",
  description: "Acesso ao painel de atendimento FNVJ x TRACKen",
  robots: { index: false, follow: false },
};

export default function TrackenLoginPage() {
  // Rolagem em vez de `items-center` puro no telefone: deitado e com o teclado
  // aberto, a altura util cai para ~200px, e o cartao centralizado ficava com
  // topo e rodape cortados pelo `overflow-hidden`, sem como rolar ate o botao
  // de entrar. A partir de `sm` volta a centralizar.
  return (
    <div className="flex min-h-screen justify-center overflow-y-auto bg-gradient-to-br from-[#0d9c40] via-[#048842] to-[#02652f] p-4 sm:items-center sm:p-6">
      <div className="relative my-auto w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl sm:rounded-3xl">
        {/*
          Divisoria curva. Fica atras do conteudo e some no mobile, onde o
          cartao passa a ter uma coluna so. `preserveAspectRatio="none"` deixa
          a onda acompanhar qualquer altura de cartao.
        */}
        <svg
          className="absolute inset-0 hidden h-full w-full md:block"
          viewBox="0 0 800 480"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id="tracken-wave"
              x1="0"
              y1="0"
              x2="1"
              y2="1"
            >
              <stop offset="0%" stopColor="#5ec624" />
              <stop offset="55%" stopColor="#0b903a" />
              <stop offset="100%" stopColor="#036c35" />
            </linearGradient>
          </defs>
          <path
            fill="url(#tracken-wave)"
            d="M0,0 H408 C462,104 330,182 374,286 C412,376 452,398 416,480 H0 Z"
          />
        </svg>

        <div className="relative grid md:grid-cols-2">
          {/* -------- Painel da marca (some no mobile) -------- */}
          <div className="hidden flex-col justify-center p-10 pr-16 md:flex lg:p-14 lg:pr-20">
            <FnvjLogo className="h-11 w-auto" onDark />

            <h1 className="mt-10 text-2xl font-bold leading-snug text-white lg:text-3xl">
              Painel TRACKen
            </h1>

            <span
              className="mt-4 block h-1 w-12 rounded-full bg-white/70"
              aria-hidden="true"
            />

            <p className="mt-4 max-w-[15rem] text-[15px] leading-relaxed text-green-50/90">
              Entre para acompanhar e resolver os atendimentos do dia.
            </p>
          </div>

          {/* -------- Formulario -------- */}
          <div className="px-7 py-10 sm:px-10 lg:px-14 lg:py-14">
            {/* No mobile o painel da marca nao aparece, entao a logo entra aqui */}
            <div className="mb-8 flex justify-center md:hidden">
              <FnvjLogo className="h-11 w-auto" />
            </div>

            <h2 className="text-lg font-bold text-slate-900 md:text-xl">
              Entrar
            </h2>
            <p className="mt-1 text-[15px] text-slate-500">
              Suas credenciais do Fique no Verde Já.
            </p>

            <TrackenLoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}
