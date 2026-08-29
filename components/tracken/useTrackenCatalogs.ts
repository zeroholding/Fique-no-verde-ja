"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  PanelAttendant,
  PanelCarrier,
  PanelStatus,
} from "./panel-types";

/**
 * Carrega transportadoras, mapa de status e atendentes.
 *
 * Quase toda tela do painel precisa desses catalogos para montar filtros e
 * badges, entao a busca fica em um lugar so.
 */
export function useTrackenCatalogs(options?: {
  includeInactive?: boolean;
  /** A tela de transportadoras nao precisa da lista de atendentes. */
  withAttendants?: boolean;
}) {
  const includeInactive = options?.includeInactive ?? false;
  const withAttendants = options?.withAttendants ?? true;

  const [carriers, setCarriers] = useState<PanelCarrier[]>([]);
  const [statuses, setStatuses] = useState<PanelStatus[]>([]);
  const [attendants, setAttendants] = useState<PanelAttendant[]>([]);
  const [unassignedOpen, setUnassignedOpen] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const carriersResponse = await fetch(
        `/api/tracken/carriers${includeInactive ? "?includeInactive=true" : ""}`,
        { credentials: "include" }
      );
      const carriersData = await carriersResponse.json();

      if (!carriersResponse.ok) {
        throw new Error(
          carriersData?.error?.message ?? "Falha ao carregar dados de apoio"
        );
      }

      setCarriers(carriersData.carriers as PanelCarrier[]);
      setStatuses(carriersData.statuses as PanelStatus[]);

      if (withAttendants) {
        const attendantsResponse = await fetch("/api/tracken/attendants", {
          credentials: "include",
        });
        const attendantsData = await attendantsResponse.json();

        if (attendantsResponse.ok) {
          setAttendants(attendantsData.attendants as PanelAttendant[]);
          setUnassignedOpen(attendantsData.unassignedOpen as number);
        }
      }

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
  }, [includeInactive, withAttendants]);

  useEffect(() => {
    reload();
  }, [reload]);

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
