"use client";

import { useState } from "react";
import { WebGLShader } from "@/components/webgl-shader";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/contexts/AuthContext";

type InviteSignupProps = {
  inviteCode?: string;
};

export function InviteSignup({ inviteCode }: InviteSignupProps) {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);

  const toast = useToast();
  const { signup } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await signup({ ...formData, inviteCode });
      toast.success("Conta criada com sucesso! Redirecionando...");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar conta. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 11);

    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 6) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    if (numbers.length <= 10) {
      return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`;
    }
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
  };

  const formatName = (value: string) =>
    value.toLowerCase().replace(/(?:^|\s)\S/g, (char) => char.toUpperCase());

  const formatEmail = (value: string) => value.replace(/\s/g, "").toLowerCase();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let formatted = value;

    if (name === "phone") formatted = formatPhone(value);
    else if (name === "firstName" || name === "lastName") formatted = formatName(value);
    else if (name === "email") formatted = formatEmail(value);

    setFormData((prev) => ({
      ...prev,
      [name]: formatted,
    }));
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
          <p className="text-xs uppercase tracking-[0.2em] text-gray-200/70 mb-2">
            {inviteCode ? "Acesso via convite" : "Cadastro liberado"}
          </p>
          <h2 className="text-2xl font-semibold text-white mb-2">Criar conta</h2>
          {inviteCode ? (
            <p className="text-sm text-gray-200/80 mb-6">
              Convite: <span className="font-semibold text-white/90">{inviteCode}</span>
            </p>
          ) : (
            <p className="text-sm text-gray-200/80 mb-6">
              Use seus dados para criar uma conta.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                name="firstName"
                placeholder="Nome"
                value={formData.firstName}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-white/10 backdrop-blur-md text-white placeholder-gray-300 rounded-lg border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                required
              />
              <input
                type="text"
                name="lastName"
                placeholder="Sobrenome"
                value={formData.lastName}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-white/10 backdrop-blur-md text-white placeholder-gray-300 rounded-lg border border-white/20 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                required
              />
            </div>

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
              type="tel"
              name="phone"
              placeholder="(11) 99999-9999"
              value={formData.phone}
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
              minLength={6}
            />

            <Button
              type="submit"
              variant="primary"
              size="md"
              fullWidth
              className="mt-6"
              disabled={loading}
            >
              {loading ? "Criando conta..." : "Criar conta"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
