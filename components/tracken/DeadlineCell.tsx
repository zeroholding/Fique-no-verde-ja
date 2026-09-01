"use client";

import { Clock } from "lucide-react";
import {
  formatDate,
  formatTime,
  formatTimeLeft,
  getDeadlineUrgency,
} from "@/lib/tracken/format";

/**
 * Limite de envio.
 *
 * O que esta coluna responde e "quando vence", e nada mais.
 *
 * Antes ela marcava "Vencido" em chip vermelho cheio sempre que o limite ja
 * tinha passado. Num painel onde TODO atendimento e de atraso, isso pintava a
 * coluna inteira de vermelho e nao separava um caso do outro -- alarme que
 * dispara sempre nao e alarme. O tamanho do atraso passou para a coluna
 * "Envio realizado", que e onde a diferenca entre os casos aparece.
 *
 * A cor continua existindo apenas para prazo que AINDA da tempo, porque ai ela
 * significa uma acao possivel: vence em horas, vence amanha, vence depois.
 */
const URGENCY = {
  /** Limite ja passou: sem chip, sem cor. Nao ha nada a decidir aqui. */
  overdue: {
    chip: null,
    date: "text-slate-700",
    time: "text-slate-500",
  },
  critical: {
    chip: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
    date: "text-red-700 font-semibold",
    time: "text-red-600/70",
  },
  warning: {
    chip: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
    date: "text-amber-800 font-semibold",
    time: "text-amber-700/70",
  },
  normal: {
    chip: "bg-slate-100 text-slate-600",
    date: "text-slate-700",
    time: "text-slate-500",
  },
} as const;

export default function DeadlineCell({ deadline }: { deadline: string | null }) {
  if (!deadline) {
    return (
      <span className="text-[14px] text-slate-400" title="Limite não informado">
        Sem limite
      </span>
    );
  }

  const urgency = getDeadlineUrgency(deadline);
  const style = URGENCY[urgency];
  const timeLeft = urgency === "overdue" ? null : formatTimeLeft(deadline);

  return (
    <span className="block">
      <span className="flex flex-wrap items-baseline gap-x-1.5">
        <span className={`tk-num text-[14.5px] ${style.date}`}>
          {formatDate(deadline)}
        </span>
        <span className={`tk-num text-[13px] ${style.time}`}>
          {formatTime(deadline)}
        </span>
      </span>

      {timeLeft && style.chip && (
        <span
          className={`mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] font-semibold ${style.chip}`}
        >
          <Clock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          {timeLeft}
        </span>
      )}
    </span>
  );
}
