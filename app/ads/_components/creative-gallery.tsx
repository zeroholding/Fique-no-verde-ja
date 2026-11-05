"use client";

import { useId, useMemo, useState } from "react";
import { ExternalLink, ImageIcon, LayoutGrid } from "lucide-react";

import { formatCount, formatIndicator, formatPercent } from "@/lib/ads/format";
import { ADS_INDICATORS, type AdsIndicatorKey } from "@/lib/ads/metrics";
import type { AdsCreativeItem } from "@/lib/ads/types";

import { CreativeFormatBadge, CreativeMedia } from "./creative-media";
import { Card, Dialog } from "./ui";

/**
 * Galeria de anúncios: cada peça (foto ou vídeo) com os números do período.
 *
 * É o recorte que a tabela não dá. Na tabela a pessoa lê linha a linha; aqui
 * ela bate o olho e vê qual criativo está segurando o investimento. Só mostra
 * quem rodou no período — anúncio pausado há dois meses não interessa, e ele
 * nem aparece na consulta.
 *
 * A grande maioria é vídeo de WhatsApp: por isso o player, e não só a foto.
 */

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: "Ativo", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  paused: { label: "Pausado", className: "border-amber-200 bg-amber-50 text-amber-700" },
  archived: { label: "Arquivado", className: "border-slate-200 bg-slate-100 text-slate-600" },
  in_process: { label: "Em análise", className: "border-blue-200 bg-blue-50 text-blue-700" },
  pending_review: { label: "Em análise", className: "border-blue-200 bg-blue-50 text-blue-700" },
  disapproved: { label: "Reprovado", className: "border-rose-200 bg-rose-50 text-rose-700" },
  campaign_paused: { label: "Campanha pausada", className: "border-slate-200 bg-slate-100 text-slate-600" },
  adset_paused: { label: "Conjunto pausado", className: "border-slate-200 bg-slate-100 text-slate-600" },
  with_issues: { label: "Com problemas", className: "border-rose-200 bg-rose-50 text-rose-700" },
};

export function statusLabel(raw: string): { label: string; className: string } | null {
  const key = raw.toLowerCase();
  if (!key) return null;
  return (
    STATUS_LABELS[key] ?? {
      label: raw.replace(/_/g, " ").toLowerCase(),
      className: "border-slate-200 bg-slate-100 text-slate-600",
    }
  );
}

function StatusPill({ status }: { status: string }) {
  const meta = statusLabel(status);
  if (!meta) return null;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold capitalize ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function CreativeDetail({
  item,
  currency,
  periodLabel,
  onClose,
}: {
  item: AdsCreativeItem;
  currency: string;
  periodLabel: string;
  onClose: () => void;
}) {
  const present = (Object.keys(ADS_INDICATORS) as AdsIndicatorKey[]).filter(
    (key) => item.values[key] !== null
  );

  return (
    <Dialog
      title={item.name || "Anúncio sem nome"}
      description={`${item.campaignName}${item.adsetName ? ` › ${item.adsetName}` : ""} · ${periodLabel}`}
      onClose={onClose}
      size="lg"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="w-full sm:w-[46%]">
          <CreativeMedia creative={item.creative} aspect="aspect-[4/5]" />
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {item.creative ? <CreativeFormatBadge format={item.creative.format} /> : null}
            <StatusPill status={item.creative?.effectiveStatus ?? ""} />
            <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">
              {formatCount(item.days)} {item.days === 1 ? "dia no ar" : "dias no ar"}
            </span>
          </div>

          {item.creative?.title ? (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Título</p>
              <p className="mt-0.5 text-[14px] font-bold text-slate-900">{item.creative.title}</p>
            </div>
          ) : null}

          {item.creative?.body ? (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Texto do anúncio</p>
              <p className="mt-0.5 whitespace-pre-line text-[13px] font-medium leading-relaxed text-slate-600 line-clamp-6">
                {item.creative.body}
              </p>
            </div>
          ) : null}

          <dl className="grid grid-cols-2 gap-2">
            {present.map((key) => {
              const definition = ADS_INDICATORS[key];
              return (
                <div key={key} className="rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2">
                  <dt className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                    {definition.short}
                  </dt>
                  <dd className="mt-0.5 text-[14px] font-extrabold tabular-nums text-slate-900">
                    {formatIndicator(item.values[key], definition.format, currency)}
                  </dd>
                </div>
              );
            })}
          </dl>

          {item.creative?.permalinkUrl ? (
            <a
              href={item.creative.permalinkUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-blue-700 hover:underline"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              Abrir no Gerenciador de Anúncios
            </a>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

export function CreativeGallery({
  items,
  counts,
  currency,
  periodLabel,
}: {
  items: AdsCreativeItem[];
  counts: Record<string, number>;
  currency: string;
  periodLabel: string;
}) {
  const titleId = useId();
  const [open, setOpen] = useState<AdsCreativeItem | null>(null);
  const [limit, setLimit] = useState(12);

  const sorted = useMemo(
    () => [...items].sort((left, right) => (right.values.spend ?? 0) - (left.values.spend ?? 0)),
    [items]
  );
  const shown = sorted.slice(0, limit);

  return (
    <Card aria-labelledby={titleId} className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/40 px-5 py-3.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg border border-violet-100 bg-violet-50 text-violet-600">
            <LayoutGrid className="size-4" aria-hidden />
          </span>
          <div>
            <h2 id={titleId} className="text-[15.5px] font-bold tracking-tight text-slate-900">
              Anúncios no ar
            </h2>
            <p className="text-[12.5px] font-medium text-slate-500">
              {formatCount(items.length)} {items.length === 1 ? "peça no período" : "peças no período"}
              {counts.active ? ` · ${formatCount(counts.active)} ativas` : ""}
            </p>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 px-6 py-14 text-center">
          <ImageIcon className="size-6 text-slate-300" aria-hidden />
          <p className="text-[13.5px] font-medium text-slate-500">
            Nenhum anúncio com peça visual neste recorte.
          </p>
          <p className="max-w-sm text-[12.5px] text-slate-400">
            A peça só aparece depois de uma sincronização, e depende da permissão do token na Meta.
          </p>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {shown.map((item) => {
              const spend = item.values.spend;
              const results = item.values.results;
              const cost = item.values.cost_per_result;
              const ctr = item.values.ctr;
              const status = statusLabel(item.creative?.effectiveStatus ?? "");

              return (
                <li key={item.adId}>
                  {/*
                   * O card é uma `div` com papel de botão, não um `<button>`:
                   * dentro dele vive o botão de play do vídeo, e botão dentro de
                   * botão é HTML inválido — o navegador desmancha a árvore e o
                   * clique para de funcionar.
                   */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpen(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setOpen(item);
                      }
                    }}
                    aria-label={`Ver detalhes de ${item.name || "anúncio"}`}
                    className="group flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    <div className="relative">
                      <CreativeMedia creative={item.creative} aspect="aspect-[4/3]" />
                      <span className="absolute left-2 top-2 flex flex-wrap gap-1">
                        {item.creative ? <CreativeFormatBadge format={item.creative.format} /> : null}
                      </span>
                      {status ? (
                        <span className="absolute right-2 top-2">
                          <StatusPill status={item.creative?.effectiveStatus ?? ""} />
                        </span>
                      ) : null}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
                      <div className="min-w-0">
                        <p
                          className="line-clamp-2 text-[13.5px] font-bold leading-snug text-slate-900 group-hover:text-blue-700"
                          title={item.name}
                        >
                          {item.name || "Anúncio sem nome"}
                        </p>
                        <p
                          className="mt-0.5 line-clamp-1 text-[11.5px] font-medium text-slate-400"
                          title={[item.campaignName, item.adsetName].filter(Boolean).join(" › ")}
                        >
                          {item.campaignName || "Sem campanha"}
                          {item.adsetName ? ` › ${item.adsetName}` : ""}
                        </p>
                      </div>

                      {/*
                       * Rótulo em cima, número embaixo. Antes era rótulo à
                       * esquerda e número à direita na mesma linha: em card
                       * estreito o rótulo era cortado ("CUSTO/RESULTA…").
                       */}
                      <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-2.5">
                        <div>
                          <dt className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">
                            Gasto
                          </dt>
                          <dd className="text-[13.5px] font-extrabold tabular-nums text-slate-900">
                            {formatIndicator(spend, "money", currency)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">
                            Resultados
                          </dt>
                          <dd className="text-[13.5px] font-bold tabular-nums text-slate-800">
                            {formatIndicator(results, "count", currency)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">
                            Custo/resultado
                          </dt>
                          <dd className="text-[13.5px] font-bold tabular-nums text-slate-800">
                            {formatIndicator(cost, "money", currency)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">
                            CTR
                          </dt>
                          <dd className="text-[13.5px] font-bold tabular-nums text-slate-800">
                            {ctr !== null ? formatPercent(ctr, 1) : "—"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {shown.length < sorted.length ? (
            <div className="flex justify-center border-t border-slate-100 px-5 py-3.5">
              <button
                type="button"
                onClick={() => setLimit((current) => current + 12)}
                className="inline-flex h-8.5 cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] font-bold text-slate-700 shadow-xs transition-colors hover:bg-slate-50"
              >
                Ver mais {formatCount(Math.min(12, sorted.length - shown.length))}
              </button>
            </div>
          ) : null}
        </>
      )}

      {open ? (
        <CreativeDetail
          item={open}
          currency={currency}
          periodLabel={periodLabel}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </Card>
  );
}
