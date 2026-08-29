"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Formulario de acesso ao painel TRACKen.
 *
 * Usa o mesmo /api/auth/signin do sistema: nao existe base de usuarios separada
 * nem senha diferente para manter. O destino padrao e /tracken; se a URL trouxer
 * ?redirect=, o AuthContext leva para lá.
 *
 * Os icones sao SVG inline para a tela de login nao carregar biblioteca de
 * icones. Os rotulos existem, mas ficam apenas para leitor de tela: o campo se
 * identifica visualmente pelo icone e pelo texto de exemplo.
 */

/**
 * Base do campo SEM padding-right: cada campo define o seu.
 *
 * Se a base trouxesse `pr-4` e o campo de senha somasse `pr-12`, as duas
 * utilitarias ficariam no elemento e quem venceria dependeria da ordem no CSS
 * gerado, nao da ordem escrita aqui. O icone do olho poderia acabar sobre o
 * texto digitado.
 */
const FIELD_BASE =
  "w-full rounded-xl border border-transparent bg-slate-100 py-3.5 pl-11 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 hover:bg-slate-100/80 focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-500/15";

const ICON_CLASSES =
  "pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400";

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className={ICON_CLASSES}
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.6" />
      <path strokeLinecap="round" d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className={ICON_CLASSES}
      aria-hidden="true"
    >
      <rect x="4.5" y="10" width="15" height="10" rx="2.4" />
      <path strokeLinecap="round" d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
    </svg>
  );
}

export default function TrackenLoginForm() {
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Terceiro argumento: destino quando a URL nao traz ?redirect=.
      await login(email.trim().toLowerCase(), password, "/tracken");
      // Em caso de sucesso o AuthContext navega. O estado de envio segue ativo
      // de proposito, para o botao nao voltar a ficar clicavel durante a
      // transicao de rota.
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Nao foi possivel entrar. Tente novamente."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-7">
      {error && (
        <p
          role="alert"
          aria-live="polite"
          className="mb-5 flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-700 ring-1 ring-red-200"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path strokeLinecap="round" d="M12 8v4.5M12 16h.01" />
          </svg>
          {error}
        </p>
      )}

      <div className="relative">
        <label htmlFor="tracken-email" className="sr-only">
          E-mail
        </label>
        <UserIcon />
        <input
          id="tracken-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="E-mail"
          className={`${FIELD_BASE} pr-4`}
        />
      </div>

      <div className="relative mt-4">
        <label htmlFor="tracken-password" className="sr-only">
          Senha
        </label>
        <LockIcon />
        <input
          id="tracken-password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Senha"
          className={`${FIELD_BASE} pr-12`}
        />
        <button
          type="button"
          onClick={() => setShowPassword((previous) => !previous)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={showPassword}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            className="h-4 w-4"
            aria-hidden="true"
          >
            {showPassword ? (
              <>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.8 2.8"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.6 6.7C4.7 8 3.4 9.8 2.8 12c1.3 4 5.1 6.5 9.2 6.5 1.6 0 3.1-.4 4.4-1.1m2.6-1.9c.9-.9 1.6-2 2.1-3.5-1.3-4-5.1-6.5-9.2-6.5-.8 0-1.5.1-2.2.3"
                />
              </>
            ) : (
              <>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.8 12C4.1 8 7.9 5.5 12 5.5s7.9 2.5 9.2 6.5c-1.3 4-5.1 6.5-9.2 6.5S4.1 16 2.8 12Z"
                />
                <circle cx="12" cy="12" r="2.6" />
              </>
            )}
          </svg>
        </button>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#5ec624] to-[#048842] px-4 py-3.5 text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-green-600/20 transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              className="h-4 w-4 animate-spin"
              aria-hidden="true"
            >
              <path strokeLinecap="round" d="M12 3a9 9 0 1 0 9 9" />
            </svg>
            Entrando
          </>
        ) : (
          "Entrar"
        )}
      </button>

      <p className="mt-6 text-center text-xs text-slate-500">
        <Link
          href="/login"
          className="font-medium text-green-700 underline decoration-green-300 underline-offset-2 transition-colors hover:decoration-green-600"
        >
          Ir para o sistema completo
        </Link>
      </p>
    </form>
  );
}
