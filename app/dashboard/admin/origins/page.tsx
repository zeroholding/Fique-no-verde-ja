"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";

type Origin = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type ApiOrigin = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const initialForm = {
  name: "",
  description: "",
};

const ITEMS_PER_PAGE = 7;

export default function AdminOriginsPage() {
  const { isAuthorized } = useAdminGuard();
  const { success, error } = useToast();
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Origin | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingOrigin, setEditingOrigin] = useState<Origin | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const totalOriginsCopy = useMemo(() => {
    if (origins.length === 0) {
      return "Nenhuma origem cadastrada ainda";
    }

    return `${origins.length} ${
      origins.length === 1 ? "origem encontrada" : "origens encontradas"
    }`;
  }, [origins.length]);

  const totalPages = Math.ceil(origins.length / ITEMS_PER_PAGE);

  const paginatedOrigins = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return origins.slice(startIndex, endIndex);
  }, [origins, currentPage]);

  const fetchOrigins = useCallback(async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/admin/origins", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Nao foi possivel carregar as origens");
      }

      const normalizedOrigins: Origin[] = (data.origins as ApiOrigin[]).map(
        (origin) => ({
          id: origin.id,
          name: origin.name,
          description: origin.description,
          isActive: origin.is_active,
          createdAt: origin.created_at,
          updatedAt: origin.updated_at,
        })
      );

      setOrigins(normalizedOrigins);
      setCurrentPage(1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao carregar origens";
      error(message);
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    if (isAuthorized) {
      fetchOrigins();
    }
  }, [fetchOrigins, isAuthorized]);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const openModal = (origin?: Origin) => {
    if (origin) {
      setEditingOrigin(origin);
      setFormData({
        name: origin.name,
        description: origin.description || "",
      });
    } else {
      setEditingOrigin(null);
      setFormData(initialForm);
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData(initialForm);
    setEditingOrigin(null);
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
      const url = "/api/admin/origins";
      const method = editingOrigin ? "PUT" : "POST";
      const body = editingOrigin
        ? { ...formData, id: editingOrigin.id }
        : formData;

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.error ||
            `Erro ao ${editingOrigin ? "atualizar" : "criar"} origem`
        );
      }

      success(
        `Origem ${editingOrigin ? "atualizada" : "criada"} com sucesso!`
      );
      await fetchOrigins();
      closeModal();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : `Erro ao ${editingOrigin ? "atualizar" : "criar"} origem`;
      error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch("/api/admin/origins", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ originId: deleteTarget.id }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao remover origem");
      }

      success("Origem removida com sucesso!");
      setDeleteTarget(null);
      await fetchOrigins();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao remover origem";
      error(message);
    } finally {
      setDeleting(false);
    }
  };

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="p-8 space-y-6 text-white">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-widest text-gray-400">
          Gestao de origens
        </p>
        <h1 className="text-3xl font-semibold">Origens de clientes</h1>
        <p className="text-gray-300">
          Gerencie as origens de onde seus clientes vieram (Instagram, Facebook,
          Indicacao, etc).
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-6 py-4 border-b border-white/10">
          <p className="text-sm text-gray-300">{totalOriginsCopy}</p>
          <Button
            size="sm"
            onClick={() => openModal()}
            className="rounded-xl"
          >
            Adicionar origem
          </Button>
        </div>

        {loading ? (
          <div className="px-6 py-10 text-center text-gray-300">
            Carregando origens...
          </div>
        ) : origins.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-400">
            Ainda nao existem origens cadastradas.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {paginatedOrigins.map((origin) => (
              <div
                key={origin.id}
                className="px-6 py-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex-1">
                  <p className="font-semibold">{origin.name}</p>
                  {origin.description && (
                    <p className="text-sm text-gray-300">{origin.description}</p>
                  )}
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-3 py-1 rounded-full border border-white/20 text-gray-200">
                      {new Date(origin.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                    <span
                      className="px-3 py-1 rounded-full border"
                      style={{
                        borderColor: origin.isActive
                          ? "rgba(74, 222, 128, 0.4)"
                          : "rgba(248, 113, 113, 0.4)",
                        color: origin.isActive
                          ? "rgb(74, 222, 128)"
                          : "rgb(248, 113, 113)",
                      }}
                    >
                      {origin.isActive ? "Ativo" : "Inativo"}
                    </span>
                  </div>

                  <div className="flex gap-2 md:ml-4">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="rounded-full px-4 py-1 w-full md:w-auto"
                      onClick={() => openModal(origin)}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full px-4 py-1 w-full md:w-auto border border-red-500/30 text-red-300 hover:bg-red-500/10"
                      onClick={() => setDeleteTarget(origin)}
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
        {!loading && origins.length > ITEMS_PER_PAGE && (
          <div className="px-6 py-4 border-t border-white/10 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <p className="text-sm text-gray-400">
              Página {currentPage} de {totalPages} • Mostrando {paginatedOrigins.length} de {origins.length} origens
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
        title={editingOrigin ? "Editar origem" : "Adicionar nova origem"}
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
              form="origin-form"
              disabled={saving}
            >
              {saving
                ? "Salvando..."
                : editingOrigin
                ? "Atualizar origem"
                : "Criar origem"}
            </Button>
          </div>
        }
      >
        <form id="origin-form" className="space-y-4" onSubmit={handleSubmit}>
          <input
            type="text"
            name="name"
            placeholder="Nome da origem (ex: Instagram, Facebook, Indicacao)"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
          />

          <textarea
            name="description"
            placeholder="Descricao (opcional)"
            value={formData.description}
            onChange={handleChange}
            rows={3}
            className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none resize-none"
          />
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Remover origem"
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
              onClick={handleDelete}
            >
              {deleting ? "Removendo..." : "Remover"}
            </Button>
          </div>
        }
      >
        {deleteTarget && (
          <p className="text-sm text-gray-300">
            Deseja realmente remover a origem{" "}
            <span className="font-semibold text-white">{deleteTarget.name}</span>?
            Esta acao nao pode ser desfeita.
          </p>
        )}
      </Modal>
    </div>
  );
}
