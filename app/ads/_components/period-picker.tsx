"use client";

import { useId, useState, type FormEvent } from "react";

import { ADS_PERIOD_PRESETS, isIsoDay, type AdsDayRange, type AdsPeriodPreset } from "@/lib/ads/dates";

import { Button } from "./ui";

const selectClasses =
  "h-9 rounded-md border border-[var(--ads-line-strong)] bg-white px-2.5 text-[14px] text-[var(--ads-ink)] disabled:opacity-60";
const dateClasses =
  "h-9 rounded-md border border-[var(--ads-line-strong)] bg-white px-2 text-[14px] text-[var(--ads-ink)] tabular-nums";

/**
 * Escolha do período: atalhos e, em "Personalizado", duas datas com Aplicar.
 * Só avisa a tela quando há um período completo e válido.
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
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex items-center gap-2">
        <label htmlFor={selectId} className="text-[13px] text-[var(--ads-ink-muted)]">
          Período
        </label>
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
        <form onSubmit={applyCustom} className="flex flex-wrap items-end gap-2" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor={fromId} className="text-[12.5px] text-[var(--ads-ink-muted)]">
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
            <label htmlFor={toId} className="text-[12.5px] text-[var(--ads-ink-muted)]">
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
          <Button type="submit" variant="primary" disabled={disabled}>
            Aplicar
          </Button>
          {error ? (
            <p role="alert" className="w-full text-[12.5px] text-[var(--ads-negative)] sm:text-right">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
