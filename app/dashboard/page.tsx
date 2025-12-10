"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/Toast";
import Card from "@/components/Card";
import { Select } from "@/components/Select";

type PeriodTotals = {
  salesCount: number;
  totalValue: number;
  totalUnits: number;
  reclamacoesUnits: number;
  atrasosUnits: number;
  totalCommission: number;
  totalDiscount: number;
  refundTotal: number;
};

type DashboardMetrics = {
  analysisPeriodDays: number;
  analysisRange: {
    startDate: string;
    endDate: string;
  } | null;
  periodTotals: PeriodTotals;
  activePackages: number;
  pendingSales: number;
  topServices: Array<{
    name: string;
    count: number;
    total: number;
  }>;
  recentSales: Array<{
    id: string;
    clientName: string;
    total: number;
    status: string;
    saleDate: string;
  }>;
  servicePerformance: Array<{
    name: string;
    totalValue: number;
    totalQuantity: number;
    totalSales: number;
  }>;
  attendantPerformance: {
    attendantName: string;
    totalValue: number;
    totalQuantity: number;
    totalSales: number;
    services: Array<{
      name: string;
      totalValue: number;
      totalQuantity: number;
      totalSales: number;
    }>;
  };
  clientSpending: Array<{
    clientName: string;
    totalValue: number;
    totalQuantity: number;
  }>;
  clientFrequency: Array<{
    clientName: string;
    salesCount: number;
  }>;
};

type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isAdmin: boolean;
};

type ServiceOption = {
  id: string;
  name: string;
  label: string;
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const formatDate = (dateString: string) => {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateString);
  const date = isDateOnly
    ? new Date(`${dateString}T00:00:00`)
    : new Date(dateString);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatServiceLabel = (value: string) => {
  if (!value) return "—";
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.includes("reclamacao")) {
    return "Reclamações";
  }
  if (normalized.includes("atraso")) {
    return "Atrasos";
  }
  return value;
};

export default function Dashboard() {
  const { error } = useToast();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysisPeriod, setAnalysisPeriod] = useState("30");
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selectedService, setSelectedService] = useState("");
  const [attendants, setAttendants] = useState<Array<{ value: string; label: string }>>([]);
  const [attendantFilter, setAttendantFilter] = useState("");
  const [customRangeDraft, setCustomRangeDraft] = useState({
    start: "",
    end: "",
  });
  const [appliedCustomRange, setAppliedCustomRange] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const periodOptions = [
    { label: "7 dias", value: "7" },
    { label: "30 dias", value: "30" },
    { label: "90 dias", value: "90" },
    { label: "180 dias", value: "180" },
  ];

  // Carregar usuário atual
  const fetchCurrentUser = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      error("Sessão expirada. Faça login novamente.");
      return;
    }

    try {
      const response = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = (await response.json()) as {
        user: {
          id: string;
          first_name: string;
          last_name: string;
          email: string;
          is_admin: boolean;
        };
        services?: Array<{ id: string; name: string }>;
      };

      if (!response.ok) {
        throw new Error((data as any).error || "Não foi possível carregar o usuário");
      }

      setCurrentUser({
        id: data.user.id,
        firstName: data.user.first_name,
        lastName: data.user.last_name,
        email: data.user.email,
        isAdmin: data.user.is_admin,
      });
    } catch (err) {
      console.error("Erro ao carregar usuário:", err);
      const message = err instanceof Error ? err.message : "Erro ao carregar usuário";
      error(message);
      setLoading(false);
    }
  }, [error]);

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

      if (!response.ok) {
        throw new Error(data.error || "Erro ao carregar serviços");
      }

      const mapped: ServiceOption[] =
        (data.services ?? []).map((service: any) => ({
          id: service.id,
          name: service.name,
          label: formatServiceLabel(service.name),
        })) ?? [];

      setServices(mapped);
    } catch (err) {
      console.error("Erro ao carregar serviços:", err);
    }
  }, []);

  const fetchAttendants = useCallback(async () => {
    if (!currentUser?.isAdmin) return;
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
    } catch {
      // silencioso
    }
  }, [currentUser?.isAdmin]);

  // Carregar métricas do dashboard
  const fetchDashboardMetrics = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessão expirada. Faça login novamente.");
      return;
    }

    if (analysisPeriod === "custom" && !appliedCustomRange) {
      return;
    }

    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (analysisPeriod === "custom" && appliedCustomRange) {
        params.set("startDate", appliedCustomRange.start);
        params.set("endDate", appliedCustomRange.end);
      } else {
        params.set("periodDays", analysisPeriod);
      }
      if (selectedService) {
        params.set("serviceName", selectedService);
      }
      if (currentUser?.isAdmin && attendantFilter) {
        params.set("attendantId", attendantFilter);
      }

      const response = await fetch(`/api/dashboard/metrics?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao carregar métricas");
      }

      setMetrics(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar dashboard";
      error(message);
    } finally {
      setLoading(false);
    }
  }, [analysisPeriod, appliedCustomRange, selectedService, attendantFilter, error, currentUser?.isAdmin]);

  const handleSelectPeriod = (value: string) => {
    setAnalysisPeriod(value);
    if (value !== "custom") {
      setAppliedCustomRange(null);
    }
  };

  const handleApplyCustomRange = () => {
    if (!customRangeDraft.start || !customRangeDraft.end) {
      error("Preencha data inicial e final para aplicar o período personalizado.");
      return;
    }

    if (new Date(customRangeDraft.start) > new Date(customRangeDraft.end)) {
      error("A data inicial não pode ser maior que a data final.");
      return;
    }

    setAppliedCustomRange({
      start: customRangeDraft.start,
      end: customRangeDraft.end,
    });
    setAnalysisPeriod("custom");
  };

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  useEffect(() => {
    if (currentUser) {
      fetchServices();
      fetchAttendants();
    }
  }, [currentUser, fetchServices, fetchAttendants]);

  useEffect(() => {
    if (currentUser) {
      fetchDashboardMetrics();
    }
  }, [currentUser, fetchDashboardMetrics]);

  const periodTotals = metrics?.periodTotals;
  const refundTotal = periodTotals?.refundTotal ?? 0;
  const analysisRange = metrics?.analysisRange;
  const analysisPeriodDays =
    metrics?.analysisPeriodDays ??
    (analysisPeriod === "custom" && appliedCustomRange
      ? Math.floor(
        (Date.parse(appliedCustomRange.end) -
          Date.parse(appliedCustomRange.start)) /
        (1000 * 60 * 60 * 24),
      ) + 1
      : Number(analysisPeriod));
  const servicePerformanceData = (metrics?.servicePerformance ?? []).map(
    (service) => ({
      ...service,
      displayName: formatServiceLabel(service.name),
    }),
  );
  const attendantServices = (
    metrics?.attendantPerformance?.services ?? []
  ).map((service) => ({
    ...service,
    displayName: formatServiceLabel(service.name),
  }));
  const selectedServiceLabel = selectedService
    ? formatServiceLabel(selectedService)
    : "Todos os serviços";
  const periodDescription = analysisRange
    ? `${formatDate(analysisRange.startDate)} - ${formatDate(analysisRange.endDate)}`
    : `Últimos ${analysisPeriodDays} dias`;
  const clientSpendingData = metrics?.clientSpending ?? [];
  const clientFrequencyData = metrics?.clientFrequency ?? [];
  const attendantName = metrics?.attendantPerformance?.attendantName ?? "Você";

  const maxServiceQuantity =
    servicePerformanceData.length > 0
      ? Math.max(...servicePerformanceData.map((item) => item.totalQuantity || 0))
      : 1;
  const maxClientQuantity =
    clientSpendingData.length > 0
      ? Math.max(...clientSpendingData.map((item) => item.totalQuantity || 0))
      : 1;
  const maxClientValue =
    clientSpendingData.length > 0
      ? Math.max(...clientSpendingData.map((item) => item.totalValue || 0))
      : 1;
  const maxFrequency =
    clientFrequencyData.length > 0
      ? Math.max(...clientFrequencyData.map((item) => item.salesCount || 0))
      : 1;
  const renderClientSpendingChart = () => {
    if (!clientSpendingData.length) {
      return (
        <p className="text-gray-400 text-sm">
          Sem dados de clientes no período selecionado.
        </p>
      );
    }

    const axisY = 90;
    const chartWidth = 80;
    const chartHeight = 70;
    const baseX = 10;
    const slotWidth = chartWidth / clientSpendingData.length;
    const barWidth = Math.max(slotWidth - 4, 4);
    const linePoints = clientSpendingData
      .map((client, index) => {
        const x = baseX + index * slotWidth + barWidth / 2;
        const ratio = maxClientValue > 0 ? client.totalValue / maxClientValue : 0;
        const y = axisY - ratio * chartHeight;
        return `${x},${y}`;
      })
      .join(" ");

    return (
      <>
        <div className="relative h-64">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            <line
              x1="10"
              y1="90"
              x2="90"
              y2="90"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="0.8"
            />
            <line
              x1="10"
              y1="20"
              x2="10"
              y2="90"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="0.8"
            />
            {clientSpendingData.map((client, index) => {
              const barHeight =
                maxClientQuantity > 0
                  ? (client.totalQuantity / maxClientQuantity) * chartHeight
                  : 0;
              const x =
                baseX + index * slotWidth + (slotWidth - barWidth) / 2;
              const y = axisY - barHeight;
              return (
                <rect
                  key={`spending-bar-${client.clientName}-${index}`}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={1.5}
                  fill="rgba(59,130,246,0.65)"
                />
              );
            })}
            {linePoints && (
              <polyline
                fill="none"
                stroke="rgb(16,185,129)"
                strokeWidth={1.5}
                points={linePoints}
              />
            )}
            {clientSpendingData.map((client, index) => {
              const ratio = maxClientValue > 0 ? client.totalValue / maxClientValue : 0;
              const x = baseX + index * slotWidth + barWidth / 2;
              const y = axisY - ratio * chartHeight;
              return (
                <circle
                  key={`spending-point-${client.clientName}-${index}`}
                  cx={x}
                  cy={y}
                  r={1.5}
                  fill="rgb(16,185,129)"
                  stroke="white"
                  strokeWidth={0.4}
                />
              );
            })}
          </svg>
        </div>
        <div className="mt-4 space-y-2 text-xs text-gray-400">
          {clientSpendingData.map((client, index) => (
            <div
              key={`spending-legend-${client.clientName}-${index}`}
              className="flex items-center justify-between gap-4"
            >
              <span className="text-white truncate">{client.clientName}</span>
              <span>
                {client.totalQuantity} itens · {formatCurrency(client.totalValue)}
              </span>
            </div>
          ))}
        </div>
      </>
    );
  };

  const renderClientFrequencyChart = () => {
    if (!clientFrequencyData.length) {
      return (
        <p className="text-gray-400 text-sm">
          Sem vendas comuns no período selecionado.
        </p>
      );
    }

    const axisY = 90;
    const chartWidth = 80;
    const chartHeight = 70;
    const baseX = 10;
    const slotWidth = chartWidth / clientFrequencyData.length;
    const barWidth = Math.max(slotWidth - 6, 4);

    return (
      <>
        <div className="relative h-64">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            <line
              x1="10"
              y1="90"
              x2="90"
              y2="90"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="0.8"
            />
            <line
              x1="10"
              y1="20"
              x2="10"
              y2="90"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="0.8"
            />
            {clientFrequencyData.map((client, index) => {
              const barHeight =
                maxFrequency > 0
                  ? (client.salesCount / maxFrequency) * chartHeight
                  : 0;
              const x =
                baseX + index * slotWidth + (slotWidth - barWidth) / 2;
              const y = axisY - barHeight;
              return (
                <rect
                  key={`frequency-bar-${client.clientName}-${index}`}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={1.5}
                  fill="rgba(168,85,247,0.7)"
                />
              );
            })}
          </svg>
        </div>
        <div className="mt-4 space-y-2 text-xs text-gray-400">
          {clientFrequencyData.map((client, index) => (
            <div
              key={`frequency-legend-${client.clientName}-${index}`}
              className="flex items-center justify-between gap-4"
            >
              <span className="text-white truncate">{client.clientName}</span>
              <span>{client.salesCount} vendas</span>
            </div>
          ))}
        </div>
      </>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-5 text-white">
          <div className="relative h-24 w-24">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500/30 via-purple-500/20 to-transparent blur-2xl" />
            <div className="absolute inset-2 rounded-full border border-white/15" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-400 border-r-blue-400 animate-spin" />
            <div className="absolute inset-6 rounded-full bg-white/10 backdrop-blur" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-lg font-semibold">Preparando seu dashboard</p>
            <p className="text-sm text-gray-300">Carregando métricas e gráficos...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 space-y-4">
          <div className="space-y-1">
            <p className="text-sm text-gray-400">Bem-vindo(a)</p>
            <h1 className="text-3xl font-bold text-white">
              Olá, {currentUser?.firstName}! 👋
            </h1>
            <p className="text-sm text-gray-400">
              {analysisRange
                ? `Período: ${formatDate(analysisRange.startDate)} - ${formatDate(
                  analysisRange.endDate,
                )}`
                : `Últimos ${analysisPeriodDays} dias`}{" "}
              · Serviço:{" "}
              <span className="font-semibold text-white">
                {selectedServiceLabel}
              </span>
            </p>
          </div>

          {/* Filtros Compactos */}
          <div className="space-y-3">
            {/* Linha Principal - Sempre Visível */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Períodos Rápidos */}
              {periodOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSelectPeriod(option.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${analysisPeriod === option.value
                    ? "bg-white text-black"
                    : "bg-white/10 text-white hover:bg-white/20"
                    }`}
                >
                  {option.label}
                </button>
              ))}

              {/* Separador */}
              <div className="h-6 w-px bg-white/20"></div>

              {/* Filtros rápidos: Hoje / Ontem */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const today = new Date();
                    const start = today.toISOString().slice(0, 10);
                    const end = today.toISOString().slice(0, 10);
                    setCustomRangeDraft({ start, end });
                    setAppliedCustomRange({ start, end });
                    setAnalysisPeriod("custom");
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    appliedCustomRange &&
                    appliedCustomRange.start === appliedCustomRange.end &&
                    appliedCustomRange.start === new Date().toISOString().slice(0, 10)
                      ? "bg-white/20 text-white border border-white/30"
                      : "bg-white/5 text-gray-200 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  Hoje
                </button>
                <button
                  onClick={() => {
                    const today = new Date();
                    const yesterday = new Date(today);
                    yesterday.setDate(today.getDate() - 1);
                    const start = yesterday.toISOString().slice(0, 10);
                    const end = yesterday.toISOString().slice(0, 10);
                    setCustomRangeDraft({ start, end });
                    setAppliedCustomRange({ start, end });
                    setAnalysisPeriod("custom");
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    appliedCustomRange &&
                    appliedCustomRange.start === appliedCustomRange.end &&
                    appliedCustomRange.start ===
                      new Date(Date.now() - 24 * 60 * 60 * 1000)
                        .toISOString()
                        .slice(0, 10)
                      ? "bg-white/20 text-white border border-white/30"
                      : "bg-white/5 text-gray-200 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  Ontem
                </button>
              </div>

              {/* Filtro de Serviço */}
              <div className="min-w-[180px]">
                <Select
                  value={selectedService}
                  onChange={(e: any) => setSelectedService(e.target.value)}
                  options={[
                    { value: "", label: "Todos os serviços" },
                    ...services.map((service) => ({
                      value: service.name,
                      label: service.label
                    }))
                  ]}
                  className="rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-xs"
                />
              </div>

              {/* Filtro de Atendente (admin) */}
              {currentUser?.isAdmin && attendants.length > 0 && (
                <div className="min-w-[200px]">
                  <Select
                    value={attendantFilter}
                    onChange={(e: any) => setAttendantFilter(e.target.value)}
                    options={[{ value: "", label: "Todos os atendentes" }, ...attendants]}
                    className="rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-xs"
                  />
                </div>
              )}

              {/* Separador */}
              <div className="h-6 w-px bg-white/20"></div>

              {/* Toggle Filtros Avançados */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-white/20"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                {showFilters ? 'Ocultar período personalizado' : 'Período personalizado'}
              </button>
            </div>

            {/* Filtros Avançados - Expansível */}
            {showFilters && (
              <div className="flex flex-wrap items-center gap-2 pl-4 border-l-2 border-white/20 animate-in slide-in-from-top-2">
                <span className="text-xs text-gray-400">Datas personalizadas:</span>
                <input
                  type="date"
                  value={customRangeDraft.start}
                  onChange={(e) =>
                    setCustomRangeDraft((prev) => ({
                      ...prev,
                      start: e.target.value,
                    }))
                  }
                  placeholder="Data inicial"
                  className="rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-xs text-white placeholder:text-gray-500 focus:border-white focus:outline-none"
                />
                <span className="text-xs text-gray-500">até</span>
                <input
                  type="date"
                  value={customRangeDraft.end}
                  onChange={(e) =>
                    setCustomRangeDraft((prev) => ({
                      ...prev,
                      end: e.target.value,
                    }))
                  }
                  placeholder="Data final"
                  className="rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-xs text-white placeholder:text-gray-500 focus:border-white focus:outline-none"
                />
                <button
                  onClick={handleApplyCustomRange}
                  disabled={!customRangeDraft.start || !customRangeDraft.end}
                  className="rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 px-4 py-1.5 text-xs font-medium text-white transition-all hover:from-blue-600 hover:to-purple-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:from-gray-500 disabled:to-gray-600"
                >
                  Aplicar período
                </button>
                {appliedCustomRange && (
                  <button
                    onClick={() => {
                      setAppliedCustomRange(null);
                      setCustomRangeDraft({ start: '', end: '' });
                      setAnalysisPeriod('30');
                    }}
                    className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-300 transition-all hover:bg-red-500/30"
                  >
                    Limpar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Cards de Métricas Principais */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          {/* FATURAMENTO BRUTO */}
          <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">Faturamento Bruto</p>
                <p className="text-3xl font-bold text-white">
                  {formatCurrency(periodTotals?.totalValue ?? 0)}
                </p>
                <p className="text-sm text-emerald-300 mt-1">{periodDescription}</p>
              </div>
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-emerald-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </Card>

          {/* DESCONTOS + ESTORNOS */}
          <Card className="bg-gradient-to-br from-red-500/10 to-amber-500/10 border-red-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">Descontos + Estornos</p>
                <p className="text-3xl font-bold text-white">
                  {formatCurrency((periodTotals?.totalDiscount ?? 0) + refundTotal)}
                </p>
                <p className="text-sm text-red-200 mt-1">{periodDescription}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Descontos: {formatCurrency(periodTotals?.totalDiscount ?? 0)} • Estornos: {formatCurrency(refundTotal)}
                </p>
              </div>
              <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-red-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 7h10v10" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 17L17 7" />
                </svg>
              </div>
            </div>
          </Card>

          {/* FATURAMENTO LÍQUIDO */}
          <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">Faturamento Líquido</p>
                <p className="text-3xl font-bold text-white">
                  {formatCurrency((periodTotals?.totalValue ?? 0) - (periodTotals?.totalDiscount ?? 0) - refundTotal)}
                </p>
                <p className="text-sm text-green-300 mt-1">{periodDescription}</p>
              </div>
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-green-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </Card>

          {/* COMISSÕES */}
          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">Comissões</p>
                <p className="text-3xl font-bold text-white">
                  {formatCurrency(periodTotals?.totalCommission ?? 0)}
                </p>
                <p className="text-sm text-purple-300 mt-1">{periodDescription}</p>
              </div>
              <div className="w-14 h-14 rounded-full bg-purple-500/20 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-purple-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
          </Card>

          {/* VENDAS */}
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">Vendas</p>
                <p className="text-3xl font-bold text-white">
                  {periodTotals?.salesCount ?? 0}
                </p>
                <p className="text-sm text-blue-300 mt-1">{periodDescription}</p>
              </div>
              <div className="w-14 h-14 rounded-full bg-blue-500/20 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-blue-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
            </div>
          </Card>

          {/* RECLAMAÇÕES & ATRASOS - CARD UNIFICADO */}
          <Card className="bg-gradient-to-br from-orange-500/10 to-amber-600/5 border-orange-500/20">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm text-gray-400 mb-2">Reclamações & Atrasos</p>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-2xl font-bold text-orange-300">
                      {periodTotals?.reclamacoesUnits ?? 0}
                    </p>
                    <p className="text-xs text-gray-400">Reclamações</p>
                  </div>
                  <div className="h-10 w-px bg-white/20"></div>
                  <div>
                    <p className="text-2xl font-bold text-amber-300">
                      {periodTotals?.atrasosUnits ?? 0}
                    </p>
                    <p className="text-xs text-gray-400">Atrasos</p>
                  </div>
                </div>
                <p className="text-sm text-orange-300 mt-2">{periodDescription}</p>
              </div>
              <div className="w-14 h-14 rounded-full bg-orange-500/20 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-orange-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
          </Card>
        </div>



        {/* Performance Avançada */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Performance por Serviço
                </h2>
                <p className="text-xs text-gray-400">
                  Últimos {analysisPeriodDays} dias
                </p>
              </div>
            </div>
            {servicePerformanceData.length > 0 ? (
              <div className="space-y-4">
                {servicePerformanceData.map((service, index) => {
                  const rawProgress =
                    maxServiceQuantity > 0
                      ? (service.totalQuantity / maxServiceQuantity) * 100
                      : 0;
                  const progress =
                    service.totalQuantity > 0
                      ? Math.min(Math.max(rawProgress, 6), 100)
                      : 0;
                  return (
                    <div key={`${service.displayName}-${index}`} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">{service.displayName}</p>
                          <p className="text-xs text-gray-400">
                            {service.totalSales} vendas · {service.totalQuantity} unidades
                          </p>
                        </div>
                        <p className="text-sm text-gray-200">
                          {formatCurrency(service.totalValue)}
                        </p>
                      </div>
                      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-400 to-lime-500"
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">
                Nenhum dado no período selecionado.
              </p>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Meu Desempenho
                </h2>
                <p className="text-xs text-gray-400">
                  {attendantName} · Últimos {analysisPeriodDays} dias
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                <p className="text-xs uppercase text-gray-400">Faturamento</p>
                <p className="text-2xl font-bold text-white mt-2">
                  {formatCurrency(metrics?.attendantPerformance?.totalValue || 0)}
                </p>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                <p className="text-xs uppercase text-gray-400">Qtde de vendas</p>
                <p className="text-2xl font-bold text-white mt-2">
                  {metrics?.attendantPerformance?.totalSales || 0}
                </p>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                <p className="text-xs uppercase text-gray-400">
                  Unidades vendidas
                </p>
                <p className="text-2xl font-bold text-white mt-2">
                  {metrics?.attendantPerformance?.totalQuantity || 0}
                </p>
              </div>
            </div>
            {attendantServices.length > 0 ? (
              <div className="space-y-3">
                {attendantServices.map((service, index) => (
                  <div
                    key={`${service.displayName}-${index}`}
                    className="flex items-center justify-between text-sm text-gray-300 border-b border-white/5 pb-2 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="text-white font-medium">{service.displayName}</p>
                      <p className="text-xs text-gray-500">
                        {service.totalSales} vendas · {service.totalQuantity} unidades
                      </p>
                    </div>
                    <p className="text-sm text-white">
                      {formatCurrency(service.totalValue)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">
                Comece registrando novas vendas para ver seus números aqui.
              </p>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Serviços */}
          <Card>
            <h2 className="text-xl font-semibold text-white mb-4">
              Serviços Mais Vendidos
            </h2>
            {metrics?.topServices && metrics.topServices.length > 0 ? (
              <div className="space-y-3">
                {metrics.topServices.map((service, index) => {
                  const displayName = formatServiceLabel(service.name);
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                          {index + 1}
                        </div>
                        <div>
                          <p className="text-white font-medium">{displayName}</p>
                          <p className="text-xs text-gray-400">{service.count} vendas</p>
                        </div>
                      </div>
                      <p className="text-green-400 font-semibold">
                        {formatCurrency(service.total)}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-400 text-center py-8">
                Nenhum serviço vendido ainda
              </p>
            )}
          </Card>

          {/* Vendas Recentes */}
          <Card>
            <h2 className="text-xl font-semibold text-white mb-4">
              Vendas Recentes
            </h2>
            {metrics?.recentSales && metrics.recentSales.length > 0 ? (
              <div className="space-y-3">
                {metrics.recentSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                  >
                    <div>
                      <p className="text-white font-medium">{sale.clientName}</p>
                      <p className="text-xs text-gray-400">
                        {formatDate(sale.saleDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-semibold">
                        {formatCurrency(sale.total)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-center py-8">
                Nenhuma venda recente
              </p>
            )}
          </Card>
        </div>

        {/* Radar de Clientes */}
        <Card className="mt-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white">Radar de Clientes</h2>
            <p className="text-sm text-gray-400">
              Quantidade x Faturamento · últimos {analysisPeriodDays} dias
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <p className="text-sm text-gray-300 font-semibold mb-2">
                Quantidade (barras) x Valor gasto (linha)
              </p>
              {renderClientSpendingChart()}
            </div>
            <div>
              <p className="text-sm text-gray-300 font-semibold mb-2">
                Frequência de compras por cliente (vendas comuns)
              </p>
              {renderClientFrequencyChart()}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
