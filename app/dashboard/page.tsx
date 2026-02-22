"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/Toast";
import Card from "@/components/Card";
import { Select } from "@/components/Select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  ComposedChart,
  Area,
  Cell,
} from "recharts";

type PeriodTotals = {
  salesCount: number;
  totalValue: number;
  totalUnits: number;
  reclamacoesUnits: number;
  reclamacoesVendas: number;
  reclamacoesConsumos: number;
  reclamacoesRevenue: number;     // [NEW]
  reclamacoesSalesCount: number;  // [NEW]
  atrasosUnits: number;
  atrasosVendas: number;
  atrasosConsumos: number;
  atrasosRevenue: number;         // [NEW]
  atrasosSalesCount: number;      // [NEW]
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
  
  const dateStr = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  if (isDateOnly) return dateStr;

  const timeStr = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${dateStr} ${timeStr}`;
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
  const [analysisPeriod, setAnalysisPeriod] = useState("custom");
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selectedService, setSelectedService] = useState("");
  const [attendants, setAttendants] = useState<Array<{ value: string; label: string }>>([]);
  const [attendantFilter, setAttendantFilter] = useState("");
  const [dayTypeFilter, setDayTypeFilter] = useState("");
  const [saleTypeFilter, setSaleTypeFilter] = useState("");


  const getLocalDateString = () => {
    const date = new Date();
    const split = date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).split('/');
    if (split.length === 3) {
      // pt-BR is DD/MM/YYYY, we want YYYY-MM-DD
      return `${split[2]}-${split[1]}-${split[0]}`;
    }
    // Fallback if something fails, though unlikely
    return date.toISOString().slice(0, 10);
  };

  const [customRangeDraft, setCustomRangeDraft] = useState({
    start: getLocalDateString(),
    end: getLocalDateString(),
  });
  const [appliedCustomRange, setAppliedCustomRange] = useState<{
    start: string;
    end: string;
  } | null>({
    start: getLocalDateString(),
    end: getLocalDateString(),
  });
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
      const res = await fetch("/api/admin/users?active=true", {
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
      if (dayTypeFilter) {
        params.set("dayType", dayTypeFilter);
      }
      if (saleTypeFilter) {
        params.set("saleType", saleTypeFilter);
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
  }, [analysisPeriod, appliedCustomRange, selectedService, attendantFilter, dayTypeFilter, saleTypeFilter, error, currentUser?.isAdmin]);

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
  const totalDiscount = periodTotals?.totalDiscount ?? 0;

  // Calculate net revenue (bank data is already correct: discounts are positive)
  const netRevenue = (periodTotals?.totalValue ?? 0) - totalDiscount - refundTotal;
  const avgTicket = periodTotals?.salesCount ? netRevenue / periodTotals.salesCount : 0;

  const reclamacoesRevenue = periodTotals?.reclamacoesRevenue ?? 0;
  const reclamacoesUnits = periodTotals?.reclamacoesUnits ?? 0;
  const reclamacoesSalesCount = periodTotals?.reclamacoesSalesCount ?? 0;
  // Média de qtd por atendimento
  const avgComplaintUnits = reclamacoesSalesCount ? reclamacoesUnits / reclamacoesSalesCount : 0;
  // Média de valor unitário por item removido
  const avgComplaintUnitValue = reclamacoesUnits > 0 ? reclamacoesRevenue / reclamacoesUnits : 0;

  const atrasosRevenue = periodTotals?.atrasosRevenue ?? 0;
  const atrasosUnits = periodTotals?.atrasosUnits ?? 0;
  const atrasosSalesCount = periodTotals?.atrasosSalesCount ?? 0;
  // Média de qtd por atendimento
  const avgDelayUnits = atrasosSalesCount ? atrasosUnits / atrasosSalesCount : 0;
  // Média de valor unitário por item removido
  const avgDelayUnitValue = atrasosUnits > 0 ? atrasosRevenue / atrasosUnits : 0;

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
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-xl border border-white/10 bg-black/60 p-3 backdrop-blur-md shadow-2xl">
          <p className="text-sm font-bold text-white mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-xs text-gray-300">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span>{entry.name}:</span>
              <span className="font-mono text-white ml-auto">
                {entry.name.includes("Receita")
                  ? formatCurrency(entry.value)
                  : `${entry.value} ${entry.name.includes("Atendimentos") ? "atend." : "itens"}`}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderClientSpendingChart = () => {
    if (!clientSpendingData.length) {
      return (
        <p className="text-gray-400 text-sm text-center py-10">
          Sem dados de clientes no período selecionado.
        </p>
      );
    }

    const data = clientSpendingData.map((c) => ({
      name: c.clientName,
      "Remoções Realizadas": c.totalQuantity,
      "Receita Gerada": c.totalValue,
    }));

    return (
      <div className="h-64 sm:h-72 w-full mt-4 min-w-0">
        <ResponsiveContainer width="99%" height="100%">
          <ComposedChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#9ca3af", fontSize: 10 }}
              interval={0}
            />
            <YAxis
              yAxisId="left"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#9ca3af", fontSize: 10 }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#9ca3af", fontSize: 10 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
            <Bar
              yAxisId="left"
              dataKey="Remoções Realizadas"
              fill="url(#barGradient)"
              radius={[4, 4, 0, 0]}
              barSize={30}
              animationDuration={1500}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="Receita Gerada"
              stroke="#10b981"
              strokeWidth={3}
              dot={{ r: 4, fill: "#10b981", strokeWidth: 2, stroke: "#fff" }}
              activeDot={{ r: 6, strokeWidth: 0 }}
              animationDuration={2000}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderClientFrequencyChart = () => {
    if (!clientFrequencyData.length) {
      return (
        <p className="text-gray-400 text-sm text-center py-10">
          Sem atendimentos comuns no período selecionado.
        </p>
      );
    }

    const data = clientFrequencyData.map((c) => ({
      name: c.clientName,
      Atendimentos: c.salesCount,
    }));

    return (
      <div className="h-64 sm:h-72 w-full mt-4 min-w-0">
        <ResponsiveContainer width="99%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
            <defs>
              <linearGradient id="freqGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#a855f7" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#9ca3af", fontSize: 10 }}
            />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "#9ca3af", fontSize: 10 }} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
            <Bar
              dataKey="Atendimentos"
              fill="url(#freqGradient)"
              radius={[4, 4, 0, 0]}
              barSize={40}
              animationDuration={1500}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-6 sm:p-8">
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
    <div className="min-h-screen px-4 py-6 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8 space-y-3 sm:space-y-4">
          <div className="space-y-1 sm:space-y-1 pl-14 sm:pl-0 -mt-12 sm:mt-0">
            <p className="text-xs sm:text-sm text-gray-400">Bem-vindo(a)</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              Olá, {currentUser?.firstName}! 👋
            </h1>
            <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
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
            <div className="flex flex-wrap items-start gap-2 sm:items-center">
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
              <div className="hidden sm:block h-6 w-px bg-white/20"></div>

              {/* Filtros rápidos: Hoje / Ontem */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    const today = new Date();
                    const y = today.getFullYear();
                    const m = String(today.getMonth() + 1).padStart(2, "0");
                    const d = String(today.getDate()).padStart(2, "0");
                    const start = `${y}-${m}-${d}`;
                    const end = `${y}-${m}-${d}`;
                    setCustomRangeDraft({ start, end });
                    setAppliedCustomRange({ start, end });
                    setAnalysisPeriod("custom");
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    appliedCustomRange &&
                    appliedCustomRange.start === appliedCustomRange.end &&
                    appliedCustomRange.start ===
                      (() => {
                        const t = new Date();
                        const y = t.getFullYear();
                        const m = String(t.getMonth() + 1).padStart(2, "0");
                        const d = String(t.getDate()).padStart(2, "0");
                        return `${y}-${m}-${d}`;
                      })()
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
                    const y = yesterday.getFullYear();
                    const m = String(yesterday.getMonth() + 1).padStart(2, "0");
                    const d = String(yesterday.getDate()).padStart(2, "0");
                    const start = `${y}-${m}-${d}`;
                    const end = `${y}-${m}-${d}`;
                    setCustomRangeDraft({ start, end });
                    setAppliedCustomRange({ start, end });
                    setAnalysisPeriod("custom");
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    appliedCustomRange &&
                    appliedCustomRange.start === appliedCustomRange.end &&
                    appliedCustomRange.start ===
                      (() => {
                        const t = new Date();
                        t.setDate(t.getDate() - 1);
                        const y = t.getFullYear();
                        const m = String(t.getMonth() + 1).padStart(2, "0");
                        const d = String(t.getDate()).padStart(2, "0");
                        return `${y}-${m}-${d}`;
                      })()
                      ? "bg-white/20 text-white border border-white/30"
                      : "bg-white/5 text-gray-200 border border-white/10 hover:bg-white/10"
                  }`}
                >
                  Ontem
                </button>
              </div>

              {/* Filtro de Serviço */}
              <div className="w-full sm:min-w-[180px] sm:w-auto">
                <Select
                  value={selectedService}
                  onChange={(e: any) => setSelectedService(e.target.value)}
                  nativeOnMobile
                  options={[
                    { value: "", label: "Todos os serviços" },
                    ...services.map((service) => ({
                      value: service.name,
                      label: service.label
                    }))
                  ]}
                  className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-xs"
                />
              </div>

              {/* Filtro de Atendente (admin) */}
              {currentUser?.isAdmin && attendants.length > 0 && (
                <div className="w-full sm:min-w-[200px] sm:w-auto">
                  <Select
                    value={attendantFilter}
                    onChange={(e: any) => setAttendantFilter(e.target.value)}
                    nativeOnMobile
                    options={[{ value: "", label: "Todos os atendentes" }, ...attendants]}
                    className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-xs"
                  />
                </div>
              )}

              {/* Filtro de Tipo de Dia */}
              <div className="w-full sm:min-w-[150px] sm:w-auto">
                <Select
                  value={dayTypeFilter}
                  onChange={(e: any) => setDayTypeFilter(e.target.value)}
                  nativeOnMobile
                  options={[
                    { value: "", label: "Tipo de Dia: Todos" },
                    { value: "weekday", label: "Dias Úteis" },
                    { value: "non_working", label: "Finais de Semana" },
                  ]}
                  className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-xs"
                />
              </div>

              {/* Filtro de Tipo de Venda/Atendimento */}
              <div className="w-full sm:min-w-[180px] sm:w-auto">
                <Select
                  value={saleTypeFilter}
                  onChange={(e: any) => setSaleTypeFilter(e.target.value)}
                  nativeOnMobile
                  options={[
                    { value: "", label: "Tipo de Venda: Todos" },
                    { value: "common", label: "Venda Comum" },
                    { value: "03", label: "Consumo de Pacote" },
                  ]}
                  className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-xs"
                />
              </div>

              {/* Separador */}
              <div className="hidden sm:block h-6 w-px bg-white/20"></div>

              {/* Toggle Filtros Avançados */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-white/20 sm:w-auto sm:justify-start"
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
              <div className="flex flex-wrap items-start gap-2 border-t border-white/10 pt-3 sm:items-center sm:border-t-0 sm:pl-4 sm:pt-0 sm:border-l-2 border-white/20 animate-in slide-in-from-top-2">
                <span className="w-full text-xs text-gray-400 sm:w-auto">Datas personalizadas:</span>
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
                  className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-xs text-white placeholder:text-gray-500 focus:border-white focus:outline-none sm:w-auto"
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
                  className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-1.5 text-xs text-white placeholder:text-gray-500 focus:border-white focus:outline-none sm:w-auto"
                />
                <button
                  onClick={handleApplyCustomRange}
                  disabled={!customRangeDraft.start || !customRangeDraft.end}
                  className="w-full rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 px-4 py-1.5 text-xs font-medium text-white transition-all hover:from-blue-600 hover:to-purple-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:from-gray-500 disabled:to-gray-600 sm:w-auto"
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
                    className="w-full rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-300 transition-all hover:bg-red-500/30 sm:w-auto"
                  >
                    Limpar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Cards de Métricas Principais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6">
          {/* FATURAMENTO BRUTO */}
          <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
            <div className="flex items-center gap-4 sm:justify-between">
              <div className="flex-1 text-left">
                <p className="text-sm text-gray-400 mb-1">Receita Bruta Gerada</p>
                <p className="text-2xl sm:text-3xl font-bold text-white">
                  {formatCurrency(periodTotals?.totalValue ?? 0)}
                </p>
                <p className="text-sm text-emerald-300 mt-1">{periodDescription}</p>
              </div>
              <div className="order-first sm:order-last w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <svg
                  className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-300"
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
            <div className="flex items-center gap-4 sm:justify-between">
              <div className="flex-1 text-left">
                <p className="text-sm text-gray-400 mb-1">Descontos + Estornos</p>
                <p className="text-2xl sm:text-3xl font-bold text-white">
                  -{formatCurrency(totalDiscount + refundTotal)}
                </p>
                <p className="text-sm text-red-200 mt-1">{periodDescription}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Descontos: {formatCurrency(periodTotals?.totalDiscount ?? 0)} • Estornos: {formatCurrency(refundTotal)}
                </p>
              </div>
              <div className="order-first sm:order-last w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg
                  className="w-7 h-7 sm:w-8 sm:h-8 text-red-300"
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
            <div className="flex items-center gap-4 sm:justify-between">
              <div className="flex-1 text-left">
                <p className="text-sm text-gray-400 mb-1">Receita Líquida Gerada</p>
                <p className="text-2xl sm:text-3xl font-bold text-white">
                  {formatCurrency(netRevenue)}
                </p>
                <div className="flex flex-col mt-1">
                    <p className="text-sm text-green-300">{periodDescription}</p>
                    <p className="text-xs text-green-200/70 mt-0.5">
                        Média: {formatCurrency(avgTicket)} / atendimento
                    </p>
                </div>
              </div>
              <div className="order-first sm:order-last w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg
                  className="w-7 h-7 sm:w-8 sm:h-8 text-green-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </Card>

          {/* ATENDIMENTOS + MÉDIAS DE VALOR UNITÁRIO */}
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
            <div className="flex items-center gap-4 sm:justify-between">
              <div className="flex-1 text-left">
                <p className="text-sm text-gray-400 mb-1">Atendimentos</p>
                <p className="text-2xl sm:text-3xl font-bold text-white">
                  {periodTotals?.salesCount ?? 0}
                </p>
                <p className="text-sm text-blue-300 mt-1">{periodDescription}</p>
                {/* Médias de Valor Unitário por Item Removido */}
                <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Valor Unit. Atraso</p>
                    <p className="text-sm font-semibold text-amber-300">
                      {formatCurrency(avgDelayUnitValue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Valor Unit. Reclamação</p>
                    <p className="text-sm font-semibold text-orange-300">
                      {formatCurrency(avgComplaintUnitValue)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="order-first sm:order-last w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-blue-500/20 flex items-center justify-center">
                <svg
                  className="w-7 h-7 sm:w-8 sm:h-8 text-blue-300"
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
            <div className="flex items-center gap-4 sm:justify-between">
              <div className="flex-1 text-left">
                <p className="text-sm text-gray-400 mb-2">Reclamações & Atrasos</p>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div>
                    <p className="text-xl sm:text-2xl font-bold text-orange-300">
                      {periodTotals?.reclamacoesUnits ?? 0}
                    </p>
                    <p className="text-xs text-gray-400">Reclamações</p>
                    <div className="flex flex-col gap-0.5">
                        <p className="text-[10px] text-gray-500">
                        {periodTotals?.reclamacoesVendas ?? 0} vend. + {periodTotals?.reclamacoesConsumos ?? 0} cons.
                        </p>
                        <p className="text-[10px] text-orange-200/80 font-medium">
                            Média: {avgComplaintUnits.toFixed(1)} un/atendimento
                        </p>
                    </div>
                  </div>
                  <div className="hidden sm:block h-14 w-px bg-white/20"></div>
                  <div>
                    <p className="text-xl sm:text-2xl font-bold text-amber-300">
                      {periodTotals?.atrasosUnits ?? 0}
                    </p>
                    <p className="text-xs text-gray-400">Atrasos</p>
                    <div className="flex flex-col gap-0.5">
                        <p className="text-[10px] text-gray-500">
                        {periodTotals?.atrasosVendas ?? 0} vend. + {periodTotals?.atrasosConsumos ?? 0} cons.
                        </p>
                        <p className="text-[10px] text-amber-200/80 font-medium">
                           Média: {avgDelayUnits.toFixed(1)} un/atendimento
                        </p>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-orange-300 mt-2">{periodDescription}</p>
              </div>
              <div className="order-first sm:order-last w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-orange-500/20 flex items-center justify-center">
                <svg
                  className="w-7 h-7 sm:w-8 sm:h-8 text-orange-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
          </Card>

          {/* COMISSÕES */}
          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
            <div className="flex items-center gap-4 sm:justify-between">
              <div className="flex-1 text-left">
                <p className="text-sm text-gray-400 mb-1">Comissão gerada</p>
                <p className="text-2xl sm:text-3xl font-bold text-white">
                  {formatCurrency(periodTotals?.totalCommission ?? 0)}
                </p>
                <p className="text-sm text-purple-300 mt-1">{periodDescription}</p>
              </div>
              <div className="order-first sm:order-last w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-purple-500/20 flex items-center justify-center">
                <svg
                  className="w-7 h-7 sm:w-8 sm:h-8 text-purple-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
          </Card>
        </div>



        {/* Performance Avançada */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
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
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-white font-medium">{service.displayName}</p>
                          <p className="text-xs text-gray-400">
                            {service.totalSales} atendimentos · {service.totalQuantity} remoções realizadas
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
                  Desempenho
                </h2>
                <p className="text-xs text-gray-400">
                  {attendantName} · Últimos {analysisPeriodDays} dias
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                <p className="text-xs uppercase text-gray-400">Receita Bruta Gerada</p>
                <p className="text-2xl font-bold text-white mt-2">
                  {formatCurrency(metrics?.attendantPerformance?.totalValue || 0)}
                </p>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                <p className="text-xs uppercase text-gray-400">Qtde de atendimentos</p>
                <p className="text-2xl font-bold text-white mt-2">
                  {metrics?.attendantPerformance?.totalSales || 0}
                </p>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/5 p-4">
                <p className="text-xs uppercase text-gray-400">
                  Remoções Realizadas
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
                    className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-gray-300 border-b border-white/5 pb-2 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="text-white font-medium">{service.displayName}</p>
                      <p className="text-xs text-gray-500">
                        {service.totalSales} atendimentos · {service.totalQuantity} remoções realizadas
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
                Comece registrando novos atendimentos para ver seus números aqui.
              </p>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Top Serviços */}
          <Card>
            <h2 className="text-xl font-semibold text-white mb-4">
              Serviços por Atendimento
            </h2>
            {metrics?.topServices && metrics.topServices.length > 0 ? (
              <div className="space-y-3">
                {metrics.topServices.map((service, index) => {
                  const displayName = formatServiceLabel(service.name);
                  return (
                    <div
                      key={index}
                      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                          {index + 1}
                        </div>
                        <div>
                          <p className="text-white font-medium">{displayName}</p>
                          <p className="text-xs text-gray-400">{service.count} atendimentos</p>
                        </div>
                      </div>
                      <p className="text-green-400 font-semibold sm:text-right">
                        {formatCurrency(service.total)}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-400 text-center py-8">
                Nenhum serviço realizado ainda
              </p>
            )}
          </Card>

          {/* Vendas Recentes */}
          <Card>
            <h2 className="text-xl font-semibold text-white mb-4">
              Atendimentos Recentes
            </h2>
            {metrics?.recentSales && metrics.recentSales.length > 0 ? (
              <div className="space-y-3">
                {metrics.recentSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                  >
                    <div>
                      <p className="text-white font-medium">{sale.clientName}</p>
                      <p className="text-xs text-gray-400">
                        {formatDate(sale.saleDate)}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-white font-semibold">
                        {formatCurrency(sale.total)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-center py-8">
                Nenhum atendimento recente
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            <div>
              <p className="text-sm text-gray-300 font-semibold mb-2">
                Quantidade (barras) x Valor gasto (linha)
              </p>
              {renderClientSpendingChart()}
            </div>
            <div>
              <p className="text-sm text-gray-300 font-semibold mb-2">
                Frequência de atendimentos por cliente (atendimentos comuns)
              </p>
              {renderClientFrequencyChart()}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
