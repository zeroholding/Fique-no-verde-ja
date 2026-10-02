"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TrackenEnvironment } from "@/lib/tracken/types";
import type {
  PanelAttendant,
  PanelCarrier,
  PanelStatus,
} from "./panel-types";

/**
 * Carrega catalogos globais e suas contagens dentro de UM ambiente.
 *
 * Carrier/status continuam compartilhados, mas total_tickets/open_tickets e
 * atendentes precisam do mesmo recorte da fila. Generation + AbortController
 * impedem uma resposta lenta de production de sobrescrever sandbox (ou vice-
 * versa) depois que o seletor mudou.
 */
export function useTrackenCatalogs(options: {
  environment: TrackenEnvironment;
  includeInactive?: boolean;
  /** A tela de transportadoras nao precisa da lista de atendentes. */
  withAttendants?: boolean;
}) {
  const { environment } = options;
  const includeInactive = options.includeInactive ?? false;
  const withAttendants = options.withAttendants ?? true;

  const [carriers, setCarriers] = useState<PanelCarrier[]>([]);
  const [statuses, setStatuses] = useState<PanelStatus[]>([]);
  const [attendants, setAttendants] = useState<PanelAttendant[]>([]);
  const [unassignedOpen, setUnassignedOpen] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    const generation = ++generationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);
    setCarriers([]);
    setStatuses([]);
    setAttendants([]);
    setUnassignedOpen(0);

    const params = new URLSearchParams({ environment });
    if (includeInactive) params.set("includeInactive", "true");

    try {
      const requests = [
        fetch(`/api/tracken/carriers?${params.toString()}`, {
          credentials: "include",
          signal: controller.signal,
        }),
      ];
      if (withAttendants) {
        requests.push(
          fetch(`/api/tracken/attendants?environment=${environment}`, {
            credentials: "include",
            signal: controller.signal,
          })
        );
      }

      const [carriersResponse, attendantsResponse] = await Promise.all(requests);
      const carriersData = await carriersResponse.json();
      if (!carriersResponse.ok) {
        throw new Error(
          carriersData?.error?.message ?? "Falha ao carregar dados de apoio"
        );
      }

      let attendantsData: {
        attendants?: PanelAttendant[];
        unassignedOpen?: number;
        error?: { message?: string };
      } | null = null;
      if (attendantsResponse) {
        attendantsData = await attendantsResponse.json();
        if (!attendantsResponse.ok) {
          throw new Error(
            attendantsData?.error?.message ?? "Falha ao carregar atendentes"
          );
        }
      }

      if (generation !== generationRef.current) return;
      setCarriers(carriersData.carriers as PanelCarrier[]);
      setStatuses(carriersData.statuses as PanelStatus[]);
      setAttendants(attendantsData?.attendants ?? []);
      setUnassignedOpen(attendantsData?.unassignedOpen ?? 0);
    } catch (loadError) {
      if (controller.signal.aborted || generation !== generationRef.current) return;
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar dados de apoio"
      );
    } finally {
      if (generation === generationRef.current) setIsLoading(false);
    }
  }, [environment, includeInactive, withAttendants]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    carriers,
    statuses,
    attendants,
    unassignedOpen,
    isLoading,
    error,
    reload,
  };
}
