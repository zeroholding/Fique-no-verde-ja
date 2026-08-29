"use client";

import { Truck, Zap } from "lucide-react";
import { describeShippingMode } from "@/lib/tracken/shipping";
import { BADGE_CLASSES, normalizeColor } from "./tokens";

/**
 * Modalidade de envio.
 *
 * Existe para a equipe conferir se o envio e realmente FLEX antes de abrir
 * chamado. O FLEX ganha icone proprio e cor de destaque justamente porque e a
 * checagem que importa; as outras modalidades ficam discretas.
 */
export default function ShippingModeBadge({
  mode,
}: {
  mode: string | null;
}) {
  const info = describeShippingMode(mode);

  if (!info) {
    return (
      <span
        className="text-xs text-slate-500"
        title="Modalidade não informada pela TRACKen"
      >
        Não informada
      </span>
    );
  }

  const tone = normalizeColor(info.color);
  const Icon = info.isFlex ? Zap : Truck;

  return (
    <span
      title={
        info.isFlex
          ? "FLEX: entrega pelo próprio vendedor (self_service)"
          : `Modalidade: ${info.label} (${info.code})`
      }
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-xs ${
        info.isFlex ? "font-bold" : "font-medium"
      } ${BADGE_CLASSES[tone]}`}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {info.label}
    </span>
  );
}
