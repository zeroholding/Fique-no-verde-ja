"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

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
  priceRanges: ServiceRange[];
};

type ServicesResponse = {
  services: Service[];
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
});

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

export default function ServicesPage() {
  const { error } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchServices = useCallback(async () => {
    const token = localStorage.getItem("token");

    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const visibleServices = services.filter((service) => service.isActive);

  return (
    <div className="p-8 space-y-6 text-white">
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-widest text-gray-400">
          Portifolio de servicos
        </p>
        <h1 className="text-3xl font-semibold">Servicos</h1>
        <p className="text-gray-300 max-w-2xl">
          Consulte os servicos padrao oferecidos pelo time e os respectivos
          detalhes operacionais.
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-10 text-center text-gray-300">
          Carregando servicos...
        </div>
      ) : visibleServices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/20 bg-black/20 p-10 text-center text-gray-400">
          Nenhum servico ativo encontrado. Aguarde um administrador liberar as
          opcoes.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {visibleServices.map((service) => (
            <div
              key={service.id}
              className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-6 space-y-4"
            >
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">{service.name}</h2>
                <p className="text-sm text-gray-300">{service.description}</p>
              </div>



              {service.priceRanges.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 uppercase tracking-widest">
                    Faixas de preco
                  </p>
                  <div className="space-y-3">
                    {service.priceRanges
                      .sort((a, b) => a.minQuantity - b.minQuantity)
                      .map((range, index, array) => {
                        const isReclamacao = service.name.toLowerCase().includes('reclamação');
                        const isAtrasos = service.name.toLowerCase().includes('atrasos');
                        const isFirstRange = index === 0;
                        const isThirdRange = index === 2; // 11+ unidades (terceira faixa)

                        const firstRangeMax = array[0]?.maxQuantity ?? 10;
                        const firstRangePrice = array[0]?.unitPrice ?? 40;

                        return (
                          <div
                            key={range.id}
                            className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2"
                          >
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between text-xs text-gray-400">
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
                              <p className="text-lg font-semibold text-white">
                                {currencyFormatter.format(range.unitPrice)}
                                {(isAtrasos || (isReclamacao && isFirstRange)) && (
                                  <span className="text-sm font-normal text-gray-300 ml-2">
                                    Unitário
                                  </span>
                                )}
                              </p>
                              {isReclamacao && isThirdRange && (
                                <p className="text-xs text-blue-300">
                                  {firstRangeMax} primeiros a {currencyFormatter.format(firstRangePrice)} cada. A partir do {firstRangeMax + 1}º, {currencyFormatter.format(range.unitPrice)} cada
                                </p>
                              )}
                            </div>
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
    </div>
  );
}
