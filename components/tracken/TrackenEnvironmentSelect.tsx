"use client";

import type { TrackenEnvironment } from "@/lib/tracken/types";
import { isTrackenEnvironment } from "@/lib/tracken/types";

const FIELD =
  "w-full min-w-[158px] rounded-lg border px-3 py-2 text-[15px] font-semibold outline-none transition-colors focus:ring-2";

export default function TrackenEnvironmentSelect({
  value,
  onChange,
  id = "tracken-environment",
}: {
  value: TrackenEnvironment;
  onChange: (environment: TrackenEnvironment) => void;
  id?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-[12.5px] font-semibold uppercase tracking-wide text-slate-500"
      >
        Ambiente
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const environment = event.target.value;
          if (isTrackenEnvironment(environment)) onChange(environment);
        }}
        className={`${FIELD} ${
          value === "sandbox"
            ? "border-amber-300 bg-amber-50 text-amber-900 focus:border-amber-500 focus:ring-amber-100"
            : "border-emerald-300 bg-emerald-50 text-emerald-900 focus:border-emerald-500 focus:ring-emerald-100"
        }`}
      >
        <option value="production">Produção</option>
        <option value="sandbox">Homologação</option>
      </select>
    </div>
  );
}
