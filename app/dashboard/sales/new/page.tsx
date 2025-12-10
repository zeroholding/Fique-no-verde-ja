"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { Select } from "@/components/Select";

type DiscountType = "percentage" | "fixed";
type PaymentMethod =
  | "dinheiro"
  | "pix"
  | "cartao_credito"
  | "cartao_debito"
  | "boleto";

type Client = {
  id: string;
  name: string;
};

type ClientsResponse = {
  clients: Array<{
    id: string;
    name: string;
  }>;
};

type SaleType = "01" | "02";

type ServiceRange = {
  id: string;
  saleType: SaleType;
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
  priceRanges: ServiceRange[];
};

type ServicesResponse = {
  services: Service[];
};

type FormState = {
  clientId: string;
  observations: string;
  paymentMethod: PaymentMethod;
  generalDiscountType: DiscountType;
  generalDiscountValue: number;
};

const initialForm: FormState = {
  clientId: "",
  observations: "",
  paymentMethod: "pix",
  generalDiscountType: "percentage",
  generalDiscountValue: 0,
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_credito: "Cartao de Credito",
  cartao_debito: "Cartao de Debito",
  boleto: "Boleto",
};

const saleTypeOptions: Array<{ value: SaleType; label: string }> = [
  { value: "01", label: "01 - Comum" },
  { value: "02", label: "02 - Pacote" },
];

const saleTypeLabels: Record<SaleType, string> = {
  "01": "01 - Comum",
  "02": "02 - Pacote",
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
});

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const formatQuantity = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

const formatQuantityRange = (min: number, max: number | null) => {
  if (max === null) {
    return `${min}+ unidades`;
  }
  if (min === max) {
    return `${min} unidade${min > 1 ? "s" : ""}`;
  }
  return `${min} - ${max} unidades`;
};

export default function NewSalePage() {
  const router = useRouter();
  const { success, error } = useToast();

  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [formData, setFormData] = useState<FormState>(initialForm);
  const [selectedService, setSelectedService] = useState<string>("");
  const [saleType, setSaleType] = useState<SaleType>("01");
  const [serviceValue, setServiceValue] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [saving, setSaving] = useState(false);
  const [collaboratorName, setCollaboratorName] = useState("Carregando...");
  const [saleDate] = useState(() => new Date());
  const [clientSearch, setClientSearch] = useState("");

  const selectedServiceDefinition = useMemo(() => {
    return services.find((service) => service.id === selectedService) ?? null;
  }, [selectedService, services]);

  const availableServices = useMemo(
    () => services.filter((service) => service.isActive),
    [services],
  );

  const filteredClients = useMemo(() => {
    const term = clientSearch.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((client) =>
      client.name.toLowerCase().includes(term),
    );
  }, [clientSearch, clients]);

  const applicablePriceRange = useMemo(() => {
    if (!selectedServiceDefinition) {
      return null;
    }

    const rangesByType = selectedServiceDefinition.priceRanges
      .filter((range) => range.saleType === saleType)
      .sort((a, b) => b.minQuantity - a.minQuantity);

    const qty = quantity || 0;
    return (
      rangesByType.find(
        (range) =>
          qty >= range.minQuantity &&
          (range.maxQuantity === null || qty <= range.maxQuantity),
      ) ?? null
    );
  }, [selectedServiceDefinition, saleType, quantity]);

  useEffect(() => {
    if (!selectedServiceDefinition) {
      return;
    }

    const availableTypes = Array.from(
      new Set(
        selectedServiceDefinition.priceRanges.map((range) => range.saleType),
      ),
    );

    if (availableTypes.length > 0 && !availableTypes.includes(saleType)) {
      setSaleType(availableTypes[0]);
    }
  }, [selectedServiceDefinition, saleType]);

  useEffect(() => {
    if (applicablePriceRange) {
      setServiceValue(applicablePriceRange.unitPrice);
    } else {
      setServiceValue(0);
    }
  }, [applicablePriceRange]);

  const fetchServices = useCallback(async () => {
    const token = localStorage.getItem("token");

    try {
      const response = await fetch("/api/services", {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : undefined,
      });

      const data = (await response.json()) as ServicesResponse & {
        error?: string;
      };

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
      setServices([]);
    }
  }, [error]);

  const fetchClients = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      return;
    }

    try {
      const response = await fetch("/api/admin/clients", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = (await response.json()) as ClientsResponse;

      if (response.ok && Array.isArray(data.clients)) {
        setClients(
          data.clients.map((client) => ({
            id: client.id,
            name: client.name,
          })),
        );
      }
    } catch (err) {
      console.error("Erro ao carregar clientes:", err);
    }
  }, []);

  useEffect(() => {
    fetchClients();
    fetchServices();
  }, [fetchClients, fetchServices]);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");

    if (!storedUser) {
      setCollaboratorName("Usuario nao identificado");
      return;
    }

    try {
      const parsed = JSON.parse(storedUser);
      const fullName = [parsed.firstName, parsed.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();

      setCollaboratorName(
        fullName || parsed.email || "Usuario nao identificado",
      );
    } catch {
      setCollaboratorName("Usuario nao identificado");
    }
  }, []);

  const formattedSaleDate = useMemo(() => {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(saleDate);
  }, [saleDate]);
  const subtotal = useMemo(() => {
    if (!selectedServiceDefinition) {
      return 0;
    }

    // User feedback: "Atraso" follows standard table (volume discount), only "Reclamacao" is progressive
    const useProgressivePricing = selectedServiceDefinition.name.toLowerCase().includes("reclamacao");

    if (useProgressivePricing) {
      const ranges = selectedServiceDefinition.priceRanges
        .filter((range) => range.saleType === saleType)
        .sort((a, b) => a.minQuantity - b.minQuantity);

      if (ranges.length === 0) return 0;

      // Buscar a faixa de 1-10 unidades
      const firstRange = ranges.find(r => r.minQuantity === 1 || r.minQuantity <= 10);
      // Buscar a faixa de 11+ unidades
      const secondRange = ranges.find(r => r.minQuantity >= 11);

      const firstRangePrice = firstRange?.unitPrice || 40;
      const secondRangePrice = secondRange?.unitPrice || 15;

      // Fórmula progressiva (como IR):
      // Primeiros 10: qty × firstRangePrice
      // A partir do 11º: (qty - 10) × secondRangePrice + (10 × firstRangePrice)
      if (quantity <= 10) {
        return quantity * firstRangePrice;
      } else {
        return (quantity - 10) * secondRangePrice + (10 * firstRangePrice);
      }
    }

    // Standard calculation for other services (including Atraso)
    if (!applicablePriceRange) {
      return 0;
    }

    return quantity * applicablePriceRange.unitPrice;
  }, [applicablePriceRange, quantity, selectedServiceDefinition, saleType]);

  const generalDiscountAmount = useMemo(() => {
    if (!formData.generalDiscountValue || subtotal <= 0) {
      return 0;
    }

    const rawDiscount =
      formData.generalDiscountType === "percentage"
        ? subtotal * (formData.generalDiscountValue / 100)
        : formData.generalDiscountValue;

    return Math.min(rawDiscount, subtotal);
  }, [formData.generalDiscountType, formData.generalDiscountValue, subtotal]);

  const total = useMemo(() => {
    return Math.max(subtotal - generalDiscountAmount, 0);
  }, [generalDiscountAmount, subtotal]);

  const handleChange = (
    event: ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = event.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleQuantityChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = parseFloat(event.target.value);
    setQuantity(Number.isNaN(nextValue) ? 0 : Math.max(nextValue, 0));
  };

  const handleDiscountValueChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = parseFloat(event.target.value);
    setFormData((prev) => ({
      ...prev,
      generalDiscountValue: Number.isNaN(nextValue)
        ? 0
        : Math.max(nextValue, 0),
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formData.clientId) {
      error("Selecione um cliente para a venda");
      return;
    }

    if (!selectedService) {
      error("Selecione um servico");
      return;
    }

    if (!selectedServiceDefinition) {
      error("Servico selecionado invalido.");
      return;
    }

    if (!applicablePriceRange) {
      error(
        "Nao ha faixa de preco disponivel para este tipo de venda e quantidade.",
      );
      return;
    }

    if (quantity <= 0) {
      error("Informe uma quantidade valida");
      return;
    }

    const token = localStorage.getItem("token");

    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setSaving(true);

    try {
      console.log("DEBUG - Valores sendo enviados:");
      console.log("Quantidade:", quantity);
      console.log("Subtotal calculado:", subtotal);
      console.log("Unit Price da faixa:", applicablePriceRange.unitPrice);

      const payload = {
        ...formData,
        items: [
          {
            productId: null,
            productName: selectedServiceDefinition.name,
            quantity,
            unitPrice: applicablePriceRange.unitPrice,
            calculatedSubtotal: subtotal, // Envia o subtotal já calculado corretamente
            discountType: "percentage",
            discountValue: 0,
            saleType,
            priceRangeId: applicablePriceRange.id,
          },
        ],
        serviceId: selectedServiceDefinition.id,
        saleType,
      };

      console.log("Payload completo:", JSON.stringify(payload, null, 2));

      const response = await fetch("/api/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao criar venda");
      }

      success("Venda criada com sucesso!");
      router.push("/dashboard/sales");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao criar venda";
      error(message);
    } finally {
      setSaving(false);
    }
  };

  const renderPriceRanges = () => {
    if (
      !selectedServiceDefinition ||
      selectedServiceDefinition.priceRanges.length === 0
    ) {
      return null;
    }

    const isProgressive = selectedServiceDefinition.name.toLowerCase().includes("reclamacao");
    return (
      <div className="md:col-span-2 rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
        <p className="text-xs uppercase text-gray-400">Faixas cadastradas</p>
        {isProgressive && applicablePriceRange && (
          <div className="px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-300 text-xs">
            <strong>Calculo progressivo:</strong> O valor total e calculado somando o custo de cada faixa atingida.
          </div>
        )}
        <div className="space-y-1 text-sm text-gray-200">
          {selectedServiceDefinition.priceRanges.map((range) => (
            <div
              key={range.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <span>
                {saleTypeLabels[range.saleType]} -{" "}
                {formatQuantityRange(range.minQuantity, range.maxQuantity)}
              </span>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="text-white text-sm font-semibold">
                  {currencyFormatter.format(range.unitPrice)}
                </span>
                <span>
                  Vigencia:{" "}
                  {dateFormatter.format(new Date(range.effectiveFrom))}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 space-y-6 text-white [&_input[type=number]]:[-moz-appearance:textfield] [&_input[type=number]::-webkit-outer-spin-button]:appearance-none [&_input[type=number]::-webkit-inner-spin-button]:appearance-none">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-widest text-gray-400">
            Gestao de vendas
          </p>
          <h1 className="text-3xl font-semibold">Nova Venda</h1>
          <p className="text-gray-300">
            Informe o servico prestado e os detalhes financeiros.
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => router.push("/dashboard/sales")}
          className="rounded-xl"
        >
          Cancelar
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-6 space-y-4">
          <h2 className="text-xl font-semibold mb-4">Informacoes da Venda</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Colaborador
              </label>
              <input
                type="text"
                value={collaboratorName}
                disabled
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Data da venda
              </label>
              <input
                type="text"
                value={formattedSaleDate}
                disabled
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                Cliente *
              </label>
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={clientSearch}
                onChange={(event) => setClientSearch(event.target.value)}
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-2.5 text-white placeholder-gray-400 focus:border-white focus:outline-none"
              />
              <Select
                name="clientId"
                value={formData.clientId}
                onChange={handleChange}
                required
                options={filteredClients.map((client) => ({
                  value: client.id,
                  label: client.name
                }))}
              />
            </div>
            <div>
              <Select
                label="Forma de pagamento *"
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleChange}
                options={Object.entries(paymentMethodLabels).map(([value, label]) => ({
                  value,
                  label
                }))}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-6 space-y-4">
          <h2 className="text-xl font-semibold mb-4">Servico</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Select
                label="Servico *"
                value={selectedService}
                onChange={(event: any) => {
                  setSelectedService(event.target.value);
                  setSaleType("01");
                }}
                required
                disabled={availableServices.length === 0}
                options={availableServices.map((service) => ({
                  value: service.id,
                  label: service.name
                }))}
              />
            </div>
            <div>
              <Select
                label="Tipo de venda *"
                value={saleType}
                onChange={(event: any) =>
                  setSaleType(event.target.value as SaleType)
                }
                disabled={
                  !selectedServiceDefinition ||
                  selectedServiceDefinition.priceRanges.length === 0
                }
                options={saleTypeOptions.filter((option) => {
                  if (!selectedServiceDefinition) return true;
                  return selectedServiceDefinition.priceRanges.some(
                    (range) => range.saleType === option.value,
                  );
                })}
              />
              {!selectedServiceDefinition && (
                <p className="text-xs text-gray-400 mt-1">
                  Selecione um servico para escolher o tipo de venda.
                </p>
              )}
              {selectedServiceDefinition &&
                selectedServiceDefinition.priceRanges.length === 0 && (
                  <p className="text-xs text-amber-300 mt-1">
                    Este servico ainda nao possui faixas cadastradas.
                  </p>
                )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Valor unitario *
              </label>
              <input
                type="number"
                value={serviceValue}
                min="0"
                step="0.01"
                readOnly
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
                placeholder="0,00"
              />
              <p className="text-xs text-gray-400 mt-1">
                Valor calculado automaticamente a partir da faixa de preco
                vigente.
              </p>
              {selectedServiceDefinition && !applicablePriceRange && (
                <p className="text-xs text-amber-300">
                  Nenhuma faixa encontrada para este tipo de venda e quantidade.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Quantidade *
              </label>
              <input
                type="number"
                value={quantity}
                onChange={handleQuantityChange}
                min="0.01"
                step="0.01"
                required
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
                placeholder="0"
              />
            </div>
          </div>
          {renderPriceRanges()}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-6 space-y-4">
          <h2 className="text-xl font-semibold mb-4">Resumo</h2>
          <div className="space-y-3">
            <div className="flex justify-between text-gray-300">
              <span>Servico</span>
              <span>
                {selectedServiceDefinition
                  ? selectedServiceDefinition.name
                  : "Selecione um servico"}
              </span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Tipo de venda</span>
              <span>{saleTypeLabels[saleType]}</span>
            </div>
            {applicablePriceRange && (
              <div className="flex justify-between text-gray-300">
                <span>Vigencia</span>
                <span>
                  {dateFormatter.format(
                    new Date(applicablePriceRange.effectiveFrom),
                  )}
                </span>
              </div>
            )}
            <div className="flex justify-between text-gray-300">
              <span>Quantidade</span>
              <span>{formatQuantity(quantity)}</span>
            </div>
            {selectedService && (
              <>
                <div className="flex justify-between text-sm text-gray-300">
                  <span>Subtotal:</span>
                  <span>{currencyFormatter.format(subtotal)}</span>
                </div>
                {formData.generalDiscountValue > 0 && (
                  <div className="flex justify-between text-sm text-gray-300">
                    <span>
                      Desconto (
                      {formData.generalDiscountType === "percentage"
                        ? `${formData.generalDiscountValue}%`
                        : currencyFormatter.format(formData.generalDiscountValue)}
                      ):
                    </span>
                    <span className="text-rose-300">
                      -
                      {currencyFormatter.format(
                        formData.generalDiscountType === "percentage"
                          ? (subtotal * formData.generalDiscountValue) / 100
                          : formData.generalDiscountValue
                      )}
                    </span>
                  </div>
                )}
              </>
            )}
            <div className="pt-3 border-t border-white/10">
              <div className="flex justify-between items-center text-2xl font-bold">
                <span>Total</span>
                <span className="text-green-400">
                  {currencyFormatter.format(total)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push("/dashboard/sales")}
            className="rounded-xl px-6"
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={saving} className="rounded-xl px-8">
            {saving ? "Criando venda..." : "Criar Venda"}
          </Button>
        </div>
      </form>
    </div>
  );
}
