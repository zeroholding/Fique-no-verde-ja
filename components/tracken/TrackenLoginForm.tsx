"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Formulario de acesso ao painel TRACKen.
 *
 * Usa o mesmo /api/auth/signin do sistema, entao nao existe base de usuarios
 * separada nem senha diferente para manter. O destino padrao e /tracken: se a
 * URL trouxer ?redirect=, o AuthContext leva para lá.
 */

const FIELD_CLASSES =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-100";

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
      // Em caso de sucesso o AuthContext navega; o estado de envio segue ativo
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-600 text-white">
            <svg
              className="h-7 w-7"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>

          <h1 className="mt-4 text-center text-lg font-bold text-slate-900">
            Fique no <span className="text-green-600">VERDE ja</span>
          </h1>
          <p className="mt-1 text-center text-sm text-slate-500">
            Painel de Atendimento TRACKen
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          {error && (
            <p
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              {error}
            </p>
          )}

          <div>
            <label
              htmlFor="tracken-email"
              className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
            >
              E-mail
            </label>
            <input
              id="tracken-email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="seu.email@fiquenoverdeja.com.br"
              className={FIELD_CLASSES}
            />
          </div>

          <div className="mt-4">
            <label
              htmlFor="tracken-password"
              className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
            >
              Senha
            </label>
            <div className="relative">
              <input
                id="tracken-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Sua senha do Fique no Verde"
                className={`${FIELD_CLASSES} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((previous) => !previous)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Entrando...
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Entrar no painel
              </>
            )}
          </button>

          <p className="mt-4 text-center text-xs text-slate-500">
            Use o mesmo e-mail e senha do Fique no Verde. Nao existe cadastro
            separado para a TRACKen.
          </p>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          Procurando o sistema completo?{" "}
          <Link
            href="/login"
            className="font-medium text-green-700 underline decoration-green-200 underline-offset-2 transition-colors hover:decoration-green-500"
          >
            Entrar no Fique no Verde
          </Link>
        </p>
      </div>
    </div>
  );
}
