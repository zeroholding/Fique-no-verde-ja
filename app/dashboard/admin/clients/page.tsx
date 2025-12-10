"use client";


import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { useToast } from "@/components/Toast";

type Client = {
  id: string;
  name: string;
  phone: string | null;
  birthDate: string | null;
  email: string | null;
  cpfCnpj: string | null;
  originId: string | null;
  originName: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type ApiClient = {
  id: string;
  name: string;
  phone: string | null;
  birth_date: string | null;
  email: string | null;
  cpf_cnpj: string | null;
  origin_id: string | null;
  origin_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type Origin = {
  id: string;
  name: string;
};

const initialForm = {
  name: "",
  phone: "",
  birthDate: "",
  email: "",
  cpfCnpj: "",
  originId: "",
};

const ITEMS_PER_PAGE = 7;

export default function AdminClientsPage() {
  const { success, error } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const totalClientsCopy = useMemo(() => {
    if (clients.length === 0) {
      return "Nenhum cliente cadastrado ainda";
    }

    return `${clients.length} ${
      clients.length === 1 ? "cliente encontrado" : "clientes encontrados"
    }`;
  }, [clients.length]);

  const totalPages = Math.ceil(clients.length / ITEMS_PER_PAGE);

  const paginatedClients = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return clients.slice(startIndex, endIndex);
  }, [clients, currentPage]);

  const fetchOrigins = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const response = await fetch("/api/admin/origins", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (response.ok) {
        setOrigins(
          data.origins.map((o: any) => ({ id: o.id, name: o.name }))
        );
      }
    } catch (err) {
      console.error("Erro ao carregar origens:", err);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/admin/clients", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Nao foi possivel carregar os clientes");
      }

      const normalizedClients: Client[] = (data.clients as ApiClient[]).map(
        (client) => ({
          id: client.id,
          name: client.name,
          phone: client.phone,
          birthDate: client.birth_date,
          email: client.email,
          cpfCnpj: client.cpf_cnpj,
          originId: client.origin_id,
          originName: client.origin_name,
          isActive: client.is_active,
          createdAt: client.created_at,
          updatedAt: client.updated_at,
        })
      );

      setClients(normalizedClients);
      setCurrentPage(1);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao carregar clientes";
      error(message);
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    fetchOrigins();
    fetchClients();
  }, [fetchOrigins, fetchClients]);

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

  const formatCPF = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) {
      return digits;
    }
    if (digits.length <= 6) {
      return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    }
    if (digits.length <= 9) {
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    }
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(
      6,
      9
    )}-${digits.slice(9)}`;
  };

  const formatCNPJ = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 14);
    if (digits.length <= 2) {
      return digits;
    }
    if (digits.length <= 5) {
      return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    }
    if (digits.length <= 8) {
      return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
    }
    if (digits.length <= 12) {
      return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(
        5,
        8
      )}/${digits.slice(8)}`;
    }
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(
      5,
      8
    )}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  };

  const formatCpfCnpj = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 11) {
      return formatCPF(value);
    }
    return formatCNPJ(value);
  };

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    let nextValue = value;

    if (name === "phone") {
      nextValue = formatPhone(value);
    } else if (name === "cpfCnpj") {
      nextValue = formatCpfCnpj(value);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: nextValue,
    }));
  };

  const openModal = (client?: Client) => {
    if (client) {
      setEditingClient(client);
      setFormData({
        name: client.name,
        phone: client.phone || "",
        birthDate: client.birthDate
          ? new Date(client.birthDate).toISOString().split("T")[0]
          : "",
        email: client.email || "",
        cpfCnpj: client.cpfCnpj || "",
        originId: client.originId || "",
      });
    } else {
      setEditingClient(null);
      setFormData(initialForm);
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData(initialForm);
    setEditingClient(null);
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
      const url = "/api/admin/clients";
      const method = editingClient ? "PUT" : "POST";
      const body = editingClient
        ? { ...formData, id: editingClient.id }
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
            `Erro ao ${editingClient ? "atualizar" : "criar"} cliente`
        );
      }

      success(
        `Cliente ${editingClient ? "atualizado" : "criado"} com sucesso!`
      );
      await fetchClients();
      closeModal();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : `Erro ao ${editingClient ? "atualizar" : "criar"} cliente`;
      error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleImportExcel = async () => {
    if (!selectedFile) {
      error("Selecione um arquivo Excel para importar");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/admin/clients/import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        let errorMessage = data.error || "Erro ao importar clientes";
        if (data.details && Array.isArray(data.details)) {
          errorMessage += "\n\nDetalhes:\n" + data.details.join("\n");
        }
        throw new Error(errorMessage);
      }

      let successMessage = `${data.imported || 0} clientes importados com sucesso!`;
      if (data.totalErrors && data.totalErrors > 0) {
        successMessage += ` (${data.totalErrors} erro${data.totalErrors > 1 ? "s" : ""} encontrado${data.totalErrors > 1 ? "s" : ""})`;
      }

      success(successMessage);
      setIsImportModalOpen(false);
      setSelectedFile(null);
      await fetchClients();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao importar clientes";
      error(message);
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    try {
      const response = await fetch("/api/admin/clients/template", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Erro ao baixar modelo");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "modelo_importacao_clientes.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao baixar modelo";
      error(message);
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
      const response = await fetch("/api/admin/clients", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ clientId: deleteTarget.id }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao remover cliente");
      }

      success("Cliente removido com sucesso!");
      setDeleteTarget(null);
      await fetchClients();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao remover cliente";
      error(message);
    } finally {
      setDeleting(false);
    }
  };

  const calculateAge = (birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  return (
    <div className="p-8 space-y-6 text-white">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-widest text-gray-400">
          Gestao de clientes
        </p>
        <h1 className="text-3xl font-semibold">Clientes</h1>
        <p className="text-gray-300">
          Gerencie o cadastro completo de seus clientes com todos os dados
          importantes.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-6 py-4 border-b border-white/10">
          <p className="text-sm text-gray-300">{totalClientsCopy}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsImportModalOpen(true)}
              className="rounded-xl"
            >
              Importar Excel
            </Button>
            <Button size="sm" onClick={() => openModal()} className="rounded-xl">
              Adicionar cliente
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-10 text-center text-gray-300">
            Carregando clientes...
          </div>
        ) : clients.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-400">
            Ainda nao existem clientes cadastrados.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {paginatedClients.map((client) => (
              <div
                key={client.id}
                className="px-6 py-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex-1">
                  <p className="font-semibold text-lg">{client.name}</p>
                  <div className="flex flex-wrap gap-3 text-sm text-gray-300 mt-1">
                    {client.phone && <span>Tel: {client.phone}</span>}
                    {client.email && <span>• {client.email}</span>}
                    {client.cpfCnpj && <span>• {client.cpfCnpj}</span>}
                  </div>
                  {client.birthDate && (
                    <p className="text-xs text-gray-400 mt-1">
                      Idade: {calculateAge(client.birthDate)} anos
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {client.originName && (
                      <span className="px-3 py-1 rounded-full border border-purple-300/40 text-purple-200">
                        {client.originName}
                      </span>
                    )}
                    <span className="px-3 py-1 rounded-full border border-white/20 text-gray-200">
                      {new Date(client.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </div>

                  <div className="flex gap-2 md:ml-4">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="rounded-full px-4 py-1"
                      onClick={() => setViewingClient(client)}
                    >
                      Ver detalhes
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="rounded-full px-4 py-1"
                      onClick={() => openModal(client)}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full px-4 py-1 border border-red-500/30 text-red-300 hover:bg-red-500/10"
                      onClick={() => setDeleteTarget(client)}
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
        {!loading && clients.length > ITEMS_PER_PAGE && (
          <div className="px-6 py-4 border-t border-white/10 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <p className="text-sm text-gray-400">
              Página {currentPage} de {totalPages} • Mostrando {paginatedClients.length} de {clients.length} clientes
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
        title={editingClient ? "Editar cliente" : "Adicionar novo cliente"}
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
              form="client-form"
              disabled={saving}
            >
              {saving
                ? "Salvando..."
                : editingClient
                ? "Atualizar cliente"
                : "Criar cliente"}
            </Button>
          </div>
        }
      >
        <form id="client-form" className="space-y-4" onSubmit={handleSubmit}>
          <input
            type="text"
            name="name"
            placeholder="Nome completo do cliente"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="tel"
              name="phone"
              placeholder="(11) 99999-9999"
              value={formData.phone}
              onChange={handleChange}
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
            />

            <input
              type="date"
              name="birthDate"
              placeholder="Data de nascimento"
              value={formData.birthDate}
              onChange={handleChange}
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
            />
          </div>

          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              name="cpfCnpj"
              placeholder="CPF ou CNPJ"
              value={formData.cpfCnpj}
              onChange={handleChange}
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
            />

            <Select
              name="originId"
              value={formData.originId}
              onChange={handleChange}
              options={origins.map((origin) => ({
                value: origin.id,
                label: origin.name
              }))}
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(viewingClient)}
        onClose={() => setViewingClient(null)}
        title="Detalhes do cliente"
      >
        {viewingClient && (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-gray-400">Nome</p>
              <p className="text-lg font-semibold">{viewingClient.name}</p>
            </div>

            {viewingClient.phone && (
              <div className="space-y-2">
                <p className="text-sm text-gray-400">Telefone</p>
                <p>{viewingClient.phone}</p>
              </div>
            )}

            {viewingClient.email && (
              <div className="space-y-2">
                <p className="text-sm text-gray-400">Email</p>
                <p>{viewingClient.email}</p>
              </div>
            )}

            {viewingClient.birthDate && (
              <div className="space-y-2">
                <p className="text-sm text-gray-400">Data de Nascimento</p>
                <p>
                  {new Date(viewingClient.birthDate).toLocaleDateString("pt-BR")}{" "}
                  ({calculateAge(viewingClient.birthDate)} anos)
                </p>
              </div>
            )}

            {viewingClient.cpfCnpj && (
              <div className="space-y-2">
                <p className="text-sm text-gray-400">CPF/CNPJ</p>
                <p className="font-mono">{viewingClient.cpfCnpj}</p>
              </div>
            )}

            {viewingClient.originName && (
              <div className="space-y-2">
                <p className="text-sm text-gray-400">Origem</p>
                <span className="inline-block px-3 py-1 rounded-full border border-purple-300/40 text-purple-200 text-sm">
                  {viewingClient.originName}
                </span>
              </div>
            )}

            <div className="pt-4 border-t border-white/10 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Cadastrado em:</span>
                <span>
                  {new Date(viewingClient.createdAt).toLocaleDateString("pt-BR")}{" "}
                  às{" "}
                  {new Date(viewingClient.createdAt).toLocaleTimeString("pt-BR")}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Última atualização:</span>
                <span>
                  {new Date(viewingClient.updatedAt).toLocaleDateString("pt-BR")}{" "}
                  às{" "}
                  {new Date(viewingClient.updatedAt).toLocaleTimeString("pt-BR")}
                </span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Remover cliente"
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
            Deseja realmente remover o cliente{" "}
            <span className="font-semibold text-white">{deleteTarget.name}</span>?
            Esta acao nao pode ser desfeita.
          </p>
        )}
      </Modal>

      {/* Modal Importar Excel */}
      <Modal
        open={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          setSelectedFile(null);
        }}
        title="Importar clientes via Excel"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl px-5"
              onClick={() => {
                setIsImportModalOpen(false);
                setSelectedFile(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="rounded-xl px-6"
              disabled={importing || !selectedFile}
              onClick={handleImportExcel}
            >
              {importing ? "Importando..." : "Importar"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
            <p className="text-sm text-blue-200 mb-2">
              Antes de importar, baixe o modelo do Excel para preencher corretamente os dados.
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="rounded-xl"
              onClick={handleDownloadTemplate}
            >
              Baixar modelo do Excel
            </Button>
          </div>

          <div>
            <label className="block text-xs uppercase text-gray-400 mb-2">
              Selecione o arquivo Excel
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange-500/20 file:text-orange-200 hover:file:bg-orange-500/30"
            />
            {selectedFile && (
              <p className="text-sm text-gray-300 mt-2">
                Arquivo selecionado: {selectedFile.name}
              </p>
            )}
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <p className="text-xs uppercase text-gray-400 mb-2">
              Informações importantes:
            </p>
            <ul className="text-sm text-gray-300 space-y-1 list-disc list-inside">
              <li>O arquivo deve estar no formato .xlsx ou .xls</li>
              <li>Preencha todas as colunas obrigatórias do modelo</li>
              <li>O nome do cliente é obrigatório</li>
              <li>CPF/CNPJ e email devem ser únicos (se preenchidos)</li>
              <li>Data de nascimento deve estar no formato DD/MM/AAAA</li>
            </ul>
          </div>
        </div>
      </Modal>
    </div>
  );
}
