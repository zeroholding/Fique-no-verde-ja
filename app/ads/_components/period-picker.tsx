"use client";

import { useId, useState, type FormEvent } from "react";
import { Calendar, Check } from "lucide-react";

import { ADS_PERIOD_PRESETS, isIsoDay, type AdsDayRange, type AdsPeriodPreset } from "@/lib/ads/dates";

import { Button } from "./ui";

const selectClasses =
  "h-9.5 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13.5px] font-semibold text-slate-800 shadow-xs hover:border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors disabled:opacity-60 cursor-pointer";
const dateClasses =
  "h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-800 shadow-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors tabular-nums";

/**
 * Escolha do período: atalhos e, em "Personalizado", duas datas com botão Aplicar.
 */
export function PeriodPicker({
  preset,
  range,
  disabled = false,
  onPreset,
  onCustom,
}: {
  preset: AdsPeriodPreset;
  range: AdsDayRange | null;
  disabled?: boolean;
  onPreset: (preset: Exclude<AdsPeriodPreset, "custom">) => void;
  onCustom: (range: AdsDayRange) => void;
}) {
  const selectId = useId();
  const fromId = useId();
  const toId = useId();
  const [draft, setDraft] = useState<AdsDayRange>(range ?? { from: "", to: "" });
  const [customOpen, setCustomOpen] = useState(preset === "custom");
  const [error, setError] = useState<string | null>(null);

  const handleSelect = (value: AdsPeriodPreset) => {
    setError(null);
    if (value === "custom") {
      setDraft(range ?? { from: "", to: "" });
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    onPreset(value);
  };

  const applyCustom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isIsoDay(draft.from) || !isIsoDay(draft.to)) {
      setError("Preencha as duas datas.");
      return;
    }
    if (draft.from > draft.to) {
      setError("A data inicial precisa ser anterior à final.");
      return;
    }
    setError(null);
    onCustom(draft);
  };

  return (
    <div className="flex flex-col items-stretch gap-2.5 sm:items-end">
      <div className="relative flex items-center">
        <label htmlFor={selectId} className="sr-only">
          Período de análise
        </label>
        <Calendar className="pointer-events-none absolute left-3 size-4 text-slate-400" aria-hidden />
        <select
          id={selectId}
          className={selectClasses}
          value={customOpen ? "custom" : preset}
          disabled={disabled}
          onChange={(event) => handleSelect(event.target.value as AdsPeriodPreset)}
        >
          {ADS_PERIOD_PRESETS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {customOpen ? (
        <form
          onSubmit={applyCustom}
          className="flex flex-wrap items-end gap-2 p-2.5 rounded-xl border border-slate-200 bg-white shadow-sm"
          noValidate
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={fromId} className="text-[11.5px] font-semibold text-slate-500 uppercase tracking-wider">
              De
            </label>
            <input
              id={fromId}
              type="date"
              className={dateClasses}
              value={draft.from}
              onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={toId} className="text-[11.5px] font-semibold text-slate-500 uppercase tracking-wider">
              Até
            </label>
            <input
              id={toId}
              type="date"
              className={dateClasses}
              value={draft.to}
              onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
            />
          </div>
          <Button type="submit" variant="primary" size="sm" disabled={disabled} className="gap-1">
            <Check className="size-3.5" aria-hidden />
            <span>Aplicar</span>
          </Button>
          {error ? (
            <p role="alert" className="w-full text-[12px] font-semibold text-rose-600 sm:text-right">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
