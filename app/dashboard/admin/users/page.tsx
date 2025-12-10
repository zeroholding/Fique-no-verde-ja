"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  isAdmin: boolean;
  createdByAdmin: boolean;
  createdAt: string;
  generatedPassword?: string | null;
};

type ApiUser = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  is_admin: boolean;
  created_by_admin: boolean;
  created_at: string;
  admin_generated_password?: string | null;
};

const initialForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
};

const ITEMS_PER_PAGE = 7;

export default function AdminUsersPage() {
  const { isAuthorized } = useAdminGuard();
  const { success, error } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [passwordModal, setPasswordModal] = useState<{
    email: string;
    password?: string | null;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const totalUsersCopy = useMemo(() => {
    if (users.length === 0) {
      return "Nenhum usuario cadastrado ainda";
    }

    return `${users.length} ${
      users.length === 1 ? "usuario encontrado" : "usuarios encontrados"
    }`;
  }, [users.length]);

  const totalPages = Math.ceil(users.length / ITEMS_PER_PAGE);

  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return users.slice(startIndex, endIndex);
  }, [users, currentPage]);

  const fetchUsers = useCallback(async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/admin/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Nao foi possivel carregar os usuarios");
      }

      const normalizedUsers: AdminUser[] = (data.users as ApiUser[]).map(
        (user) => ({
          id: user.id,
          name: `${user.first_name} ${user.last_name}`,
          email: user.email,
          phone: user.phone,
          isActive: user.is_active,
          isAdmin: user.is_admin,
          createdByAdmin: user.created_by_admin,
          createdAt: user.created_at,
          generatedPassword: user.admin_generated_password,
        })
      );

      setUsers(normalizedUsers);
      setCurrentPage(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao carregar usuarios";
      error(message);
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    if (isAuthorized) {
      fetchUsers();
    }
  }, [fetchUsers, isAuthorized]);

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) {
      return digits;
    }
    if (digits.length <= 6) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    }
    if (digits.length <= 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    const nextValue = name === "phone" ? formatPhone(value) : value;
    setFormData((prev) => ({
      ...prev,
      [name]: nextValue,
    }));
  };

  const openPasswordModal = (email: string, password?: string | null) => {
    setPasswordModal({ email, password });
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData(initialForm);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao criar usuario");
      }

      success("Usuario criado com sucesso!");
      await fetchUsers();
      setFormData(initialForm);
      openPasswordModal(formData.email, data.generatedPassword);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao criar usuario";
      error(message);
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="p-8 space-y-6 text-white">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-widest text-gray-400">
          Gestao de usuarios
        </p>
        <h1 className="text-3xl font-semibold">Usuarios do sistema</h1>
        <p className="text-gray-300">
          Administre contas, gere senhas automaticas e mantenha o controle do
          que foi criado pelo painel.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-6 py-4 border-b border-white/10">
          <p className="text-sm text-gray-300">{totalUsersCopy}</p>
          <Button
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="rounded-xl"
          >
            Adicionar usuario
          </Button>
        </div>

        {loading ? (
          <div className="px-6 py-10 text-center text-gray-300">
            Carregando usuarios...
          </div>
        ) : users.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-400">
            Ainda nao existem usuarios cadastrados via painel.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {paginatedUsers.map((user) => (
              <div
                key={user.id}
                className="px-6 py-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-semibold">{user.name}</p>
                  <p className="text-sm text-gray-300">{user.email}</p>
                  {user.phone && (
                    <p className="text-xs text-gray-400">{user.phone}</p>
                  )}
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end flex-1">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-3 py-1 rounded-full border border-white/20 text-gray-200">
                      {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                    <span
                      className="px-3 py-1 rounded-full border"
                      style={{
                        borderColor: user.isActive
                          ? "rgba(74, 222, 128, 0.4)"
                          : "rgba(248, 113, 113, 0.4)",
                        color: user.isActive
                          ? "rgb(74, 222, 128)"
                          : "rgb(248, 113, 113)",
                      }}
                    >
                      {user.isActive ? "Ativo" : "Inativo"}
                    </span>
                    {user.isAdmin && (
                      <span className="px-3 py-1 rounded-full border border-cyan-300/40 text-cyan-200">
                        Admin
                      </span>
                    )}
                    {user.createdByAdmin && (
                      <span className="px-3 py-1 rounded-full border border-orange-300/40 text-orange-200">
                        Criado no painel
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2 md:ml-4">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="rounded-full px-4 py-1 w-full md:w-auto"
                      onClick={() => openPasswordModal(user.email, user.generatedPassword)}
                    >
                      Ver senha
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full px-4 py-1 w-full md:w-auto border border-red-500/30 text-red-300 hover:bg-red-500/10"
                      onClick={() => setDeleteTarget(user)}
                    >
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Paginação */}
        {!loading && users.length > ITEMS_PER_PAGE && (
          <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
            <p className="text-sm text-gray-400">
              Página {currentPage} de {totalPages} • Mostrando {paginatedUsers.length} de {users.length} usuarios
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-white/20 text-sm text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Anterior
              </button>
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                      currentPage === page
                        ? "bg-orange-500/20 text-orange-200 border border-orange-500/40"
                        : "border border-white/20 text-white hover:bg-white/10"
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-white/20 text-sm text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title="Adicionar novo usuario"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-xl px-5"
              onClick={closeModal}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              className="rounded-xl px-6"
              form="admin-create-user"
              disabled={saving}
            >
              {saving ? "Salvando..." : "Criar usuario"}
            </Button>
          </div>
        }
      >
        <form
          id="admin-create-user"
          className="space-y-4"
          onSubmit={handleSubmit}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              name="firstName"
              placeholder="Nome"
              value={formData.firstName}
              onChange={handleChange}
              required
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
            />
            <input
              type="text"
              name="lastName"
              placeholder="Sobrenome"
              value={formData.lastName}
              onChange={handleChange}
              required
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
            />
          </div>

          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            required
            className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
          />

          <input
            type="tel"
            name="phone"
            placeholder="(11) 99999-9999"
            value={formData.phone}
            onChange={handleChange}
            className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
          />
        </form>
      </Modal>

      <Modal
        open={Boolean(passwordModal)}
        onClose={() => setPasswordModal(null)}
        title="Senha gerada"
      >
        {passwordModal?.password ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">
              Compartilhe essa senha com <span className="font-semibold">{passwordModal.email}</span>.
            </p>
            <div className="rounded-2xl border border-white/20 bg-black/40 p-4 flex items-center justify-between">
              <code className="text-2xl tracking-widest font-mono">
                {passwordModal.password}
              </code>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(passwordModal.password!);
                    success("Senha copiada!");
                  } catch {
                    error("Nao foi possivel copiar a senha");
                  }
                }}
              >
                Copiar
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-300">
            Nenhuma senha armazenada para {passwordModal?.email}.
          </p>
        )}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Remover usuário"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl px-5"
              onClick={() => setDeleteTarget(null)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="rounded-xl px-6 bg-red-500/30 border border-red-500/50 hover:bg-red-500/50"
              disabled={deleting}
              onClick={async () => {
                if (!deleteTarget) return;
                const token = localStorage.getItem("token");
                if (!token) {
                  error("Sessao expirada. Faca login novamente.");
                  return;
                }

                setDeleting(true);
                try {
                  const response = await fetch("/api/admin/users", {
                    method: "DELETE",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ userId: deleteTarget.id }),
                  });
                  const data = await response.json();
                  if (!response.ok) {
                    throw new Error(data.error || "Erro ao remover usuario");
                  }
                  success("Usuario removido com sucesso!");
                  setDeleteTarget(null);
                  await fetchUsers();
                } catch (err) {
                  const message = err instanceof Error ? err.message : "Erro ao remover usuario";
                  error(message);
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Removendo..." : "Remover"}
            </Button>
          </div>
        }
      >
        {deleteTarget && (
          <p className="text-sm text-gray-300">
            Deseja realmente remover{" "}
            <span className="font-semibold text-white">{deleteTarget.name}</span>?
            Esta ação não pode ser desfeita.
          </p>
        )}
      </Modal>
    </div>
  );
}
