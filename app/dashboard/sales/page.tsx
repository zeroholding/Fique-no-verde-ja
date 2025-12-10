"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";

type SaleStatus = "aberta" | "confirmada" | "cancelada";
type DiscountType = "percentage" | "fixed";
type PaymentMethod = "dinheiro" | "pix" | "cartao_credito" | "cartao_debito" | "boleto";

type SaleItem = {
  id: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountType: DiscountType | null;
  discountValue: number;
  subtotal: number;
  discountAmount: number;
  total: number;
  saleType?: "01" | "02" | "03";
};

type ClientPackage = {
  id: string;
  clientId: string;
  clientName: string;
  serviceId: string;
  serviceName: string;
  availableQuantity: number;
  unitPrice: number;
};

type Sale = {
  id: string;
  clientName: string;
  clientType?: "common" | "package";
  attendantName: string;
  attendantId: string;
  saleDate: string;
  observations: string | null;
  status: SaleStatus;
  paymentMethod: PaymentMethod;
  generalDiscountType: DiscountType;
  generalDiscountValue: number;
  subtotal: number;
  total: number;
  refundTotal?: number;
  commissionAmount?: number;
  items: SaleItem[];
  createdAt: string;
  updatedAt: string;
  saleType?: "01" | "02" | "03";
};

type Client = {
  id: string;
  name: string;
  clientType: "common" | "package";
};

type AttendantOption = {
  value: string;
  label: string;
};

type Service = {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  priceRanges: Array<{
    id: string;
    saleType: "01" | "02";
    minQuantity: number;
    maxQuantity: number | null;
    unitPrice: number;
  }>;
};

const initialForm = {
  clientId: "",
  carrierId: "",
  serviceId: "",
  saleType: "01" as "01" | "02" | "03",
  quantity: 1,
  discountType: "percentage" as DiscountType,
  discountValue: 0,
  observations: "",
  paymentMethod: "pix" as PaymentMethod,
  packageId: "", // Usado quando saleType = "03"
};

const ITEMS_PER_PAGE = 7;

const statusColors = {
  aberta: { bg: "bg-blue-500/20", text: "text-blue-200", border: "border-blue-500/40" },
  confirmada: { bg: "bg-green-500/20", text: "text-green-200", border: "border-green-500/40" },
  cancelada: { bg: "bg-red-500/20", text: "text-red-200", border: "border-red-500/40" },
};

const statusLabels = {
  aberta: "Aberta",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_credito: "Cartão de Crédito",
  cartao_debito: "Cartão de Débito",
  boleto: "Boleto",
};

export default function SalesPage() {
  const { success, error } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [clientPackages, setClientPackages] = useState<ClientPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [viewingSale, setViewingSale] = useState<Sale | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Sale | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Sale | null>(null);
  const [refundTarget, setRefundTarget] = useState<Sale | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundSaving, setRefundSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [attendantFilter, setAttendantFilter] = useState("");
  const [dayType, setDayType] = useState<"" | "weekday" | "non_working">("");
  const [attendants, setAttendants] = useState<AttendantOption[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [sortField, setSortField] = useState<"date" | "client" | "total">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [saleTypeFilter, setSaleTypeFilter] = useState<"" | "common" | "package">("");

  const hasFilters = useMemo(
    () => Boolean(startDate || endDate || serviceFilter || attendantFilter || dayType || saleTypeFilter),
    [startDate, endDate, serviceFilter, attendantFilter, dayType, saleTypeFilter]
  );

  const filteredSales = useMemo(() => {
    let result = [...sales];

    const getDayType = (dateString: string) => {
      const d = new Date(dateString);
      const dow = d.getDay(); // 0 dom .. 6 sab
      return dow === 0 || dow === 6 ? "non_working" : "weekday";
    };

    if (startDate) {
      const start = new Date(`${startDate}T00:00:00`);
      result = result.filter((sale) => new Date(sale.saleDate) >= start);
    }
    if (endDate) {
      const end = new Date(`${endDate}T23:59:59.999`);
      result = result.filter((sale) => new Date(sale.saleDate) <= end);
    }
    if (serviceFilter) {
      const selectedService = services.find((s) => s.id === serviceFilter);
      const targetName = selectedService?.name?.toLowerCase() || "";
      result = result.filter((sale) =>
        sale.items?.some((item) => item.productName.toLowerCase() === targetName)
      );
    }
    if (isAdmin && attendantFilter) {
      result = result.filter((sale) => sale.attendantId === attendantFilter);
    }
    if (dayType) {
      result = result.filter((sale) => getDayType(sale.saleDate) === dayType);
    }
    if (saleTypeFilter) {
      result = result.filter((sale) => {
        // Tenta identificar o tipo de cliente (vem da venda ou busca na lista)
        const clientType = sale.clientType || clients.find((c) => c.name === sale.clientName)?.clientType;

        if (saleTypeFilter === "package") {
          // Inclui:
          // 1. Tipos explicitos de pacote (02 - Venda, 03 - Consumo)
          // 2. Tipo 01 (padrao) MAS cliente eh transportadora (Legado/Migracao)
          return (sale.saleType === "02" || sale.saleType === "03") || 
                 (sale.saleType === "01" && clientType === "package");
        } 
        
        if (saleTypeFilter === "common") {
          // Inclui apenas Tipo 01 (Comum) E que nao seja de transportadora
          // (Se for transportadora com tipo 01, cai na regra de pacote acima)
          return sale.saleType === "01" && clientType !== "package";
        }

        return true;
      });
    }

    return result;
  }, [attendantFilter, dayType, endDate, isAdmin, sales, serviceFilter, services, startDate, saleTypeFilter, clients]);

  const sortedSales = useMemo(() => {
    const sorted = [...filteredSales];
    sorted.sort((a, b) => {
      if (sortField === "date") {
        return (new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime()) * (sortDirection === "asc" ? 1 : -1);
      }
      if (sortField === "client") {
        return a.clientName.localeCompare(b.clientName) * (sortDirection === "asc" ? 1 : -1);
      }
      return (a.total - b.total) * (sortDirection === "asc" ? 1 : -1);
    });
    return sorted;
  }, [filteredSales, sortField, sortDirection]);

  const totalSalesCopy = useMemo(() => {
    if (sortedSales.length === 0) {
      return "Nenhuma venda cadastrada ainda";
    }

    return `${sortedSales.length} ${
      sortedSales.length === 1 ? "venda encontrada" : "vendas encontradas"
    }`;
  }, [sortedSales.length]);

  const totalPages = Math.ceil(sortedSales.length / ITEMS_PER_PAGE);

  const paginatedSales = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return sortedSales.slice(startIndex, endIndex);
  }, [sortedSales, currentPage]);

  const fetchSales = useCallback(async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (isAdmin && attendantFilter) {
        params.set("attendantId", attendantFilter);
      }
      const response = await fetch(`/api/sales?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Nao foi possivel carregar as vendas");
      }

      setSales(data.sales || []);
      setCurrentPage(1);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao carregar vendas";
      error(message);
    } finally {
      setLoading(false);
    }
  }, [attendantFilter, error, isAdmin]);

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

      const data = await response.json();

      if (response.ok) {
        setClients(
          data.clients.map((c: any) => ({
            id: c.id,
            name: c.name,
            clientType:
              c.client_type === "package" || c.clientType === "package"
                ? "package"
                : "common",
          }))
        );
      }
    } catch (err) {
      console.error("Erro ao carregar clientes:", err);
    }
  }, []);

  const fetchServices = useCallback(async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      return;
    }

    try {
      const response = await fetch("/api/services", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setServices(
          data.services.map((s: any) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            basePrice: s.basePrice,
            priceRanges: s.priceRanges || [],
          }))
        );
      }
    } catch (err) {
      console.error("Erro ao carregar servicos:", err);
    }
  }, []);

  const fetchAttendants = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.users)) {
        setAttendants(
          data.users.map((u: any) => ({
            value: u.id,
            label: `${u.first_name} ${u.last_name}`.trim() || u.email,
          }))
        );
      }
    } catch (err) {
      console.error("Erro ao carregar atendentes:", err);
    }
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setIsAdmin(false);
      return;
    }
    try {
      const response = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok && data.user) {
        const adminFlag = Boolean(data.user.is_admin);
        setIsAdmin(adminFlag);
        if (adminFlag) {
          fetchAttendants();
        }
      } else {
        setIsAdmin(false);
      }
    } catch (err) {
      console.error("Erro ao carregar usuario atual:", err);
      setIsAdmin(false);
    }
  }, [fetchAttendants]);

  const fetchClientPackages = useCallback(async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      return;
    }

    try {
      const response = await fetch("/api/packages", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      console.log("[SALES PAGE] Packages fetched:", data.packages?.length || 0);
      console.log("[SALES PAGE] Packages data:", data.packages);

      if (response.ok) {
        setClientPackages(
          (data.packages || []).map((p: any) => ({
            id: p.id,
            clientId: p.clientId ?? p.client_id,
            clientName: p.clientName ?? p.client_name,
            serviceId: p.serviceId ?? p.service_id,
            serviceName: p.serviceName ?? p.service_name,
            availableQuantity: Number(p.availableQuantity ?? p.available_quantity ?? 0),
            unitPrice: Number(p.unitPrice ?? p.unit_price ?? 0),
          }))
        );
      }
    } catch (err) {
      console.error("Erro ao carregar pacotes:", err);
    }
  }, []);

  useEffect(() => {
    fetchSales();
    fetchClients();
    fetchServices();
    fetchClientPackages();
    fetchCurrentUser();
  }, [fetchSales, fetchClients, fetchServices, fetchClientPackages, fetchCurrentUser]);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = event.target;
    if (name === "saleType") {
      setFormData((prev) => ({
        ...prev,
        saleType: value as "01" | "02" | "03",
        clientId: "",
        carrierId: "",
        packageId: "",
        serviceId: "",
      }));
      return;
    }
    if (name === "carrierId") {
      setFormData((prev) => ({
        ...prev,
        carrierId: value,
        clientId: prev.saleType === "02" ? value : prev.clientId,
        packageId: prev.saleType === "03" ? "" : prev.packageId,
      }));
      return;
    }
    if (name === "clientId") {
      setFormData((prev) => ({
        ...prev,
        clientId: value,
        packageId: prev.saleType === "03" ? "" : prev.packageId,
      }));
      return;
    }
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const toggleSort = (field: "date" | "client" | "total") => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
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

  const openRefundModal = (sale: Sale) => {
    setRefundTarget(sale);
    setRefundAmount(String(sale.total ?? 0));
    setRefundReason("");
  };

  const closeRefundModal = () => {
    setRefundTarget(null);
    setRefundAmount("");
    setRefundReason("");
  };

  const selectedService = useMemo(() => {
    return services.find((s) => s.id === formData.serviceId);
  }, [services, formData.serviceId]);

  const carriers = useMemo(
    () => clients.filter((client) => client.clientType === "package"),
    [clients]
  );

  const commonClients = useMemo(
    () => clients.filter((client) => client.clientType !== "package"),
    [clients]
  );

  const clientOptions = useMemo(() => commonClients, [commonClients]);

  const availablePackages = useMemo(() => {
    if (formData.saleType !== "03" || !formData.carrierId) {
      console.log("[SALES PAGE] availablePackages: returning empty (saleType or carrierId missing)", {
        saleType: formData.saleType,
        carrierId: formData.carrierId,
      });
      return [];
    }

    console.log("[SALES PAGE] Filtering packages for carrierId:", formData.carrierId);
    console.log("[SALES PAGE] Total packages:", clientPackages.length);

    const filtered = clientPackages.filter((pkg) => {
      const matches = pkg.clientId === formData.carrierId && pkg.availableQuantity > 0;
      if (matches) {
        console.log("[SALES PAGE] Package matches:", pkg);
      }
      return matches;
    });

    console.log("[SALES PAGE] Filtered packages:", filtered.length);

    return filtered;
  }, [clientPackages, formData.saleType, formData.carrierId]);

  const selectedPackage = useMemo(() => {
    if (formData.saleType !== "03" || !formData.packageId) return null;
    return clientPackages.find((p) => p.id === formData.packageId);
  }, [clientPackages, formData.saleType, formData.packageId]);

  const calculateProgressivePrice = useCallback(
    (qty: number, serviceName: string, ranges: Array<{saleType: "01" | "02"; minQuantity: number; maxQuantity: number | null; unitPrice: number}>): number => {
      const saleType = formData.saleType;
      let applicableRanges = ranges
        .filter((r) => r.saleType === saleType)
        .sort((a, b) => a.minQuantity - b.minQuantity);

      if (applicableRanges.length === 0) {
        applicableRanges = ranges
          .filter((r) => r.saleType === "01")
          .sort((a, b) => a.minQuantity - b.minQuantity);
      }

      if (applicableRanges.length === 0) {
        return 0;
      }

      const normalizedName = serviceName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const isReclamacao = normalizedName.includes("reclamacao");

      if (isReclamacao) {
        const firstRange = applicableRanges.find(r => r.minQuantity === 1 || r.minQuantity <= 10);
        const secondRange = applicableRanges.find(r => r.minQuantity >= 11);

        const firstRangePrice = firstRange?.unitPrice || 40;
        const secondRangePrice = secondRange?.unitPrice || 15;

        if (qty <= 10) {
          return qty * firstRangePrice;
        } else {
          return (qty - 10) * secondRangePrice + (10 * firstRangePrice);
        }
      } else {
        const range = applicableRanges.find(
          (r) =>
            qty >= r.minQuantity &&
            (r.maxQuantity === null || qty <= r.maxQuantity)
        );

        return range ? qty * range.unitPrice : 0;
      }
    },
    [formData.saleType]
  );

  const modalSubtotal = useMemo(() => {
    if (formData.saleType === "03" && selectedPackage) {
      return selectedPackage.unitPrice * formData.quantity;
    }
    if (!selectedService) return 0;

    return calculateProgressivePrice(
      formData.quantity,
      selectedService.name,
      selectedService.priceRanges
    );
  }, [formData.saleType, formData.quantity, selectedPackage, selectedService, calculateProgressivePrice]);

  const calculateTotal = useMemo(() => {
    if (formData.saleType === "03" && selectedPackage) {
      return selectedPackage.unitPrice * formData.quantity;
    }

    if (!selectedService) return 0;

    const subtotal = calculateProgressivePrice(
      formData.quantity,
      selectedService.name,
      selectedService.priceRanges
    );

    let discount = 0;
    if (formData.discountType === "percentage") {
      discount = subtotal * (formData.discountValue / 100);
    } else {
      discount = formData.discountValue;
    }

    return Math.max(0, subtotal - discount);
  }, [formData.saleType, formData.quantity, formData.discountType, formData.discountValue, selectedPackage, selectedService, calculateProgressivePrice]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (formData.saleType === "03") {
      if (!formData.carrierId) {
        error("Selecione a transportadora (cliente de pacote).");
        return;
      }
      if (!formData.clientId) {
        error("Selecione o cliente final.");
        return;
      }
      if (!formData.packageId) {
        error("Selecione um pacote para consumir");
        return;
      }
      if (!selectedPackage) {
        error("Pacote nao encontrado");
        return;
      }
      if (formData.quantity > selectedPackage.availableQuantity) {
        error(`Quantidade solicitada (${formData.quantity}) excede o saldo disponivel (${selectedPackage.availableQuantity})`);
        return;
      }
    } else {
      if (formData.saleType === "02" && !formData.carrierId) {
        error("Selecione a transportadora (cliente de pacote).");
        return;
      }
      if (!formData.serviceId) {
        error("Selecione um serviço");
        return;
      }
      if (!selectedService) {
        error("Serviço não encontrado");
        return;
      }
    }
    if (formData.quantity <= 0) {
      error("Quantidade deve ser maior que zero");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setSaving(true);

    try {
      let calculatedUnitPrice = 0;
      let calculatedSubtotal = 0;
      let productName = "";

      if (formData.saleType === "03") {
        calculatedUnitPrice = selectedPackage!.unitPrice;
        calculatedSubtotal = selectedPackage!.unitPrice * formData.quantity;
        productName = selectedPackage!.serviceName;
      } else {
        const quantity = formData.quantity;
        const saleType = formData.saleType;
        let relevantRanges = selectedService!.priceRanges
          .filter((range) => range.saleType === saleType)
          .sort((a, b) => a.minQuantity - b.minQuantity);

        if (relevantRanges.length === 0) {
          relevantRanges = selectedService!.priceRanges
            .filter((range) => range.saleType === "01")
            .sort((a, b) => a.minQuantity - b.minQuantity);
        }

        calculatedUnitPrice = selectedService!.basePrice;

        if (relevantRanges.length > 0) {
          const applicableRange = relevantRanges.find(
            (range) =>
              quantity >= range.minQuantity &&
              (range.maxQuantity === null || quantity <= range.maxQuantity)
          );
          if (applicableRange) {
            calculatedUnitPrice = applicableRange.unitPrice;
          } else {
            calculatedUnitPrice = relevantRanges[relevantRanges.length - 1].unitPrice;
          }
        }

        if (calculatedUnitPrice <= 0) {
          calculatedUnitPrice = 1;
        }

        calculatedSubtotal = calculateProgressivePrice(
          formData.quantity,
          selectedService!.name,
          selectedService!.priceRanges
        );

        productName = selectedService!.name;
      }

      const payload: any = {
        clientId:
          formData.saleType === "03"
            ? formData.clientId
            : formData.saleType === "02"
              ? formData.carrierId
              : formData.clientId,
        observations: formData.observations,
        paymentMethod: formData.paymentMethod,
        saleType: formData.saleType,
        generalDiscountType: "percentage" as DiscountType,
        generalDiscountValue: 0,
        items: [
          {
            productId: null,
            productName: productName,
            quantity: formData.quantity,
            unitPrice: calculatedUnitPrice,
            calculatedSubtotal: calculatedSubtotal,
            discountType: formData.saleType === "03" ? "percentage" : formData.discountType,
            discountValue: formData.saleType === "03" ? 0 : formData.discountValue,
          },
        ],
      };

      if (formData.saleType === "03") {
        payload.packageId = formData.packageId;
        payload.serviceId = selectedPackage!.serviceId;
        payload.carrierId = formData.carrierId;
      } else if (formData.saleType === "02") {
        payload.serviceId = formData.serviceId;
        payload.carrierId = formData.carrierId;
      }

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
      await fetchSales();
      closeModal();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao criar venda";
      error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirmTarget) return;

    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setProcessing(true);
    try {
      const response = await fetch("/api/sales/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ saleId: confirmTarget.id }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao confirmar venda");
      }

      success("Venda confirmada com sucesso!");
      setConfirmTarget(null);
      await fetchSales();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao confirmar venda";
      error(message);
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;

    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setProcessing(true);
    try {
      const response = await fetch("/api/sales/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ saleId: cancelTarget.id }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao cancelar venda");
      }

      success("Venda cancelada com sucesso!");
      setCancelTarget(null);
      await fetchSales();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao cancelar venda";
      error(message);
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setProcessing(true);
    try {
      const response = await fetch(`/api/sales/${deleteTarget.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao excluir venda");
      }

      success("Venda excluida permanentemente!");
      setDeleteTarget(null);
      await fetchSales();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao excluir venda";
      error(message);
    } finally {
      setProcessing(false);
    }
  };

  const handleRefund = async () => {
    if (!refundTarget) return;

    const parsedAmount = parseFloat(String(refundAmount).replace(",", "."));
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      error("Informe um valor de estorno valido");
      return;
    }

    const available = refundTarget.total || 0;
    if (parsedAmount > available) {
      error("Valor de estorno maior que o total disponivel para esta venda");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setRefundSaving(true);
    try {
      const response = await fetch("/api/sales/refund", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          saleId: refundTarget.id,
          amount: parsedAmount,
          reason: refundReason,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao registrar estorno");
      }

      success("Estorno registrado com sucesso!");
      closeRefundModal();
      await fetchSales();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao registrar estorno";
      error(message);
    } finally {
      setRefundSaving(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatItemDiscount = (item: SaleItem) => {
    if (!item.discountValue || item.discountValue === 0) {
      return "Sem desconto";
    }

    return item.discountType === "percentage"
      ? `${item.discountValue}%`
      : formatCurrency(item.discountValue);
  };

  const getSaleTypeLabel = (sale: Sale): { type: string; label: string; color: string } => {
    if (sale.saleType) {
      if (sale.saleType === "02") {
        return { type: "02", label: "VENDA DE PACOTE", color: "bg-purple-500/20 text-purple-300 border-purple-500/40" };
      }
      if (sale.saleType === "03") {
        return { type: "03", label: "CONSUMO PACOTE", color: "bg-orange-500/20 text-orange-300 border-orange-500/40" };
      }
      return { type: "01", label: "COMUM", color: "bg-blue-500/20 text-blue-300 border-blue-500/40" };
    }

    const clientType = sale.clientType || clients.find((c) => c.name === sale.clientName)?.clientType;

    if (clientType === "package") {
      return { type: "02", label: "VENDA DE PACOTE", color: "bg-purple-500/20 text-purple-300 border-purple-500/40" };
    }

    return { type: "01", label: "COMUM", color: "bg-blue-500/20 text-blue-300 border-blue-500/40" };
  };

  return (
    <div className="p-8 space-y-6 text-white">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-widest text-gray-400">
          Gestao de vendas
        </p>
        <h1 className="text-3xl font-semibold">Registro de Vendas</h1>
        <p className="text-gray-300">
          Gerencie suas vendas, adicione produtos, aplique descontos e controle o status.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-6 py-4 border-b border-white/10">
          <p className="text-sm text-gray-300">{totalSalesCopy}</p>
          <Button size="sm" onClick={openModal} className="rounded-xl">
            Nova venda
          </Button>
        </div>

        <div className="px-6 py-4 border-b border-white/10 bg-black/20 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-xs uppercase text-gray-400">Data (de)</p>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white text-sm focus:border-white focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs uppercase text-gray-400">Data (ate)</p>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white text-sm focus:border-white focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs uppercase text-gray-400">Serviço</p>
              <select
                value={serviceFilter}
                onChange={(e) => {
                  setServiceFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white text-sm focus:border-white focus:outline-none"
              >
                <option value="">Todos</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </div>
            {isAdmin && (
              <div className="flex flex-col gap-1">
                <p className="text-xs uppercase text-gray-400">Atendente</p>
                <select
                  value={attendantFilter}
                  onChange={(e) => {
                    setAttendantFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white text-sm focus:border-white focus:outline-none"
                >
                  <option value="">Todos</option>
                  {attendants.map((att) => (
                    <option key={att.value} value={att.value}>
                      {att.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <p className="text-xs uppercase text-gray-400">Tipo de Dia</p>
              <select
                value={dayType}
                onChange={(e) => {
                  setDayType(e.target.value as "" | "weekday" | "non_working");
                  setCurrentPage(1);
                }}
                className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white text-sm focus:border-white focus:outline-none"
              >
                <option value="">Todos os dias</option>
                <option value="weekday">Dias úteis (Seg-Sex)</option>
                <option value="non_working">Finais de semana (Sáb-Dom)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs uppercase text-gray-400">Tipo de Venda</p>
              <select
                value={saleTypeFilter}
                onChange={(e) => {
                  setSaleTypeFilter(e.target.value as "" | "common" | "package");
                  setCurrentPage(1);
                }}
                className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white text-sm focus:border-white focus:outline-none"
              >
                <option value="">Todos os tipos</option>
                <option value="common">Vendas Comuns</option>
                <option value="package">Vendas de Pacote</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => toggleSort("date")}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  sortField === "date"
                    ? "border-blue-400/60 bg-blue-500/20 text-blue-100"
                    : "border-white/20 bg-white/5 text-white hover:bg-white/10"
                }`}
              >
                Data {sortField === "date" ? `(${sortDirection.toUpperCase()})` : ""}
              </button>
              <button
                type="button"
                onClick={() => toggleSort("client")}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  sortField === "client"
                    ? "border-blue-400/60 bg-blue-500/20 text-blue-100"
                    : "border-white/20 bg-white/5 text-white hover:bg-white/10"
                }`}
              >
                Cliente {sortField === "client" ? `(${sortDirection.toUpperCase()})` : ""}
              </button>
              <button
                type="button"
                onClick={() => toggleSort("total")}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  sortField === "total"
                    ? "border-blue-400/60 bg-blue-500/20 text-blue-100"
                    : "border-white/20 bg-white/5 text-white hover:bg-white/10"
                }`}
              >
                Valor {sortField === "total" ? `(${sortDirection.toUpperCase()})` : ""}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                  setServiceFilter("");
                  setAttendantFilter("");
                  setDayType("");
                  setSaleTypeFilter("");
                  setSortField("date");
                  setSortDirection("desc");
                  setCurrentPage(1);
                }}
                className="px-4 py-2 text-sm rounded-lg border border-white/20 text-white hover:bg-white/10"
              >
                Limpar filtros
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-10 text-center text-gray-300">
            Carregando vendas...
          </div>
        ) : sortedSales.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-400">
            {hasFilters ? "Nenhuma venda encontrada com os filtros aplicados." : "Ainda nao existem vendas cadastradas."}
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {paginatedSales.map((sale) => {
              const statusColor = statusColors[sale.status];
              return (
                <div
                  key={sale.id}
                  className="px-6 py-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between hover:bg-white/5 transition-colors border-l-2 border-l-transparent hover:border-l-blue-500"
                >
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between md:justify-start gap-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-lg text-white">{sale.clientName}</p>
                        {(() => {
                          const saleTypeInfo = getSaleTypeLabel(sale);
                          return (
                            <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${saleTypeInfo.color}`}>
                              {saleTypeInfo.type} - {saleTypeInfo.label}
                            </span>
                          );
                        })()}
                        {sale.status === "cancelada" && (
                          <span className={`text-[10px] px-2 py-0.5 rounded border font-medium uppercase ${statusColors[sale.status].bg} ${statusColors[sale.status].text} ${statusColors[sale.status].border}`}>
                            CANCELADA
                          </span>
                        )}
                        {(sale.refundTotal ?? 0) > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded border font-medium bg-red-500/20 text-red-300 border-red-500/40">
                            ESTORNO - {formatCurrency(sale.refundTotal ?? 0)}
                          </span>
                        )}
                      </div>
                      <span className="md:hidden font-bold text-emerald-400">{formatCurrency(sale.total)}</span>
                    </div>

                    <div className="mt-2 space-y-1">
                      {sale.items.map((item, idx) => (
                        <div key={idx} className="flex items-center text-sm text-gray-200">
                          <span className="font-medium">{item.productName}</span>
                          <span className="mx-2 text-gray-600">|</span>
                          <span className="text-gray-400 text-xs uppercase tracking-wide">Qtd: {item.quantity}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 mt-2">
                      <span>{sale.attendantName}</span>
                      <span>•</span>
                      <span>{paymentMethodLabels[sale.paymentMethod]}</span>
                      {typeof sale.commissionAmount === "number" && (
                        <>
                          <span>•</span>
                          <span className="text-gray-400">Comissão: {formatCurrency(sale.commissionAmount)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
                    <div className="hidden md:block text-right mr-4">
                      <p className="text-2xl font-bold text-emerald-400">{formatCurrency(sale.total)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{new Date(sale.saleDate).toLocaleDateString("pt-BR")}</p>
                    </div>

                    <div className="md:hidden">
                      <p className="text-xs text-gray-500">{new Date(sale.saleDate).toLocaleDateString("pt-BR")}</p>
                    </div>

                    <div className="flex gap-2 md:ml-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="rounded-full px-4 py-1"
                        onClick={() => setViewingSale(sale)}
                      >
                        Ver detalhes
                      </Button>
                      
                      {isAdmin && (
                         <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full px-2 py-1 text-gray-500 hover:bg-red-500/10 hover:text-red-400"
                            title="Excluir permanentemente"
                            onClick={() => setDeleteTarget(sale)}
                         >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                               <polyline points="3 6 5 6 21 6"></polyline>
                               <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                         </Button>
                      )}

                      {sale.status === "aberta" && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="rounded-full px-4 py-1 bg-green-500/20 border-green-500/40 text-green-200 hover:bg-green-500/30"
                            onClick={() => setConfirmTarget(sale)}
                          >
                            Confirmar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full px-4 py-1 border border-red-500/30 text-red-300 hover:bg-red-500/10"
                            onClick={() => setCancelTarget(sale)}
                          >
                            Cancelar
                          </Button>
                        </>
                      )}
                      {sale.status === "confirmada" && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="rounded-full px-4 py-1 bg-amber-500/20 border-amber-500/40 text-amber-100 hover:bg-amber-500/30"
                            disabled={sale.total <= 0}
                            onClick={() => openRefundModal(sale)}
                          >
                            Estornar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full px-4 py-1 border border-red-500/30 text-red-300 hover:bg-red-500/10"
                            onClick={() => setCancelTarget(sale)}
                          >
                            Cancelar
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ... (Pagination) */}
        {!loading && sortedSales.length > ITEMS_PER_PAGE && (
          <div className="px-6 py-4 border-t border-white/10 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <p className="text-sm text-gray-400">
              Página {currentPage} de {totalPages} • Mostrando {paginatedSales.length} de {sortedSales.length} vendas
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

      {/* Modal Criar Venda */}
      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title="Nova venda"
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
              form="sale-form"
              disabled={saving}
            >
              {saving ? "Salvando..." : "Criar venda"}
            </Button>
          </div>
        }
      >
        <form id="sale-form" className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs uppercase text-gray-400 mb-2">
              Tipo de Venda
            </label>
            <select
              name="saleType"
              value={formData.saleType}
              onChange={handleChange}
              required
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
            >
              <option value="01">01 - Comum (Compra e usa na hora)</option>
              <option value="02">02 - Venda de Pacote (Cliente compra créditos)</option>
              <option value="03">03 - Consumo de Pacote (Cliente usa créditos)</option>
            </select>
          </div>

          {formData.saleType === "01" && (
            <div>
              <label className="block text-xs uppercase text-gray-400 mb-2">
                Cliente
              </label>
              <select
                name="clientId"
                value={formData.clientId}
                onChange={handleChange}
                required
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
              >
                <option value="">Selecione o cliente</option>
                {clientOptions && clientOptions.length > 0 ? (
                  clientOptions.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>Nenhum cliente cadastrado</option>
                )}
              </select>
            </div>
          )}

          {(formData.saleType === "02" || formData.saleType === "03") && (
            <div>
              <label className="block text-xs uppercase text-gray-400 mb-2">
                Transportadora (cliente de pacote)
              </label>
              <select
                name="carrierId"
                value={formData.carrierId}
                onChange={handleChange}
                required
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
              >
                <option value="">Selecione a transportadora</option>
                {carriers && carriers.length > 0 ? (
                  carriers.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>Nenhum cliente de pacote cadastrado</option>
                )}
              </select>
              <p className="text-xs text-gray-400 mt-2">
                Selecione de qual transportadora esta vendendo ou consumindo creditos.
              </p>
            </div>
          )}

          {formData.saleType !== "03" && (
            <div>
              <label className="block text-xs uppercase text-gray-400 mb-2">
                Serviço
              </label>
              <select
                name="serviceId"
                value={formData.serviceId}
                onChange={handleChange}
                required
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
              >
                <option value="">Selecione o serviço</option>
                {services && services.length > 0 ? (
                  services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>Nenhum serviço cadastrado</option>
                )}
              </select>
            </div>
          )}

          {formData.saleType === "03" && (
            <>
              <div>
                <label className="block text-xs uppercase text-gray-400 mb-2">
                  Cliente final
                </label>
                <select
                  name="clientId"
                  value={formData.clientId}
                  onChange={handleChange}
                  required
                  className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
                >
                  <option value="">Selecione o cliente</option>
                  {clientOptions.length > 0 ? (
                    clientOptions.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>Nenhum cliente cadastrado</option>
                  )}
                </select>
              </div>

              {formData.carrierId && (
                <div>
                  <label className="block text-xs uppercase text-gray-400 mb-2">
                    Pacote para Consumir
                  </label>
                  <select
                    name="packageId"
                    value={formData.packageId}
                    onChange={handleChange}
                    required
                    className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
                  >
                    <option value="">Selecione o pacote</option>
                    {availablePackages.length > 0 ? (
                      availablePackages.map((pkg) => (
                        <option key={pkg.id} value={pkg.id}>
                          {pkg.serviceName} ({pkg.availableQuantity} disponíveis) - R$ {pkg.unitPrice.toFixed(2)}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>
                        {clientPackages.filter(p => p.clientId === formData.carrierId).length === 0
                          ? "Esta transportadora não possui pacotes cadastrados"
                          : "Todos os pacotes desta transportadora foram consumidos"}
                      </option>
                    )}
                  </select>

                  {selectedPackage && (
                    <div className="mt-3 p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold text-white">
                          Informações do Pacote
                        </p>
                        <p className="text-xs text-gray-400">
                          Preço unitário: <span className="text-white font-semibold">{formatCurrency(selectedPackage.unitPrice)}</span>
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                          <p className="text-xs text-gray-400 mb-1">Saldo Atual</p>
                          <p className="text-2xl font-bold text-white">
                            {selectedPackage.availableQuantity}
                          </p>
                          <p className="text-xs text-gray-500">unidades disponíveis</p>
                        </div>

                        <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                          <p className="text-xs text-gray-400 mb-1">Após Consumo</p>
                          <p className="text-2xl font-bold text-white">
                            {Math.max(0, selectedPackage.availableQuantity - formData.quantity)}
                          </p>
                          <p className="text-xs text-gray-500">unidades restantes</p>
                        </div>
                      </div>

                      {formData.quantity > selectedPackage.availableQuantity && (
                        <div className="mt-3 p-2 rounded-lg bg-red-500/20 border border-red-500/40">
                          <p className="text-xs text-red-300">
                            ⚠️ Quantidade solicitada ({formData.quantity}) excede o saldo disponível ({selectedPackage.availableQuantity})
                          </p>
                        </div>
                      )}

                      {formData.quantity > 0 && formData.quantity <= selectedPackage.availableQuantity && (
                        <div className="mt-3 p-2 rounded-lg bg-white/10 border border-white/20">
                          <p className="text-xs text-gray-300">
                            Consumirá <span className="font-semibold text-white">{formData.quantity}</span> unidades = <span className="font-semibold text-white">{formatCurrency(selectedPackage.unitPrice * formData.quantity)}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div>
            <label className="block text-xs uppercase text-gray-400 mb-2">
              Quantidade
            </label>
            <input
              type="number"
              name="quantity"
              value={formData.quantity}
              onChange={handleChange}
              min="1"
              required
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
            />
          </div>

          {formData.saleType !== "03" && (
            <div>
              <label className="block text-xs uppercase text-gray-400 mb-2">
                Desconto
              </label>
              <div className="grid grid-cols-3 gap-3">
                <select
                  name="discountType"
                  value={formData.discountType}
                  onChange={handleChange}
                  className="col-span-1 rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
                >
                  <option value="percentage">%</option>
                  <option value="fixed">R$</option>
                </select>
                <input
                  type="number"
                  name="discountValue"
                  value={formData.discountValue}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  placeholder="0"
                  className="col-span-2 rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
                />
              </div>
            </div>
          )}

          {formData.saleType !== "03" && (
            <div>
              <label className="block text-xs uppercase text-gray-400 mb-2">
                Forma de Pagamento
              </label>
              <select
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleChange}
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white focus:border-white focus:outline-none"
              >
                {Object.entries(paymentMethodLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs uppercase text-gray-400 mb-2">
              Observações (opcional)
            </label>
            <textarea
              name="observations"
              placeholder="Observações sobre a venda"
              value={formData.observations}
              onChange={handleChange}
              rows={3}
              className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none resize-none"
            />
          </div>

          <div className="pt-4 border-t border-white/10 space-y-2">
            {selectedService && formData.saleType !== "03" && (
              <>
                <div className="flex justify-between text-sm text-gray-300">
                  <span>Subtotal ({formData.quantity}x {formatCurrency(modalSubtotal / formData.quantity)}):</span>
                  <span>{formatCurrency(modalSubtotal)}</span>
                </div>
                {formData.discountValue > 0 && (
                  <div className="flex justify-between text-sm text-gray-300">
                    <span>Desconto ({formData.discountType === "percentage" ? `${formData.discountValue}%` : formatCurrency(formData.discountValue)}):</span>
                    <span className="text-red-300">
                      -{formatCurrency(
                        formData.discountType === "percentage"
                          ? (modalSubtotal * formData.discountValue) / 100
                          : formData.discountValue
                      )}
                    </span>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-between items-center text-lg font-semibold pt-2 border-t border-white/10">
              <span>Total da Venda:</span>
              <span className="text-green-400">{formatCurrency(calculateTotal)}</span>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(viewingSale)}
        onClose={() => setViewingSale(null)}
        title="Detalhes da venda"
      >
        {viewingSale && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-sm text-gray-400">Cliente</p>
                <p className="font-semibold">{viewingSale.clientName}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-gray-400">Atendente</p>
                <p>{viewingSale.attendantName}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-gray-400">Data da Venda</p>
                <p>{new Date(viewingSale.saleDate).toLocaleDateString("pt-BR")}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-gray-400">Status</p>
                <span
                  className={`inline-block px-3 py-1 rounded-full border text-sm ${statusColors[viewingSale.status].bg} ${statusColors[viewingSale.status].text} ${statusColors[viewingSale.status].border}`}
                >
                  {statusLabels[viewingSale.status]}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-gray-400">Forma de Pagamento</p>
              <p>{paymentMethodLabels[viewingSale.paymentMethod]}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-gray-400">Itens da Venda</p>
              {!viewingSale.items || viewingSale.items.length === 0 ? (
                <p className="text-sm text-gray-500 italic">
                  Nenhum item cadastrado para esta venda.
                </p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {viewingSale.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <p className="font-semibold text-white">{item.productName}</p>
                        <span className="text-xs text-gray-400">Qtd: {item.quantity}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm text-gray-300">
                        <div>
                          <p className="text-xs text-gray-400">Valor unitário (média)</p>
                          <p>{formatCurrency(item.total / item.quantity)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Desconto</p>
                          <p>{formatItemDiscount(item)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Total do item</span>
                        <span className="font-semibold text-white">
                          {formatCurrency(item.total)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {viewingSale.observations && (
              <div className="space-y-2">
                <p className="text-sm text-gray-400">Observações</p>
                <p className="text-gray-300">{viewingSale.observations}</p>
              </div>
            )}

            <div className="pt-4 border-t border-white/10 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Subtotal:</span>
                <span>{formatCurrency(viewingSale.subtotal)}</span>
              </div>
              {viewingSale.refundTotal ? (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Estornos aplicados:</span>
                  <span className="text-red-300">
                    -{formatCurrency(viewingSale.refundTotal)}
                  </span>
                </div>
              ) : null}
              {typeof viewingSale.commissionAmount === "number" ? (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Comissao:</span>
                  <span>{formatCurrency(viewingSale.commissionAmount || 0)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-lg font-semibold">
                <span>Total:</span>
                <span className="text-green-400">{formatCurrency(viewingSale.total)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        title="Confirmar venda"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl px-5"
              onClick={() => setConfirmTarget(null)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="rounded-xl px-6 bg-green-500/30 border border-green-500/50 hover:bg-green-500/50"
              disabled={processing}
              onClick={handleConfirm}
            >
              {processing ? "Confirmando..." : "Confirmar"}
            </Button>
          </div>
        }
      >
        {confirmTarget && (
          <p className="text-sm text-gray-300">
            Deseja realmente confirmar a venda para{" "}
            <span className="font-semibold text-white">{confirmTarget.clientName}</span>?
            Esta acao ira congelar os precos e gerar as comissoes.
          </p>
        )}
      </Modal>

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Cancelar venda"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl px-5"
              onClick={() => setCancelTarget(null)}
            >
              Voltar
            </Button>
            <Button
              size="sm"
              className="rounded-xl px-6 bg-red-500/30 border border-red-500/50 hover:bg-red-500/50"
              disabled={processing}
              onClick={handleCancel}
            >
              {processing ? "Cancelando..." : "Cancelar venda"}
            </Button>
          </div>
        }
      >
        {cancelTarget && (
          <p className="text-sm text-gray-300">
            Deseja realmente cancelar a venda para{" "}
            <span className="font-semibold text-white">{cancelTarget.clientName}</span>?
            {cancelTarget.status === "confirmada" && (
              <span className="block mt-2 text-yellow-300">
                Atenção: Esta venda já foi confirmada. O cancelamento irá estornar as comissões geradas.
              </span>
            )}
          </p>
        )}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Excluir venda permanentemente"
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
              className="rounded-xl px-6 bg-red-600 border border-red-700 hover:bg-red-700 text-white"
              disabled={processing}
              onClick={handleDelete}
            >
              {processing ? "Excluindo..." : "Confirmar Exclusão"}
            </Button>
          </div>
        }
      >
        {deleteTarget && (
          <div className="space-y-3">
            <p className="text-sm text-gray-300">
              ATENÇÃO: Você está prestes a excluir permanentemente a venda para{" "}
              <span className="font-semibold text-white">{deleteTarget.clientName}</span>.
            </p>
            <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 p-3 rounded-lg">
              Esta ação é irreversível e removerá todo o histórico financeiro, comissões e itens relacionados a esta venda.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(refundTarget)}
        onClose={closeRefundModal}
        title="Registrar estorno"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl px-5"
              onClick={closeRefundModal}
            >
              Voltar
            </Button>
            <Button
              size="sm"
              className="rounded-xl px-6 bg-amber-500/30 border border-amber-500/50 hover:bg-amber-500/50"
              disabled={refundSaving}
              onClick={handleRefund}
            >
              {refundSaving ? "Estornando..." : "Confirmar estorno"}
            </Button>
          </div>
        }
      >
        {refundTarget && (
          <div className="space-y-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-gray-400">Cliente</p>
              <p className="font-semibold text-white">{refundTarget.clientName}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <p className="text-xs uppercase text-gray-400">Total disponivel</p>
                <p className="text-lg font-semibold text-white">
                  {formatCurrency(refundTarget.total)}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs uppercase text-gray-400">Estornado ate agora</p>
                <p className="text-lg font-semibold text-white">
                  {formatCurrency(refundTarget.refundTotal || 0)}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase text-gray-400 mb-2">
                Valor do estorno
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                Maximo disponivel: {formatCurrency(refundTarget.total)}
              </p>
            </div>

            <div>
              <label className="block text-xs uppercase text-gray-400 mb-2">
                Motivo (opcional)
              </label>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white placeholder-gray-400 focus:border-white focus:outline-none resize-none"
                placeholder="Descreva o motivo do estorno (opcional)"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}