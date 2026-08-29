import type { Metadata } from "next";
import { FnvjLogo, FnvjMark } from "@/components/tracken/BrandLogo";
import TrackenLoginForm from "@/components/tracken/TrackenLoginForm";

/**
 * Tela de login propria do painel FNVJ x TRACKEN.
 *
 * As credenciais sao as MESMAS do Fique no Verde: mesmo e-mail, mesma senha,
 * mesma tabela `users`, mesmo endpoint /api/auth/signin. O que muda e a porta
 * de entrada e a identidade visual.
 *
 * O painel de marca e estatico e fica neste Server Component de proposito: so o
 * formulario vai como JavaScript para o navegador, o que deixa a tela mais leve
 * e ja pintada no primeiro carregamento.
 */

export const metadata: Metadata = {
  title: "Entrar | Painel TRACKen",
  description: "Acesso ao painel de atendimento FNVJ x TRACKen",
  // Tela de autenticacao nao deve ser indexada.
  robots: { index: false, follow: false },
};

/** Icones do painel de marca, desenhados aqui para nao virar dependencia. */
const FEATURE_ICONS = {
  bolt: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z"
    />
  ),
  gauge: (
    <>
      <path strokeLinecap="round" d="M12 14 16 9" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 18a9 9 0 1 1 16 0"
      />
      <circle cx="12" cy="18" r="1.4" />
    </>
  ),
  plug: (
    <>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 4v5m4-5v5M7 9h10v3a5 5 0 0 1-10 0V9Zm5 8v4"
      />
    </>
  ),
  shield: (
    <>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 8.9 4.1-1.3 7-4.7 7-8.9V6l-7-2.5Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="m9.3 11.8 2 2 3.4-3.4" />
    </>
  ),
};

const FEATURES: Array<{
  icon: keyof typeof FEATURE_ICONS;
  title: string;
  description: string;
}> = [
  {
    icon: "bolt",
    title: "Atendimento em um clique",
    description: "Troque o status direto na lista, sem abrir tela nenhuma.",
  },
  {
    icon: "gauge",
    title: "Prazo sempre à vista",
    description:
      "O limite de envio do Mercado Livre ordena a fila e acende o alerta.",
  },
  {
    icon: "plug",
    title: "Integração direta",
    description: "As solicitações chegam da TRACKen por API, em lote ou uma a uma.",
  },
  {
    icon: "shield",
    title: "Histórico inviolável",
    description: "Cada mudança fica registrada e nenhuma pode ser reescrita.",
  },
];

export default function TrackenLoginPage() {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* ---------------- Painel de marca (some no mobile) ---------------- */}
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-[#036c35] via-[#048842] to-[#0b903a] lg:flex lg:w-[52%] lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        {/* Trama de pontos, puramente decorativa */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18]"
          aria-hidden="true"
        >
          <defs>
            <pattern
              id="tracken-dots"
              width="22"
              height="22"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1.5" cy="1.5" r="1.5" fill="#ffffff" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#tracken-dots)" />
        </svg>

        {/* Marca d'agua com o simbolo */}
        <div
          className="pointer-events-none absolute -bottom-16 -right-16 opacity-[0.07]"
          aria-hidden="true"
        >
          <FnvjMark className="h-[26rem] w-[26rem]" />
        </div>

        <div className="relative">
          <FnvjLogo className="h-14 w-auto" onDark />

          <h1 className="mt-12 max-w-md text-3xl font-bold leading-tight text-white xl:text-4xl">
            Painel de Atendimento
            <span className="mt-1 block text-green-200">
              Fique no Verde Já × TRACKen
            </span>
          </h1>

          <p className="mt-4 max-w-md text-sm leading-relaxed text-green-50/90">
            Gestão central das solicitações de remoção de atraso que chegam da
            TRACKen. Uma fila, um prazo, um lugar para resolver.
          </p>
        </div>

        <ul className="relative mt-12 space-y-5">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="flex items-start gap-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-inset ring-white/25">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  className="h-4 w-4 text-white"
                  aria-hidden="true"
                >
                  {FEATURE_ICONS[feature.icon]}
                </svg>
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">
                  {feature.title}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-green-50/80">
                  {feature.description}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <p className="relative mt-12 text-[11px] text-green-50/60">
          Uso restrito à equipe Fique no Verde Já.
        </p>
      </section>

      {/* ---------------- Coluna do formulario ---------------- */}
      <section className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          {/* No mobile o painel de marca nao aparece, entao a marca entra aqui */}
          <div className="mb-8 flex flex-col items-center lg:hidden">
            <FnvjLogo className="h-12 w-auto" />
            <p className="mt-3 text-sm font-medium text-slate-500">
              Painel de Atendimento TRACKen
            </p>
          </div>

          <div className="hidden lg:block">
            <h2 className="text-xl font-bold text-slate-900">Entrar no painel</h2>
            <p className="mt-1 text-sm text-slate-500">
              Use suas credenciais do Fique no Verde Já.
            </p>
          </div>

          <TrackenLoginForm />
        </div>
      </section>
    </div>
  );
}
