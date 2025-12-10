"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  ChangeEvent,
  FormEvent,
} from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
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
   clientType: "common" | "package";
   responsibleName: string | null;
   referenceContact: string | null;
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
  client_type: "common" | "package" | null;
  responsible_name: string | null;
  reference_contact: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type SortField = "createdAt" | "birthDate" | null;
type SortDirection = "asc" | "desc";

const initialForm = {
  name: "",
  phone: "",
  birthDate: "",
  email: "",
  cpfCnpj: "",
  clientType: "common" as "common" | "package",
  responsibleName: "",
  referenceContact: "",
};

const ITEMS_PER_PAGE = 7;

export default function ClientsPage() {
  const { success, error } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [birthDateFrom, setBirthDateFrom] = useState("");
  const [birthDateTo, setBirthDateTo] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const totalClientsCopy = useMemo(() => {
    if (clients.length === 0) {
      return "Nenhum cliente cadastrado ainda";
    }

    return `${clients.length} ${
      clients.length === 1 ? "cliente encontrado" : "clientes encontrados"
    }`;
  }, [clients.length]);

  const filteredClients = useMemo(() => {
    const search = searchTerm.toLowerCase();
    const birthFromDate = birthDateFrom ? new Date(birthDateFrom) : null;
    const birthToDate = birthDateTo ? new Date(birthDateTo) : null;
    const createdFromDate = createdFrom ? new Date(createdFrom) : null;
    const createdToDate = createdTo ? new Date(createdTo) : null;

    return clients.filter((client) => {
      const matchesSearch =
        client.name.toLowerCase().includes(search) ||
        client.email?.toLowerCase().includes(search) ||
        client.responsibleName?.toLowerCase().includes(search) ||
        client.referenceContact?.toLowerCase().includes(search) ||
        client.phone?.includes(searchTerm) ||
        client.cpfCnpj?.includes(searchTerm);

      if (!matchesSearch) return false;

      const clientBirthDate = client.birthDate ? new Date(client.birthDate) : null;
      if (birthFromDate && (!clientBirthDate || clientBirthDate < birthFromDate)) {
        return false;
      }
      if (birthToDate && (!clientBirthDate || clientBirthDate > birthToDate)) {
        return false;
      }

      const clientCreatedAt = client.createdAt ? new Date(client.createdAt) : null;
      if (createdFromDate && (!clientCreatedAt || clientCreatedAt < createdFromDate)) {
        return false;
      }
      if (createdToDate && (!clientCreatedAt || clientCreatedAt > createdToDate)) {
        return false;
      }

      return true;
    });
  }, [clients, searchTerm, birthDateFrom, birthDateTo, createdFrom, createdTo]);

  const totalPages = Math.ceil(filteredClients.length / ITEMS_PER_PAGE);

  const sortedClients = useMemo(() => {
    if (!sortField) return filteredClients;

    const sorted = [...filteredClients];

    sorted.sort((a, b) => {
      const aValue = sortField === "createdAt" ? a.createdAt : a.birthDate;
      const bValue = sortField === "createdAt" ? b.createdAt : b.birthDate;

      if (!aValue && !bValue) return 0;
      if (!aValue) return 1;
      if (!bValue) return -1;

      const diff = new Date(aValue).getTime() - new Date(bValue).getTime();
      return sortDirection === "asc" ? diff : -diff;
    });

    return sorted;
  }, [filteredClients, sortField, sortDirection]);

  const paginatedClients = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return sortedClients.slice(startIndex, endIndex);
  }, [sortedClients, currentPage]);

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
          clientType: client.client_type === "package" ? "package" : "common",
          responsibleName: client.responsible_name,
          referenceContact: client.reference_contact,
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
    fetchClients();
  }, [fetchClients]);

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) {
      return digits;
    }
    if (digits.length <= 6) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    }
    if (digits.length <= 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(
        6
      )}`;
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

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    let nextValue = value;

    if (name === "clientType") {
      setFormData((prev) => ({
        ...prev,
        clientType: value as "common" | "package",
        // Para clientes de pacote escondemos a data de nascimento e limpamos o valor
        birthDate: value === "package" ? "" : prev.birthDate,
      }));
      return;
    }

    if (name === "phone") {
      nextValue = formatPhone(value);
    } else if (name === "cpfCnpj") {
      nextValue = formatCpfCnpj(value);
    } else if (name === "referenceContact" && formData.clientType === "package") {
      // para clientes de pacote, manter telefone igual ao contato de referencia
      setFormData((prev) => ({
        ...prev,
        referenceContact: nextValue,
        phone: formatPhone(nextValue),
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: nextValue,
    }));
  };

  const updateDateFilter = (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    setter(event.target.value);
    setCurrentPage(1);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setBirthDateFrom("");
    setBirthDateTo("");
    setCreatedFrom("");
    setCreatedTo("");
    setCurrentPage(1);
  };

  const openModal = () => {
    setFormData(initialForm);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormData(initialForm);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    if (formData.clientType === "package") {
      if (!formData.responsibleName.trim()) {
        error("Informe o responsavel pelo cliente de pacote.");
        return;
      }
      if (!formData.referenceContact.trim()) {
        error("Informe um contato de referencia para o cliente de pacote.");
        return;
      }
    }

    setSaving(true);

    try {
      const payload = {
        ...formData,
        phone:
          formData.clientType === "package"
            ? (formData.referenceContact || formData.phone || "").trim()
            : formData.phone,
        responsibleName: formData.responsibleName.trim(),
        referenceContact: formData.referenceContact.trim(),
      };

      const response = await fetch("/api/admin/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Nao foi possivel criar o cliente");
      }

      success("Cliente criado com sucesso!");
      closeModal();
      await fetchClients();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Nao foi possivel criar o cliente";
      error(message);
    } finally {
      setSaving(false);
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

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between px-6 py-4 border-b border-white/10">
          <p className="text-sm text-gray-300">{totalClientsCopy}</p>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end w-full lg:w-auto">
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-4 py-2 rounded-xl border border-white/20 bg-black/30 text-white placeholder-gray-400 focus:border-white focus:outline-none flex-1 md:w-64"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="md:w-auto"
              fullWidth
              onClick={() => setIsImportModalOpen(true)}
            >
              Importar Excel
            </Button>
            <Button
              type="button"
              size="sm"
              className="md:w-auto"
              fullWidth
              onClick={openModal}
            >
              Novo cliente
            </Button>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-white/10 bg-black/20 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-xs uppercase text-gray-400">Nascimento (de)</p>
              <input
                type="date"
                value={birthDateFrom}
                onChange={updateDateFilter(setBirthDateFrom)}
                className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white text-sm focus:border-white focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs uppercase text-gray-400">Nascimento (ate)</p>
              <input
                type="date"
                value={birthDateTo}
                onChange={updateDateFilter(setBirthDateTo)}
                className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white text-sm focus:border-white focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs uppercase text-gray-400">Cadastro (de)</p>
              <input
                type="date"
                value={createdFrom}
                onChange={updateDateFilter(setCreatedFrom)}
                className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white text-sm focus:border-white focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs uppercase text-gray-400">Cadastro (ate)</p>
              <input
                type="date"
                value={createdTo}
                onChange={updateDateFilter(setCreatedTo)}
                className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white text-sm focus:border-white focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => toggleSort("createdAt")}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  sortField === "createdAt"
                    ? "border-blue-400/60 bg-blue-500/20 text-blue-100"
                    : "border-white/20 bg-white/5 text-white hover:bg-white/10"
                }`}
              >
                Data de cadastro {sortField === "createdAt" ? `(${sortDirection.toUpperCase()})` : "(ordenar)"}
              </button>
              <button
                type="button"
                onClick={() => toggleSort("birthDate")}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  sortField === "birthDate"
                    ? "border-blue-400/60 bg-blue-500/20 text-blue-100"
                    : "border-white/20 bg-white/5 text-white hover:bg-white/10"
                }`}
              >
                Data de nascimento {sortField === "birthDate" ? `(${sortDirection.toUpperCase()})` : "(ordenar)"}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearFilters}
                className="px-4 py-2 text-sm rounded-lg border border-white/20 text-white hover:bg-white/10"
              >
                Limpar filtros
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-10 text-center text-gray-300">
            Carregando clientes...
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-400">
            {searchTerm
              ? "Nenhum cliente encontrado com os termos de busca."
              : "Ainda nao existem clientes cadastrados."}
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {paginatedClients.map((client) => (
              <div
                key={client.id}
                className="px-6 py-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between hover:bg-white/5 transition-colors cursor-pointer"
                onClick={() => setViewingClient(client)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-lg">{client.name}</p>
                    <span
                      className={`px-3 py-1 rounded-full border text-xs ${
                        client.clientType === "package"
                          ? "border-amber-400/40 text-amber-200 bg-amber-500/10"
                          : "border-white/20 text-gray-200"
                      }`}
                    >
                      {client.clientType === "package" ? "Cliente de Pacote" : "Cliente Comum"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm text-gray-300 mt-1">
                    {client.phone && <span>Tel: {client.phone}</span>}
                    {client.email && <span>Email: {client.email}</span>}
                    {client.cpfCnpj && <span>CPF/CNPJ: {client.cpfCnpj}</span>}
                  </div>
                  {client.clientType === "package" && (
                    <p className="text-xs text-amber-200 mt-1">
                      Resp.: {client.responsibleName || "-"} | Contato: {client.referenceContact || "-"}
                    </p>
                  )}
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
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Paginação */}
        {!loading && filteredClients.length > ITEMS_PER_PAGE && (
          <div className="px-6 py-4 border-t border-white/10 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <p className="text-sm text-gray-400">
              Página {currentPage} de {totalPages} • Mostrando {paginatedClients.length} de {filteredClients.length} clientes
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
        title="Cadastrar cliente"
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
              className="rounded-xl px-6 bg-emerald-500/30 border border-emerald-500/40 hover:bg-emerald-500/50"
              form="client-create-form"
              disabled={saving}
            >
              {saving ? "Salvando..." : "Salvar cliente"}
            </Button>
          </div>
        }
      >
        <form
          id="client-create-form"
          className="space-y-4"
          onSubmit={handleSubmit}
        >
          <input
            type="text"
            name="name"
            placeholder="Nome completo do cliente"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
          />

          <div>
            <label className="block text-xs uppercase text-gray-400 mb-2">
              Tipo de cliente
            </label>
            <select
              name="clientType"
              value={formData.clientType}
              onChange={handleChange}
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
            >
              <option value="common">Cliente Comum</option>
              <option value="package">Cliente de Pacote (Transportadora)</option>
            </select>
            <p className="text-xs text-gray-400 mt-2">
              Clientes de pacote so podem comprar ou consumir pacotes.
            </p>
          </div>

          {formData.clientType === "package" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                name="responsibleName"
                placeholder="Responsavel pelo contrato"
                value={formData.responsibleName}
                onChange={handleChange}
                required={formData.clientType === "package"}
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
              />
              <input
                type="text"
                name="referenceContact"
                placeholder="Contato de referencia (email ou telefone principal)"
                value={formData.referenceContact}
                onChange={handleChange}
                required={formData.clientType === "package"}
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
              />
            </div>
          )}

          {formData.clientType === "package" ? null : (
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
          )}

          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
          />

          <input
            type="text"
            name="cpfCnpj"
            placeholder="CPF ou CNPJ"
            value={formData.cpfCnpj}
            onChange={handleChange}
            className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
          />
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

            <div className="space-y-1">
              <p className="text-sm text-gray-400">Tipo</p>
              <p className="font-medium">
                {viewingClient.clientType === "package"
                  ? "Cliente de Pacote (Transportadora)"
                  : "Cliente Comum"}
              </p>
              {viewingClient.clientType === "package" && (
                <p className="text-sm text-gray-300">
                  Resp.: {viewingClient.responsibleName || "-"} | Contato: {viewingClient.referenceContact || "-"}
                </p>
              )}
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
              Informa����es importantes:
            </p>
            <ul className="text-sm text-gray-300 space-y-1 list-disc list-inside">
              <li>O arquivo deve estar no formato .xlsx ou .xls</li>
              <li>Preencha todas as colunas obrigat��rias do modelo</li>
              <li>O nome do cliente Ǹ obrigat��rio</li>
              <li>CPF/CNPJ e email devem ser ǧnicos (se preenchidos)</li>
              <li>Data de nascimento deve estar no formato DD/MM/AAAA</li>
            </ul>
          </div>
        </div>
      </Modal>
    </div>
  );
}
