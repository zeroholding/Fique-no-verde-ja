"use client";

import { BADGE_CLASSES, DOT_CLASSES, normalizeColor } from "./tokens";

type BadgeProps = {
  label: string;
  color?: string | null;
  withDot?: boolean;
  title?: string;
};

/** Badge de status do atendimento (Recepcionado, Em Atendimento, ...). */
export function StatusBadge({ label, color, title }: BadgeProps) {
  const tone = normalizeColor(color);

  return (
    <span
      title={title ?? label}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${BADGE_CLASSES[tone]}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[tone]}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

/** Badge da transportadora (TM, J3, PEX, TRANSMOTO). */
export function CarrierBadge({ label, color, title }: BadgeProps) {
  const tone = normalizeColor(color);

  return (
    <span
      title={title ?? label}
      className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-1 text-xs font-bold tracking-wide ${BADGE_CLASSES[tone]}`}
    >
      {label}
    </span>
  );
}
