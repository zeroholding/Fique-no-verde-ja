"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PanelFilterState,
  PanelStats,
  PanelTicket,
  SortState,
} from "./panel-types";

/**
 * Carrega a lista de atendimentos e, opcionalmente, as estatisticas.
 *
 * Duas protecoes importantes:
 *
 * 1. Cada carga recebe um numero de geracao. Quando uma resposta chega, ela so
 *    e aplicada se ainda for a mais recente. Sem isso, digitar rapido na busca
 *    fazia a resposta de "47" (menos seletiva e mais lenta) chegar depois da de
 *    "4778" e sobrescrever a tela: a tabela mostrava um resultado e o campo de
 *    busca dizia outro.
 *
 * 2. A requisicao anterior e abortada antes de disparar a nova, para nao ocupar
 *    conexao do banco com trabalho que ja foi descartado.
 */
export function usePanelTickets(options: {
  filters: PanelFilterState;
  sort: SortState;
  page: number;
  pageSize: number;
  withStats?: boolean;
}) {
  const { filters, sort, page, pageSize, withStats = false } = options;

  const [tickets, setTickets] = useState<PanelTicket[]>([]);
  const [stats, setStats] = useState<PanelStats | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);
    if (filters.carrier) params.set("carrier", filters.carrier);
    if (filters.status) params.set("status", filters.status);
    if (filters.deadline && filters.deadline !== "all") {
      params.set("deadline", filters.deadline);
    }
    if (filters.shippingMode) params.set("shippingMode", filters.shippingMode);
    if (filters.attendant) params.set("attendant", filters.attendant);
    if (filters.search) params.set("search", filters.search);
    if (filters.assignedToMe) params.set("assignedToMe", "true");
    return params.toString();
  }, [filters]);

  const load = useCallback(
    async (loadOptions?: { silent?: boolean }) => {
      const generation = ++generationRef.current;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (loadOptions?.silent) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      const listParams = new URLSearchParams(queryString);
      listParams.set("page", String(page));
      listParams.set("pageSize", String(pageSize));
      listParams.set("sortBy", sort.sortBy);
      listParams.set("sortDir", sort.sortDir);

      try {
        const requests: Promise<Response>[] = [
          fetch(`/api/tracken/tickets?${listParams.toString()}`, {
            credentials: "include",
            signal: controller.signal,
          }),
        ];

        if (withStats) {
          requests.push(
            fetch(`/api/tracken/stats?${queryString}`, {
              credentials: "include",
              signal: controller.signal,
            })
          );
        }

        const [ticketsResponse, statsResponse] = await Promise.all(requests);

        const ticketsData = await ticketsResponse.json();
        if (!ticketsResponse.ok) {
          throw new Error(
            ticketsData?.error?.message ?? "Falha ao carregar atendimentos"
          );
        }

        let statsData: PanelStats | null = null;
        if (statsResponse) {
          const parsed = await statsResponse.json();
          if (!statsResponse.ok) {
            throw new Error(
              parsed?.error?.message ?? "Falha ao carregar indicadores"
            );
          }
          statsData = parsed as PanelStats;
        }

        // Resposta atrasada de um filtro antigo: descarta.
        if (generation !== generationRef.current) return;

        setTickets(ticketsData.tickets as PanelTicket[]);
        setTotal(ticketsData.total as number);
        setTotalPages(ticketsData.totalPages as number);
        if (statsData) setStats(statsData);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        if (generation !== generationRef.current) return;

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Falha ao carregar o painel"
        );
      } finally {
        // Somente a carga mais recente pode desligar o indicador, senao uma
        // resposta velha apagava o "carregando" da requisicao em andamento.
        if (generation === generationRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [page, pageSize, queryString, sort.sortBy, sort.sortDir, withStats]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Cancela requisicao pendente ao desmontar a tela.
  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    tickets,
    stats,
    total,
    totalPages,
    isLoading,
    isRefreshing,
    error,
    queryString,
    reload: load,
  };
}
