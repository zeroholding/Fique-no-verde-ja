"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { Select } from "@/components/Select";

type ServiceRange = {
  id: string;
  saleType: "01" | "02";
  minQuantity: number;
  maxQuantity: number | null;
  unitPrice: number;
  effectiveFrom: string;
};

type Service = {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  sla: string;
  highlights: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  priceRanges: ServiceRange[];
};

type ServicesResponse = {
  services: Service[];
  error?: string;
};

type ServiceForm = {
  name: string;
  description: string;
  basePrice: string;
  sla: string;
  highlights: string;
  isActive: boolean;
};

type ServiceRangeForm = {
  saleType: "01" | "02";
  minQuantity: string;
  maxQuantity: string;
  unitPrice: string;
  effectiveFrom: string;
};

const initialForm: ServiceForm = {
  name: "",
  description: "",
  basePrice: "0",
  sla: "",
  highlights: "",
  isActive: true,
};

const createEmptyRangeForm = (): ServiceRangeForm => ({
  saleType: "01",
  minQuantity: "1",
  maxQuantity: "",
  unitPrice: "0",
  effectiveFrom: new Date().toISOString().slice(0, 10),
});

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });

const saleTypeOptions: Array<{ value: "01" | "02"; label: string }> = [
  { value: "01", label: "01 - Comum" },
  { value: "02", label: "02 - Pacote" },
];

const saleTypeLabels: Record<ServiceRange["saleType"], string> = {
  "01": "01 · Comum",
  "02": "02 · Pacote",
};

const formatQuantityRange = (min: number, max: number | null) => {
  if (max === null) {
    return `${min}+ unidades`;
  }
  if (min === max) {
    return `${min} unidade${min > 1 ? "s" : ""}`;
  }
  return `${min} - ${max} unidades`;
};

export default function AdminServicesPage() {
  const { isAuthorized } = useAdminGuard();
  const { success, error } = useToast();

  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<ServiceForm>(initialForm);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rangeForms, setRangeForms] = useState<ServiceRangeForm[]>([
    createEmptyRangeForm(),
  ]);

  const fetchServices = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/services?includeInactive=true", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = (await response.json()) as ServicesResponse;

      if (!response.ok) {
        throw new Error(data.error || "Nao foi possivel carregar os servicos");
      }

      setServices(
        (data.services ?? []).map((service) => ({
          ...service,
          basePrice: Number(service.basePrice ?? 0),
          priceRanges: (service.priceRanges ?? []).map((range) => ({
            ...range,
            unitPrice: Number(range.unitPrice ?? 0),
          })),
        })),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao carregar servicos";
      error(message);
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const openModal = (service?: Service) => {
    if (service) {
      setEditingService(service);
      setFormData({
        name: service.name,
        description: service.description,
        basePrice: service.basePrice.toString(),
        sla: service.sla,
        highlights: service.highlights.join("\n"),
        isActive: service.isActive,
      });
      setRangeForms(
        service.priceRanges.length
          ? service.priceRanges.map((range) => ({
              saleType: range.saleType,
              minQuantity: String(range.minQuantity),
              maxQuantity:
                range.maxQuantity === null ? "" : String(range.maxQuantity),
              unitPrice: String(range.unitPrice),
              effectiveFrom:
                range.effectiveFrom ?? new Date().toISOString().slice(0, 10),
            }))
          : [createEmptyRangeForm()],
      );
    } else {
      setEditingService(null);
      setFormData(initialForm);
      setRangeForms([createEmptyRangeForm()]);
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingService(null);
    setFormData(initialForm);
    setRangeForms([createEmptyRangeForm()]);
  };

  const parseHighlights = (value: string) =>
    value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

  const handleFormChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type, checked } = event.target as any;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleRangeChange = (
    index: number,
    field: keyof ServiceRangeForm,
    value: string,
  ) => {
    setRangeForms((prev) =>
      prev.map((range, currentIndex) =>
        currentIndex === index ? { ...range, [field]: value } : range,
      ),
    );
  };

  const handleAddRange = () => {
    setRangeForms((prev) => [...prev, createEmptyRangeForm()]);
  };

  const handleRemoveRange = (index: number) => {
    setRangeForms((prev) =>
      prev.length === 1
        ? prev
        : prev.filter((_, currentIndex) => currentIndex !== index),
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    if (rangeForms.length === 0) {
      error("Adicione pelo menos uma faixa de preco.");
      return;
    }

    let parsedPriceRanges: Array<{
      saleType: "01" | "02";
      minQuantity: number;
      maxQuantity: number | null;
      unitPrice: number;
      effectiveFrom: string;
    }>;

    try {
      parsedPriceRanges = rangeForms.map((range, index) => {
        const saleType = range.saleType === "02" ? "02" : "01";
        const minQuantity = Number(range.minQuantity);
        if (!Number.isFinite(minQuantity) || minQuantity < 1) {
          throw new Error(`Quantidade minima invalida na faixa ${index + 1}`);
        }
        const maxQuantity =
          range.maxQuantity === "" ? null : Number(range.maxQuantity);
        if (
          maxQuantity !== null &&
          (!Number.isFinite(maxQuantity) || maxQuantity < minQuantity)
        ) {
          throw new Error(
            `Quantidade maxima deve ser maior ou igual a quantidade minima (faixa ${
              index + 1
            })`,
          );
        }
        const unitPrice = Number(range.unitPrice);
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
          throw new Error(`Valor unitario invalido na faixa ${index + 1}`);
        }
        const effectiveDate = range.effectiveFrom
          ? new Date(range.effectiveFrom)
          : new Date();
        if (Number.isNaN(effectiveDate.getTime())) {
          throw new Error(`Data de vigencia invalida na faixa ${index + 1}`);
        }

        return {
          saleType,
          minQuantity,
          maxQuantity,
          unitPrice,
          effectiveFrom: effectiveDate.toISOString().slice(0, 10),
        };
      });
    } catch (err) {
      error(err instanceof Error ? err.message : "Faixas invalidas");
      return;
    }

    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      basePrice: Math.max(Number(formData.basePrice) || 0, 0),
      sla: formData.sla.trim(),
      highlights: parseHighlights(formData.highlights),
      isActive: formData.isActive,
      id: editingService?.id,
      priceRanges: parsedPriceRanges,
    };

    if (!payload.name || !payload.description || !payload.sla) {
      error("Preencha os campos obrigatorios.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/services", {
        method: editingService ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.error ||
            `Erro ao ${editingService ? "atualizar" : "criar"} servico`,
        );
      }

      success(
        `Servico ${editingService ? "atualizado" : "criado"} com sucesso!`,
      );
      closeModal();
      fetchServices();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : `Erro ao ${editingService ? "atualizar" : "criar"} servico`;
      error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch("/api/services", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: deleteTarget.id }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao remover servico");
      }

      success("Servico removido com sucesso!");
      setDeleteTarget(null);
      fetchServices();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao remover servico";
      error(message);
    } finally {
      setDeleting(false);
    }
  };

  const totalActive = useMemo(
    () => services.filter((service) => service.isActive).length,
    [services],
  );

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="p-8 space-y-6 text-white">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-gray-400">
            Gestao de servicos
          </p>
          <h1 className="text-3xl font-semibold">Servicos cadastrados</h1>
          <p className="text-gray-300">
            Crie, atualize ou desative servicos padrao utilizados nos fluxos.
          </p>
        </div>
        <Button onClick={() => openModal()} className="rounded-xl px-6">
          Novo servico
        </Button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 flex items-center justify-between text-sm text-gray-300">
        <span>Total: {services.length}</span>
        <span>Ativos: {totalActive}</span>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-10 text-center text-gray-300">
          Carregando servicos...
        </div>
      ) : services.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/20 bg-black/20 p-10 text-center text-gray-400">
          Nenhum servico cadastrado ainda.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {services.map((service) => (
            <div
              key={service.id}
              className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-6 space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    {service.name}
                    <span
                      className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full ${
                        service.isActive
                          ? "bg-emerald-500/10 text-emerald-200 border border-emerald-500/40"
                          : "bg-gray-500/10 text-gray-300 border border-gray-500/40"
                      }`}
                    >
                      {service.isActive ? "Ativo" : "Inativo"}
                    </span>
                  </h2>
                  <p className="text-sm text-gray-300 mt-1">
                    {service.description}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openModal(service)}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    <span className="sr-only">Editar servico</span>
                    <svg
                      className="w-4 h-4 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536M4 21l4.586-1.172a2 2 0 00.97-.545l9.879-9.88a2 2 0 000-2.828l-1.414-1.414a2 2 0 00-2.828 0l-9.88 9.879a2 2 0 00-.545.97L4 21z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => setDeleteTarget(service)}
                    className="p-2 rounded-lg bg-white/10 hover:bg-red-500/30 transition-colors"
                  >
                    <span className="sr-only">Remover servico</span>
                    <svg
                      className="w-4 h-4 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 7h12M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m1 0v12a2 2 0 01-2 2H8a2 2 0 01-2-2V7h12z"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {service.priceRanges.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs uppercase text-gray-400">
                    Faixas cadastradas
                  </p>
                  <div className="space-y-2">
                    {service.priceRanges
                      .sort((a, b) => a.minQuantity - b.minQuantity)
                      .map((range, index, array) => {
                        const isReclamacao = service.name.toLowerCase().includes('reclamacao');
                        const isFirstRange = index === 0;
                        const isSecondRange = index === 1;
                        
                        // Assuming the first range is the base tier (e.g., 1-10)
                        const firstRangeMax = array[0]?.maxQuantity ?? 10;
                        const firstRangePrice = array[0]?.unitPrice ?? 40;

                        return (
                          <div
                            key={range.id}
                            className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2"
                          >
                            <div className="flex flex-col gap-1 text-xs text-gray-400">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <span>
                                  {saleTypeLabels[range.saleType]} ·{" "}
                                  {formatQuantityRange(
                                    range.minQuantity,
                                    range.maxQuantity,
                                  )}
                                </span>
                                <span>
                                  Vigencia:{" "}
                                  {dateFormatter.format(
                                    new Date(range.effectiveFrom),
                                  )}
                                </span>
                              </div>
                            </div>
                            <p className="text-lg font-semibold">
                              {currencyFormatter.format(range.unitPrice)}
                            </p>
                            {isReclamacao && isFirstRange && (
                              <p className="text-xs text-blue-300">
                                Valor por unidade (unitário)
                              </p>
                            )}
                            {isReclamacao && isSecondRange && (
                              <p className="text-xs text-blue-300">
                                Sendo os {firstRangeMax} primeiros a {currencyFormatter.format(firstRangePrice)} / cada.
                              </p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">
                  Nenhuma faixa de preco cadastrada para este servico.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={editingService ? "Editar servico" : "Novo servico"}
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
              form="service-form"
              disabled={saving}
            >
              {saving ? "Salvando..." : editingService ? "Salvar" : "Criar"}
            </Button>
          </div>
        }
      >
        <form id="service-form" className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs uppercase text-gray-400 mb-2">
              Nome do serviço
            </label>
            <input
              type="text"
              name="name"
              placeholder="Nome do servico"
              value={formData.name}
              onChange={handleFormChange}
              required
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs uppercase text-gray-400 mb-2">
              Descrição
            </label>
            <textarea
              name="description"
              placeholder="Descricao do servico"
              value={formData.description}
              onChange={handleFormChange}
              required
              rows={3}
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs uppercase text-gray-400 mb-2">
              SLA (Prazo de resposta)
            </label>
            <input
              type="text"
              name="sla"
              placeholder="Ex: Ate 3 dias uteis"
              value={formData.sla}
              onChange={handleFormChange}
              required
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs uppercase text-gray-400 mb-2">
              Destaques (um por linha)
            </label>
            <textarea
              name="highlights"
              placeholder="Checklist completo de validacao&#10;Garante retorno em ate 72h&#10;Recomendado para casos sensiveis"
              value={formData.highlights}
              onChange={handleFormChange}
              rows={3}
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-300">Faixas de preco</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-xl px-4"
                onClick={handleAddRange}
              >
                Adicionar faixa
              </Button>
            </div>
            <div className="space-y-3">
              {rangeForms.map((range, index) => (
                <div
                  key={`${range.saleType}-${index}`}
                  className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-3"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex-1">
                      <Select
                        label="Tipo de venda"
                        value={range.saleType}
                        onChange={(event: any) =>
                          handleRangeChange(
                            index,
                            "saleType",
                            event.target.value,
                          )
                        }
                        options={saleTypeOptions}
                      />
                    </div>
                    {rangeForms.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRange(index)}
                        className="px-3 py-2 text-xs rounded-xl border border-white/10 text-red-300 hover:bg-red-500/20 transition-colors"
                      >
                        Remover
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs uppercase text-gray-400 mb-1">
                        Quantidade minima
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={range.minQuantity}
                        onChange={(event) =>
                          handleRangeChange(
                            index,
                            "minQuantity",
                            event.target.value,
                          )
                        }
                        className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-2.5 text-white placeholder-gray-400 focus:border-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs uppercase text-gray-400 mb-1">
                        Quantidade maxima
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={range.maxQuantity}
                        onChange={(event) =>
                          handleRangeChange(
                            index,
                            "maxQuantity",
                            event.target.value,
                          )
                        }
                        placeholder="Sem limite"
                        className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-2.5 text-white placeholder-gray-400 focus:border-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs uppercase text-gray-400 mb-1">
                        Valor unitario
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={range.unitPrice}
                        onChange={(event) =>
                          handleRangeChange(
                            index,
                            "unitPrice",
                            event.target.value,
                          )
                        }
                        className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-2.5 text-white placeholder-gray-400 focus:border-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs uppercase text-gray-400 mb-1">
                        Vigencia a partir de
                      </label>
                      <input
                        type="date"
                        value={range.effectiveFrom}
                        onChange={(event) =>
                          handleRangeChange(
                            index,
                            "effectiveFrom",
                            event.target.value,
                          )
                        }
                        className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-2.5 text-white placeholder-gray-400 focus:border-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center cursor-pointer select-none">
            <div className="relative">
              <input
                type="checkbox"
                name="isActive"
                checked={formData.isActive}
                onChange={handleFormChange}
                className="sr-only peer"
              />
              <div
                className="w-5 h-5 rounded backdrop-blur-md bg-white/10 border border-white/20 peer-checked:bg-white/30 transition-all duration-300 flex items-center justify-center"
                style={{
                  boxShadow: formData.isActive
                    ? "0 0 4px rgba(255,255,255,0.3), inset 1px 1px 0.5px rgba(255,255,255,0.8), inset -1px -1px 0.5px rgba(255,255,255,0.6)"
                    : "0 0 4px rgba(0,0,0,0.1), inset 1px 1px 0.5px rgba(255,255,255,0.4), inset -1px -1px 0.5px rgba(255,255,255,0.3)",
                }}
              >
                {formData.isActive && (
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
            <span className="ml-2 text-sm text-gray-300">Servico ativo</span>
          </label>
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Remover servico"
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
            Deseja realmente remover o servico{" "}
            <span className="font-semibold text-white">
              {deleteTarget.name}
            </span>
            ? Esta acao nao pode ser desfeita.
          </p>
        )}
      </Modal>
    </div>
  );
}
