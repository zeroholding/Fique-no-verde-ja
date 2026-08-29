"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Destino apos autenticar.
 *
 * O middleware manda quem nao tem sessao para /login?redirect=<origem>, entao o
 * login precisa honrar esse parametro. Sem isso quem tentava abrir /tracken
 * caia sempre no /dashboard.
 *
 * Somente caminho interno e aceito: precisa comecar com uma unica "/" e nao
 * conter "\", o que barra redirecionamento para fora do dominio.
 */
const resolvePostLoginPath = (fallback = "/dashboard") => {
  if (typeof window === "undefined") {
    return fallback;
  }

  const requested = new URLSearchParams(window.location.search).get("redirect");
  if (!requested) {
    return fallback;
  }

  const isInternalPath =
    requested.startsWith("/") &&
    !requested.startsWith("//") &&
    !requested.includes("\\");

  return isInternalPath ? requested : fallback;
};

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  isAdmin: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /**
   * @param fallbackPath destino quando a URL nao traz ?redirect=.
   *   O painel Tracken passa "/tracken" para nao jogar o atendente no
   *   dashboard depois de entrar pela tela de login dele.
   */
  login: (
    email: string,
    password: string,
    fallbackPath?: string
  ) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}

interface SignupData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  inviteCode?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Carrega o usuário atual ao montar o componente
  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Falha ao carregar usuário");
      }

      const data = await response.json();
      setUser({
        id: data.user.id,
        firstName: data.user.first_name,
        lastName: data.user.last_name,
        email: data.user.email,
        phone: data.user.phone,
        isAdmin: data.user.is_admin,
      });
    } catch (error) {
      console.error("Erro ao carregar usuário:", error);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      // Chama o endpoint de logout para forçar a limpeza do cookie HttpOnly
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch (e) {}
    } finally {
      setLoading(false);
    }
  };

  const login = async (
    email: string,
    password: string,
    fallbackPath = "/dashboard"
  ) => {
    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao fazer login");
      }

      // Salva o token
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      // Atualiza o estado
      setUser({
        id: data.user.id,
        firstName: data.user.firstName,
        lastName: data.user.lastName,
        email: data.user.email,
        phone: data.user.phone,
        isAdmin: data.user.isAdmin,
      });

      // Volta para a pagina que pediu o login, ou para o destino padrao
      router.push(resolvePostLoginPath(fallbackPath));
    } catch (error) {
      console.error("Erro no login:", error);
      throw error;
    }
  };

  const signup = async (data: SignupData) => {
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || "Erro ao criar conta");
      }

      // Salva o token
      localStorage.setItem("token", responseData.token);
      localStorage.setItem("user", JSON.stringify(responseData.user));

      // Atualiza o estado
      setUser({
        id: responseData.user.id,
        firstName: responseData.user.firstName,
        lastName: responseData.user.lastName,
        email: responseData.user.email,
        phone: responseData.user.phone,
        isAdmin: responseData.user.isAdmin,
      });

      // Redireciona para o dashboard
      router.push("/dashboard");
    } catch (error) {
      console.error("Erro no cadastro:", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      const token = localStorage.getItem("token");
      if (token) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
    } finally {
      // Limpa o estado independente do resultado da API
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setUser(null);
      router.push("/login");
    }
  };

  const refreshUser = async () => {
    await loadUser();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        signup,
        logout,
        refreshUser,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }
  return context;
}
