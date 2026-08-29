"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Formulario de acesso ao painel TRACKen.
 *
 * Usa o mesmo /api/auth/signin do sistema, entao nao existe base de usuarios
 * separada nem senha diferente para manter. O destino padrao e /tracken; se a
 * URL trouxer ?redirect=, o AuthContext leva para lá.
 *
 * Os icones sao SVG inline para o formulario nao carregar biblioteca de icones
 * so por causa da tela de login.
 */

/**
 * Base do campo SEM padding-right: cada campo define o seu.
 *
 * Se a base trouxesse `pr-3` e o campo de senha adicionasse `pr-11`, as duas
 * classes ficariam no elemento e quem venceria dependeria da ordem no CSS
 * gerado, nao da ordem escrita aqui. O icone do olho poderia acabar sobre o
 * texto digitado.
 */
const FIELD_BASE =
  "w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-100";

const ICON_WRAPPER =
  "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400";

function MailIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className={ICON_WRAPPER}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m3.5 7 8.5 6 8.5-6" />
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
      className={ICON_WRAPPER}
      aria-hidden="true"
    >
      <rect x="4.5" y="10" width="15" height="10" rx="2" />
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
    <>
      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:mt-6"
      >
        {error && (
          <p
            role="alert"
            aria-live="polite"
            className="mb-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
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

        <div>
          <label
            htmlFor="tracken-email"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
          >
            E-mail
          </label>
          <div className="relative">
            <MailIcon />
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
              placeholder="seu.email@fiquenoverdeja.com.br"
              className={`${FIELD_BASE} pr-3`}
            />
          </div>
        </div>

        <div className="mt-4">
          <label
            htmlFor="tracken-password"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
          >
            Senha
          </label>
          <div className="relative">
            <LockIcon />
            <input
              id="tracken-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Sua senha do Fique no Verde"
              className={`${FIELD_BASE} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((previous) => !previous)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-200"
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
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
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
              Entrando...
            </>
          ) : (
            <>
              Entrar no painel
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 12h13m0 0-5-5m5 5-5 5"
                />
              </svg>
            </>
          )}
        </button>

        <p className="mt-5 border-t border-slate-100 pt-4 text-center text-xs leading-relaxed text-slate-500">
          Mesmo e-mail e senha do Fique no Verde Já.
          <br />
          Não existe cadastro separado para a TRACKen.
        </p>
      </form>

      <p className="mt-5 text-center text-xs text-slate-400">
        Procurando o sistema completo?{" "}
        <Link
          href="/login"
          className="font-medium text-green-700 underline decoration-green-200 underline-offset-2 transition-colors hover:decoration-green-500"
        >
          Entrar no Fique no Verde
        </Link>
      </p>
    </>
  );
}
