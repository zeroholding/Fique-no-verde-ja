"use client";

import { useState } from "react";
import { WebGLShader } from "@/components/webgl-shader";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/contexts/AuthContext";

export default function Login() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await login(formData.email, formData.password);
      toast.success("Login realizado com sucesso! Redirecionando...");
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer login. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const formatEmail = (value: string) => {
    return value.replace(/\s/g, "").toLowerCase();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const formattedValue = name === "email" ? formatEmail(value) : value;

    setFormData({
      ...formData,
      [name]: formattedValue,
    });
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4">
      <WebGLShader />

      <div className="relative z-10 w-full max-w-md">
        <div
          className="relative rounded-3xl p-8 backdrop-blur-3xl bg-white/10 border border-white/10"
          style={{
            boxShadow:
              "0_0_6px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.08),inset_3px_3px_0.5px_-3px_rgba(255,255,255,0.9),inset_-3px_-3px_0.5px_-3px_rgba(255,255,255,0.85),inset_1px_1px_1px_-0.5px_rgba(255,255,255,0.6),inset_-1px_-1px_1px_-0.5px_rgba(255,255,255,0.6),inset_0_0_6px_6px_rgba(255,255,255,0.12),inset_0_0_2px_2px_rgba(255,255,255,0.06),0_0_40px_rgba(255,255,255,0.08),0_0_80px_rgba(255,255,255,0.04)",
          }}
        >
          <h2 className="text-2xl font-semibold text-white mb-2">
            Bem-vindo de volta
          </h2>
          <p className="text-sm text-gray-200/80 mb-6">
            Acesse sua conta para continuar.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              name="email"
              placeholder="Digite seu email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-md text-white placeholder-gray-300 rounded-lg border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
              required
            />

            <input
              type="password"
              name="password"
              placeholder="Digite sua senha"
              value={formData.password}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-md text-white placeholder-gray-300 rounded-lg border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
              required
            />

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div
                    className="w-5 h-5 rounded backdrop-blur-md bg-white/10 border border-white/20 peer-checked:bg-white/30 transition-all duration-300 flex items-center justify-center"
                    style={{
                      boxShadow: rememberMe
                        ? "0_0_4px_rgba(255,255,255,0.3),inset_1px_1px_0.5px_rgba(255,255,255,0.8),inset_-1px_-1px_0.5px_rgba(255,255,255,0.6)"
                        : "0_0_4px_rgba(0,0,0,0.1),inset_1px_1px_0.5px_rgba(255,255,255,0.4),inset_-1px_-1px_0.5px_rgba(255,255,255,0.3)",
                    }}
                  >
                    {rememberMe && (
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="ml-2 text-sm text-gray-300">Lembrar-me</span>
              </label>

              <a
                href="#"
                className="text-sm text-gray-300 hover:text-white transition-colors"
              >
                Esqueceu a senha?
              </a>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              fullWidth
              className="mt-6"
              disabled={loading}
            >
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
