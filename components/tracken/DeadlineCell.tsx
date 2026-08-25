"use client";

import { AlertTriangle } from "lucide-react";
import {
  formatDate,
  formatTime,
  formatTimeLeft,
  getDeadlineUrgency,
} from "@/lib/tracken/format";

/**
 * Celula do limite de envio.
 *
 * E o campo mais critico da operacao: passado o limite, o Mercado Livre ja
 * contabilizou o atraso. O destaque cresce conforme o prazo se aproxima.
 */
const URGENCY_STYLES = {
  overdue: {
    text: "text-red-700 font-semibold",
    hint: "text-red-600",
    showIcon: true,
  },
  critical: {
    text: "text-red-600 font-semibold",
    hint: "text-red-500",
    showIcon: true,
  },
  warning: {
    text: "text-orange-600 font-semibold",
    hint: "text-orange-500",
    showIcon: false,
  },
  normal: {
    text: "text-slate-700",
    hint: "text-slate-400",
    showIcon: false,
  },
} as const;

export default function DeadlineCell({ deadline }: { deadline: string | null }) {
  if (!deadline) {
    return <span className="text-sm text-slate-400">-</span>;
  }

  const urgency = getDeadlineUrgency(deadline);
  const style = URGENCY_STYLES[urgency];
  const timeLeft = formatTimeLeft(deadline);

  return (
    <span className="block leading-tight">
      <span className={`flex items-center gap-1 text-sm ${style.text}`}>
        {style.showIcon && (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        {formatDate(deadline)}
      </span>
      <span className={`block text-xs ${style.hint}`}>
        {formatTime(deadline)}
        {timeLeft ? ` · ${timeLeft}` : ""}
      </span>
    </span>
  );
}
