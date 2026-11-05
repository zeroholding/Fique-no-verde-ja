"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Filter, Search, Sun, X } from "lucide-react";

import { ADS_PERIOD_PRESETS, type AdsDayRange, type AdsPeriodPreset } from "@/lib/ads/dates";
import type { AdsCampaignOption } from "@/lib/ads/types";

import { Button } from "./ui";

/**
 * Barra de filtros do painel.
 *
 * Tudo que muda o recorte fica aqui, em um lugar só: período, "hoje",
 * campanha, situação e busca. A regra é que o filtro valha para a tela inteira
 * — indicadores, gráfico, tabela e galeria —, então não existe filtro que
 * esconda metade das coisas sem a pessoa ver que está ligado.
 *
 * Os ativos aparecem como etiquetas com "x": sem isso, uma busca esquecida
 * vira "o painel está errado".
 */

export type AdsFilters = {
  preset: AdsPeriodPreset;
  range: AdsDayRange;
  onlyToday: boolean;
  campaignId: string;
  status: string;
  search: string;
};

const STATUS_OPTIONS = [
  { value: "", label: "Todas as situações" },
  { value: "active", label: "Ativos" },
  { value: "paused", label: "Pausados" },
  { value: "archived", label: "Arquivados" },
];

const control =
  "h-9.5 rounded-lg border border-slate-200 bg-white text-[13px] font-semibold text-slate-800 shadow-xs transition-colors hover:border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

export function FilterBar({
  value,
  campaigns,
  currency,
  loading,
  onChange,
}: {
  value: AdsFilters;
  campaigns: AdsCampaignOption[];
  currency: string;
  loading: boolean;
  onChange: (next: AdsFilters) => void;
}) {
  const todayId = useId();
  const presetId = useId();
  const campaignId = useId();
  const statusId = useId();
  const searchId = useId();

  const [searchDraft, setSearchDraft] = useState(value.search);
  const [customOpen, setCustomOpen] = useState(value.preset === "custom");
  const [draft, setDraft] = useState<AdsDayRange>(value.range);
  const onSearchRef = useRef(onChange);
  const valueRef = useRef(value);

  useEffect(() => {
    onSearchRef.current = onChange;
    valueRef.current = value;
  });

  // A busca espera a pessoa parar de digitar: cada tecla disparando uma consulta
  // no banco deixaria a tela piscando.
  useEffect(() => {
    if (searchDraft === valueRef.current.search) return;
    const timer = setTimeout(() => {
      onSearchRef.current({ ...valueRef.current, search: searchDraft });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchDraft]);

  const money = (amount: number | null) =>
    amount === null
      ? ""
      : new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency,
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(amount);

  const activeChips: { key: string; label: string; clear: () => void }[] = [];
  if (value.onlyToday) {
    activeChips.push({
      key: "today",
      label: "Hoje",
      clear: () => onChange({ ...value, onlyToday: false }),
    });
  }
  if (value.campaignId) {
    const campaign = campaigns.find((item) => item.id === value.campaignId);
    activeChips.push({
      key: "campaign",
      label: campaign?.name || "Campanha",
      clear: () => onChange({ ...value, campaignId: "" }),
    });
  }
  if (value.status) {
    const status = STATUS_OPTIONS.find((option) => option.value === value.status);
    activeChips.push({
      key: "status",
      label: status?.label ?? value.status,
      clear: () => onChange({ ...value, status: "" }),
    });
  }
  if (value.search) {
    activeChips.push({
      key: "search",
      label: `"${value.search}"`,
      clear: () => {
        setSearchDraft("");
        onChange({ ...value, search: "" });
      },
    });
  }

  const changePreset = (preset: AdsPeriodPreset) => {
    if (preset === "custom") {
      setDraft(value.range);
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    onChange({ ...value, preset });
  };

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <span className="hidden items-center gap-1.5 pr-1 text-[11.5px] font-bold uppercase tracking-wider text-slate-400 sm:flex">
          <Filter className="size-3.5" aria-hidden />
          Filtrar
        </span>

        {/* Hoje: o que mais se olha no dia a dia */}
        <button
          type="button"
          id={todayId}
          aria-pressed={value.onlyToday}
          onClick={() => onChange({ ...value, onlyToday: !value.onlyToday })}
          className={`inline-flex h-9.5 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[13px] font-bold transition-all ${
            value.onlyToday
              ? "border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-600/25"
              : "border-slate-200 bg-white text-slate-700 shadow-xs hover:border-slate-300 hover:bg-slate-50"
          }`}
          title="Mostrar só o que rodou hoje"
        >
          <Sun className="size-3.5" aria-hidden />
          <span>Hoje</span>
        </button>

        <div className="relative">
          <label htmlFor={presetId} className="sr-only">
            Período
          </label>
          <CalendarDays
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <select
            id={presetId}
            value={customOpen ? "custom" : value.preset}
            disabled={loading}
            onChange={(event) => changePreset(event.target.value as AdsPeriodPreset)}
            className={`${control} cursor-pointer appearance-none pl-8 pr-8`}
          >
            {ADS_PERIOD_PRESETS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
        </div>

        <div className="relative">
          <label htmlFor={campaignId} className="sr-only">
            Campanha
          </label>
          <select
            id={campaignId}
            value={value.campaignId}
            disabled={loading || campaigns.length === 0}
            onChange={(event) => onChange({ ...value, campaignId: event.target.value })}
            className={`${control} max-w-[240px] cursor-pointer appearance-none pl-3 pr-8`}
          >
            <option value="">Todas as campanhas</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name || "Campanha sem nome"}
                {campaign.spend !== null ? ` · ${money(campaign.spend)}` : ""}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
        </div>

        <div className="relative">
          <label htmlFor={statusId} className="sr-only">
            Situação do anúncio
          </label>
          <select
            id={statusId}
            value={value.status}
            disabled={loading}
            onChange={(event) => onChange({ ...value, status: event.target.value })}
            className={`${control} cursor-pointer appearance-none pl-3 pr-8`}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
        </div>

        <div className="relative ml-auto">
          <label htmlFor={searchId} className="sr-only">
            Buscar anúncio, campanha ou conjunto
          </label>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            id={searchId}
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Buscar anúncio, campanha…"
            className={`${control} w-[240px] pl-8 pr-7 font-medium placeholder:font-normal placeholder:text-slate-400`}
          />
          {searchDraft ? (
            <button
              type="button"
              onClick={() => {
                setSearchDraft("");
                onChange({ ...value, search: "" });
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-slate-700"
              aria-label="Limpar busca"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {customOpen ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.from) || !/^\d{4}-\d{2}-\d{2}$/.test(draft.to)) return;
            if (draft.from > draft.to) return;
            onChange({ ...value, preset: "custom", range: draft });
          }}
          className="flex flex-wrap items-end gap-2 border-t border-slate-100 px-3 py-2.5"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={`${presetId}-from`} className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              De
            </label>
            <input
              id={`${presetId}-from`}
              type="date"
              value={draft.from}
              onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
              className={`${control} cursor-pointer px-2.5 tabular-nums`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${presetId}-to`} className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Até
            </label>
            <input
              id={`${presetId}-to`}
              type="date"
              value={draft.to}
              onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
              className={`${control} cursor-pointer px-2.5 tabular-nums`}
            />
          </div>
          <Button type="submit" variant="primary" size="sm" className="h-9.5">
            Aplicar
          </Button>
        </form>
      ) : null}

      {activeChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-3 py-2">
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-md border border-blue-100 bg-blue-50 py-0.5 pl-2 pr-1 text-[11.5px] font-bold text-blue-800"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.clear}
                className="grid size-4 cursor-pointer place-items-center rounded text-blue-500 hover:bg-blue-200/60 hover:text-blue-900"
                aria-label={`Remover filtro ${chip.label}`}
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => {
              setSearchDraft("");
              onChange({
                ...value,
                onlyToday: false,
                campaignId: "",
                status: "",
                search: "",
              });
            }}
            className="ml-1 cursor-pointer text-[11.5px] font-bold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
          >
            Limpar tudo
          </button>
        </div>
      ) : null}
    </div>
  );
}