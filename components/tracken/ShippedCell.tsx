"use client";

import { CheckCircle2, PackageSearch, TimerOff } from "lucide-react";
import { formatDate, formatLateness, formatTime } from "@/lib/tracken/format";

/**
 * Envio realizado.
 *
 * Sao tres situacoes, e cada uma pede uma resposta diferente:
 *
 *   1. Saiu dentro do limite -> data + "no prazo"
 *   2. Saiu depois do limite -> data + QUANTO atrasou ("2d 5h")
 *   3. Ainda nao saiu        -> "Nao enviado" + atraso ACUMULADO ate agora
 *
 * Antes esta coluna mostrava apenas a data e um selo "Fora do prazo", que diz
 * se atrasou mas nao diz quanto. Vinte minutos e dois dias recebiam o mesmo
 * selo, embora sejam casos de gravidade completamente diferente.
 *
 * O caso 3 e o que a fila trabalha, e antes nao dizia nada alem de "Nao
 * enviado". O atraso em curso e o que separa um envio parado ha duas horas de
 * um parado ha tres dias.
 */

const CHIP = "mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold";

export default function ShippedCell({
  shippedAt,
  deadline,
}: {
  shippedAt: string | null;
  deadline: string | null;
}) {
  /* ---------- 3. Ainda nao enviado ---------- */
  if (!shippedAt) {
    // Referencia e agora: o atraso de um envio que nao saiu segue crescendo.
    const running = formatLateness(deadline, new Date());

    return (
      <span className="block">
        <span className="text-[12.5px] font-medium text-slate-500">
          Não enviado
        </span>
        {running ? (
          <span
            className={`${CHIP} bg-red-50 text-red-700 ring-1 ring-inset ring-red-200`}
            title="Tempo decorrido desde o limite de envio, ainda contando"
          >
            <TimerOff className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            {running} de atraso
          </span>
        ) : (
          <span
            className={`${CHIP} bg-slate-100 text-slate-600`}
            title="Ainda dentro do limite de envio"
          >
            <PackageSearch className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            Aguardando
          </span>
        )}
      </span>
    );
  }

  const lateness = formatLateness(deadline, shippedAt);

  return (
    <span className="block">
      <span className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="tk-num text-[13px] text-slate-700">
          {formatDate(shippedAt)}
        </span>
        <span className="tk-num text-[11.5px] text-slate-500">
          {formatTime(shippedAt)}
        </span>
      </span>

      {/* ---------- 2. Saiu atrasado ---------- */}
      {lateness ? (
        <span
          className={`${CHIP} bg-red-50 text-red-700 ring-1 ring-inset ring-red-200`}
          title="Tempo entre o limite de envio e o envio real"
        >
          <TimerOff className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          {lateness} de atraso
        </span>
      ) : (
        /* ---------- 1. Saiu no prazo ---------- */
        deadline && (
          <span
            className={`${CHIP} bg-green-50 text-green-700 ring-1 ring-inset ring-green-200`}
            title="Enviado dentro do limite"
          >
            <CheckCircle2 className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            No prazo
          </span>
        )
      )}
    </span>
  );
}
