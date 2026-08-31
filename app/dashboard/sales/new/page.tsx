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
import {
  calculateServiceSubtotal,
  isProgressiveService,
} from "@/lib/service-pricing";
import { filterAndRankByName } from "@/lib/name-search";

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
  clientType?: string;
  client_type?: string;
};

type ClientsResponse = {
  clients: Client[];
};

type SaleType = "01" | "02" | "03";

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

type AttendantOption = {
  value: string;
  label: string;
};

const initialForm: FormState = {
  clientId: "",
  observations: "",
  paymentMethod: "pix",
  generalDiscountType: "percentage",
  generalDiscountValue: 0,
};

/** Data de hoje no formato yyyy-MM-dd, no fuso de Sao Paulo. */
const getTodayInputValue = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day}`;
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
  "03": "03 - Consumo de Pacote",
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
  const [clientSearch, setClientSearch] = useState("");
  const [packages, setPackages] = useState<any[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  // [FIX] Data da venda passou a ser editavel (retroativo para admin).
  // Antes era um useState sem setter e nem era enviada no payload, entao
  // toda venda gravava a data atual.
  const [saleDateInput, setSaleDateInput] = useState<string>(getTodayInputValue());

  // [FIX] Atribuicao a outro atendente (paridade com o modal rapido).
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [attendants, setAttendants] = useState<AttendantOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [selectedAttendantId, setSelectedAttendantId] = useState<string>("");

  const handleQuickRegister = async (nameToRegister: string) => {
    if (!nameToRegister.trim()) return;
    
    setIsRegistering(true);
    const token = localStorage.getItem("token");
    if (!token) { 
      error("Sessão expirada");
      setIsRegistering(false);
      return; 
    }

    try {
      const response = await fetch("/api/admin/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: nameToRegister }), // Back-end defaults clientType to 'common'
      });

      const data = await response.json();

      if (response.ok && data.client) {
        success(`Cliente '${data.client.name}' cadastrado com sucesso!`);
        
        // Add to local list and select it
        const newClient = {
           id: data.client.id,
           name: data.client.name,
           clientType: "common"
        };
        
        setClients(prev => [newClient, ...prev]); // Prepend to list
        setClientSearch(""); // Clear search to show the new client clearly in the select? Or keep it?
                             // Better: Clear search so the Select shows the selected value properly without filtering issues if name differs slightly
                             // Actually user might want to keep typing, but usually quick register implies selection.
        setFormData(prev => ({ ...prev, clientId: newClient.id }));
        
      } else {
        error(data.error || "Erro ao cadastrar cliente rápido.");
      }
    } catch (err) {
      error("Erro ao conectar com servidor.");
    } finally {
      setIsRegistering(false);
    }
  };

  const selectedServiceDefinition = useMemo(() => {
    return services.find((service) => service.id === selectedService) ?? null;
  }, [selectedService, services]);

  const availableServices = useMemo(
    () => services.filter((service) => service.isActive),
    [services],
  );

  const filteredClients = useMemo(() => {
    const term = clientSearch.trim();
    if (!term) return clients;

    // Era `includes()` sobre a lista como vem de /api/admin/clients, ordenada
    // por created_at DESC: o nome procurado caia onde a data de cadastro
    // mandasse. Agora ordena por relevancia e ignora acento.
    const matches = filterAndRankByName(clients, term, (c) => c.name);

    // [FIX] Mantem o cliente ja selecionado sempre presente nas opcoes.
    // Antes, se o usuario selecionasse um cliente e depois digitasse algo na
    // busca que nao casasse com ele, o cliente saia da lista de opcoes e o
    // campo passava a exibir "Selecione uma opcao" -- dando a impressao de
    // que a selecao havia sido perdida, mesmo com o clientId preenchido.
    if (
      formData.clientId &&
      !matches.some((client) => client.id === formData.clientId)
    ) {
      const selected = clients.find(
        (client) => client.id === formData.clientId,
      );
      if (selected) {
        return [selected, ...matches];
      }
    }

    return matches;
  }, [clientSearch, clients, formData.clientId]);

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

    // [FIX] O tipo 03 (consumo de pacote) NAO possui faixa em
    // service_price_ranges (as faixas so existem para '01' e '02').
    // Antes este efeito comparava o tipo escolhido com os tipos que possuem
    // faixa e, ao selecionar '03', forcava o valor de volta para '01'
    // imediatamente -- tornando o consumo de pacote impossivel nesta tela.
    // Agora o '03' e explicitamente preservado.
    if (saleType === "03") {
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

  // [FIX] Carrega o usuario atual e, se for admin, a lista de atendentes,
  // para permitir atribuir a venda a outra pessoa (paridade com o modal).
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    let active = true;

    const load = async () => {
      try {
        const meRes = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const meData = await meRes.json();
        if (!active || !meRes.ok || !meData.user) return;

        const adminFlag = Boolean(meData.user.is_admin);
        setIsAdmin(adminFlag);
        setCurrentUserId(meData.user.id || "");

        if (!adminFlag) return;

        const usersRes = await fetch("/api/admin/users?active=true", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const usersData = await usersRes.json();
        if (!active || !usersRes.ok || !Array.isArray(usersData.users)) return;

        setAttendants(
          usersData.users.map((u: any) => ({
            value: u.id,
            label: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email,
          })),
        );
      } catch (err) {
        console.error("Erro ao carregar usuario/atendentes:", err);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

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

  const fetchPackages = useCallback(async (currentClientId: string) => {
    const token = localStorage.getItem("token");
    if (!token || !currentClientId) return;

    try {
      const response = await fetch(`/api/packages?clientId=${currentClientId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok && data.packages) {
        setPackages(data.packages);
      } else {
        setPackages([]);
      }
    } catch {
      setPackages([]);
    }
  }, []);

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
            clientType: client.client_type, // Persisting clientType
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

  // Update packages when client changes
  useEffect(() => {
    if (formData.clientId) {
      fetchPackages(formData.clientId);
    } else {
      setPackages([]);
    }
  }, [formData.clientId, fetchPackages]);

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
    }).format(new Date(`${getTodayInputValue()}T12:00:00`));
  }, []);

  const subtotal = useMemo(() => {
    // 03 - Consumo de Pacote (Preco Zero na Venda, abate do pacote)
    if (saleType === "03") {
       return 0; // Consumption doesn't charge the customer again
    }

    if (!selectedServiceDefinition) {
      return 0;
    }

    // Regra centralizada em lib/service-pricing.ts para que esta tela e o
    // modal rapido de /dashboard/sales calculem exatamente igual.
    // Progressivos: Reclamacao e Cancelados. Faixa simples: Atrasos e demais.
    return calculateServiceSubtotal(
      quantity,
      selectedServiceDefinition.name,
      selectedServiceDefinition.priceRanges,
      saleType,
    );
  }, [quantity, selectedServiceDefinition, saleType]);

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
    // [FIX] Unidades de atendimento sao inteiras. Antes usava parseFloat e
    // permitia quantidade fracionada.
    const nextValue = parseInt(event.target.value, 10);
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

  const handlePackageChange = (e: ChangeEvent<HTMLSelectElement>) => {
     setSelectedPackageId(e.target.value);
  }

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

    // Validation for Type 03
    if (saleType === "03") {
       if (!selectedPackageId) {
          error("Selecione um pacote para consumo");
          return;
       }
       // Validate balance
       const pkg = packages.find(p => p.id === selectedPackageId);
       if (pkg && pkg.availableQuantity < quantity) {
          error(`Saldo insuficiente no pacote. Disponivel: ${pkg.availableQuantity}`);
          return;
       }
    } else {
        // Validation for Type 01/02
        if (!selectedServiceDefinition) {
          error("Servico selecionado invalido.");
          return;
        }

        if (!applicablePriceRange) {
          error("Nao ha faixa de preco disponivel para este tipo de venda e quantidade.");
          return;
        }
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
      
      const unitPriceToSend = saleType === "03" ? 0 : applicablePriceRange?.unitPrice || 0;

      const payload = {
        ...formData,
        items: [
          {
            productId: null,
            productName: selectedServiceDefinition?.name || "Servico",
            quantity,
            unitPrice: unitPriceToSend,
            calculatedSubtotal: subtotal,
            discountType: "percentage",
            discountValue: 0,
            saleType,
            priceRangeId: applicablePriceRange?.id || null,
          },
        ],
        serviceId: selectedServiceDefinition?.id,
        saleType,
        // [FIX] Data da venda agora e enviada (permite retroativo).
        // Antes o campo era somente leitura e nao ia no payload, entao o
        // backend sempre gravava a data atual.
        saleDate: saleDateInput,
        // [FIX] Atribuicao a outro atendente (somente admin).
        attendantId: isAdmin && selectedAttendantId ? selectedAttendantId : undefined,
        packageId: saleType === "03" ? selectedPackageId : undefined,
        carrierId: saleType === "03" ? formData.clientId : undefined // For Type 03, clientId IS carrierId
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
    // Hide for Package Consumption
    if (saleType === "03") {
       return (
         <div className="md:col-span-2 rounded-2xl border border-white/10 bg-emerald-500/10 p-4">
            <p className="text-emerald-400 font-medium mb-1">Modo Consumo de Pacote</p>
            <p className="text-xs text-gray-400">O valor será debitado do saldo do pacote selecionado. Não gera cobrança financeira nesta venda.</p>
         </div>
       );
    }

    if (
      !selectedServiceDefinition ||
      selectedServiceDefinition.priceRanges.length === 0
    ) {
      return null;
    }

    const isProgressive = isProgressiveService(selectedServiceDefinition.name);
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

  // Filter packages for the selected service
  const availablePackages = useMemo(() => {
     if (!selectedService) return [];
     return packages.filter(p => p.serviceId === selectedService);
  }, [packages, selectedService]);

  return (
    <div className="px-4 py-6 sm:p-8 space-y-6 text-white overflow-x-hidden [&_input[type=number]]:[-moz-appearance:textfield] [&_input[type=number]::-webkit-outer-spin-button]:appearance-none [&_input[type=number]::-webkit-inner-spin-button]:appearance-none">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="text-xs sm:text-sm uppercase tracking-widest text-gray-400">
            Gestao de vendas
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold">Nova Venda</h1>
          <p className="text-sm sm:text-base text-gray-300">
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
            {/* [FIX] Data da venda agora e editavel (retroativo). */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Data da venda {isAdmin && <span className="text-purple-300 text-xs">(retroativo)</span>}
              </label>
              <input
                type="date"
                value={saleDateInput}
                max={getTodayInputValue()}
                onChange={(event) => setSaleDateInput(event.target.value)}
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                Padrao: hoje ({formattedSaleDate}).
              </p>
            </div>

            {/* [FIX] Atribuir venda a outro atendente (apenas admin). */}
            {isAdmin && attendants.length > 0 && (
              <div className="md:col-span-2 rounded-xl bg-orange-500/10 border border-orange-500/30 p-3">
                <Select
                  label="Atribuir venda ao atendente"
                  value={selectedAttendantId}
                  onChange={(event: any) => setSelectedAttendantId(event.target.value)}
                  options={[
                    { value: "", label: "Eu mesmo (padrao)" },
                    ...attendants.map((att) => ({
                      value: att.value,
                      label: att.value === currentUserId ? `${att.label} (Eu)` : att.label,
                    })),
                  ]}
                />
                <p className="text-xs text-orange-200/80 mt-1">
                  A comissao sera gerada para o atendente selecionado.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">
                Cliente *
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Filtrar ou digitar nome para cadastro rapido..."
                  value={clientSearch}
                  onChange={(event) => setClientSearch(event.target.value)}
                  className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-2.5 text-white placeholder-gray-400 focus:border-white focus:outline-none"
                />
                {clientSearch.length > 2 && !filteredClients.some(c => c.name.toLowerCase() === clientSearch.toLowerCase()) && (
                  <Button
                    type="button"
                    onClick={() => handleQuickRegister(clientSearch)}
                    disabled={isRegistering}
                    className="whitespace-nowrap bg-emerald-600 hover:bg-emerald-500 text-white px-4 rounded-xl text-sm"
                  >
                    {isRegistering ? "..." : "+ Rápido"}
                  </Button>
                )}
              </div>
              {/* [FIX] Busca habilitada dentro do proprio dropdown.
                  Antes so existia o input externo (usado para o cadastro
                  rapido), e nao era possivel pesquisar ao abrir a lista --
                  com muitos clientes cadastrados ficava inviavel achar. */}
              <Select
                name="clientId"
                value={formData.clientId}
                onChange={handleChange}
                required
                searchable
                searchPlaceholder="Digite para buscar cliente..."
                options={filteredClients.map((client) => ({
                  value: client.id,
                  label: client.clientType === 'package' 
                         ? `${client.name} (Transportadora)` 
                         : client.name
                }))}
              />
            </div>
            <div>
              <Select
                label="Forma de pagamento *"
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleChange}
                disabled={saleType === "03"} // No payment for package consumption
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
                  setSelectedPackageId("");
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
                disabled={!selectedService}
                options={[
                   ...saleTypeOptions.filter((option) => {
                      if (!selectedServiceDefinition) return true;
                      return selectedServiceDefinition.priceRanges.some(
                        (range) => range.saleType === option.value,
                      );
                   }),
                   // Add '03' option if user has packages for this service
                   ...(availablePackages.length > 0 ? [{ value: "03", label: "03 - Consumo de Pacote" }] : [])
                ]}
              />
              {availablePackages.length === 0 && selectedService && (
                 <p className="text-xs text-gray-500 mt-1">Este cliente nao possui pacotes ativos para este servico.</p>
              )}
            </div>

            {/* PACKAGE SELECTION (Only for Type 03) */}
            {saleType === "03" && (
              <div className="md:col-span-2 bg-emerald-900/20 p-4 rounded-xl border border-emerald-500/30">
                 <Select
                    label="Selecione o Pacote para Consumo *"
                    value={selectedPackageId}
                    onChange={handlePackageChange}
                    required={saleType === "03"}
                    options={availablePackages.map(pkg => ({
                       value: pkg.id,
                       label: `Pacote iniciado em ${new Date(pkg.createdAt).toLocaleDateString("pt-BR")} ${new Date(pkg.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} - Restam ${pkg.availableQuantity} unidades`
                    }))}
                 />
              </div>
            )}

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
              {/* [FIX] Em servico progressivo o preco da faixa nao representa
                  o valor pago por unidade. Antes exibia so a faixa (ex.:
                  R$ 15,00 para 30 un de Reclamacao), o que confundia, ja que
                  o valor medio real era R$ 23,33. Agora o medio e explicitado. */}
              <p className="text-xs text-gray-400 mt-1">
                {saleType === "03"
                  ? "Sem custo (debito de saldo)"
                  : isProgressiveService(selectedServiceDefinition?.name) && quantity > 0 && subtotal > 0
                    ? `Faixa atual. Medio real: ${currencyFormatter.format(subtotal / quantity)} / un.`
                    : "Valor calculado automaticamente."}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Quantidade *
              </label>
              {/* [FIX] Quantidade passou a ser inteira. Antes aceitava
                  fracionado (step 0.01), o que gerava unidades quebradas. */}
              <input
                type="number"
                value={quantity}
                onChange={handleQuantityChange}
                min="1"
                step="1"
                required
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
                placeholder="0"
              />
            </div>

            {/* [FIX] Campo de desconto. A logica de desconto ja existia
                (generalDiscountType/Value e handleDiscountValueChange), mas o
                campo nunca era renderizado -- o desconto era inacessivel
                nesta tela. */}
            {saleType !== "03" && (
              <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Select
                    label="Tipo de desconto"
                    name="generalDiscountType"
                    value={formData.generalDiscountType}
                    onChange={handleChange}
                    options={[
                      { value: "percentage", label: "% (percentual)" },
                      { value: "fixed", label: "R$ (valor fixo)" },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Desconto
                  </label>
                  <input
                    type="number"
                    value={formData.generalDiscountValue}
                    onChange={handleDiscountValueChange}
                    min="0"
                    step="0.01"
                    className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
                    placeholder="0"
                  />
                </div>
              </div>
            )}

            {/* Observacoes */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Observacoes (opcional)
              </label>
              <textarea
                name="observations"
                value={formData.observations}
                onChange={handleChange}
                rows={3}
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
                placeholder="Observacoes sobre a venda"
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
