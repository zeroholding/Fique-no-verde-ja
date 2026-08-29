"use client";

import { AlertTriangle, Clock } from "lucide-react";
import {
  formatDate,
  formatTime,
  formatTimeLeft,
  getDeadlineUrgency,
} from "@/lib/tracken/format";

/**
 * Limite de envio.
 *
 * E o campo mais critico da operacao: passado o limite, o Mercado Livre ja
 * contabilizou o atraso. Aqui a cor aparece cheia de proposito, porque este e o
 * lugar onde o olho DEVE ser puxado. Nas outras colunas a cor e discreta
 * justamente para este destaque funcionar.
 */
const URGENCY = {
  overdue: {
    chip: "bg-red-600 text-white",
    date: "text-red-700 font-semibold",
    time: "text-red-600/80",
    icon: AlertTriangle,
    tag: "Vencido",
  },
  critical: {
    chip: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
    date: "text-red-700 font-semibold",
    time: "text-red-600/70",
    icon: AlertTriangle,
    tag: null,
  },
  warning: {
    chip: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
    date: "text-amber-800 font-semibold",
    time: "text-amber-700/70",
    icon: Clock,
    tag: null,
  },
  normal: {
    chip: "bg-slate-100 text-slate-600",
    date: "text-slate-700",
    time: "text-slate-500",
    icon: Clock,
    tag: null,
  },
} as const;

export default function DeadlineCell({ deadline }: { deadline: string | null }) {
  if (!deadline) {
    return (
      <span className="text-[12.5px] text-slate-400" title="Limite não informado">
        Sem limite
      </span>
    );
  }

  const urgency = getDeadlineUrgency(deadline);
  const style = URGENCY[urgency];
  const timeLeft = formatTimeLeft(deadline);
  const Icon = style.icon;

  return (
    <span className="block">
      <span className="flex items-baseline gap-1.5">
        <span className={`tk-num text-[13px] ${style.date}`}>
          {formatDate(deadline)}
        </span>
        <span className={`tk-num text-[11.5px] ${style.time}`}>
          {formatTime(deadline)}
        </span>
      </span>

      {timeLeft && (
        <span
          className={`mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${style.chip}`}
        >
          <Icon className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          {style.tag ?? timeLeft}
        </span>
      )}
    </span>
  );
}
