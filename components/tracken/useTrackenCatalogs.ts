"use client";

import { useCallback, useEffect, useState } from "react";
import type { PanelCarrier, PanelStatus } from "./panel-types";

/**
 * Carrega transportadoras e mapa de status.
 * Quase toda tela do painel precisa desses dois catalogos para montar filtros e
 * badges, entao a busca fica em um lugar so.
 */
export function useTrackenCatalogs(options?: { includeInactive?: boolean }) {
  const includeInactive = options?.includeInactive ?? false;

  const [carriers, setCarriers] = useState<PanelCarrier[]>([]);
  const [statuses, setStatuses] = useState<PanelStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/tracken/carriers${includeInactive ? "?includeInactive=true" : ""}`,
        { credentials: "include" }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error?.message ?? "Falha ao carregar dados de apoio"
        );
      }

      setCarriers(data.carriers as PanelCarrier[]);
      setStatuses(data.statuses as PanelStatus[]);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar dados de apoio"
      );
    } finally {
      setIsLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { carriers, statuses, isLoading, error, reload };
}
