"use client";

import { useState } from "react";
import { ImageIcon, Images, LayoutGrid, Play, Video } from "lucide-react";

import type { AdsCreative } from "@/lib/ads/types";

/**
 * Peça visual de um anúncio: imagem parada ou vídeo que roda no lugar.
 *
 * O vídeo NÃO carrega sozinho. São dezenas de anúncios na tela, e o `.mp4` de
 * cada um vem do CDN da Meta: carregar todos de uma vez trava a página e baixa
 * dezenas de megabytes sem ninguém pedir. O quadro parado aparece primeiro e o
 * play troca a imagem pelo player.
 *
 * Se a URL expirar (o CDN da Meta assina por tempo), a imagem some e o espaço
 * vira um ícone neutro — nunca um quadrado quebrado.
 */

const FORMAT_META: Record<string, { label: string; icon: typeof ImageIcon }> = {
  image: { label: "Imagem", icon: ImageIcon },
  video: { label: "Vídeo", icon: Video },
  carousel: { label: "Carrossel", icon: Images },
  collection: { label: "Coleção", icon: LayoutGrid },
  text: { label: "Somente texto", icon: ImageIcon },
};

export function formatLabel(format: string | undefined): string {
  return FORMAT_META[format ?? ""]?.label ?? "";
}

export function CreativeThumb({
  creative,
  size = 40,
  className = "",
}: {
  creative: AdsCreative | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = creative?.videoThumbnailUrl || creative?.thumbnailUrl || creative?.imageUrl;

  if (!url || failed) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size }}
        className={`grid shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-300 ${className}`}
      >
        <ImageIcon className="size-4" />
      </span>
    );
  }

  return (
    <span
      className={`relative shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 ${className}`}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
        className="size-full object-cover"
      />
      {creative?.format === "video" ? (
        <span
          aria-hidden
          className="absolute inset-0 grid place-items-center bg-slate-900/25"
        >
          <Play className="size-3.5 fill-white text-white" />
        </span>
      ) : null}
    </span>
  );
}

/**
 * A peça em tamanho grande: usada na galeria e no painel de detalhes.
 * `aspect` é a proporção da caixa; a imagem preenche e recorta.
 */
export function CreativeMedia({
  creative,
  aspect = "aspect-[4/5]",
}: {
  creative: AdsCreative | null;
  aspect?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  const poster = creative?.videoThumbnailUrl || creative?.thumbnailUrl || creative?.imageUrl;
  const canPlay = creative?.format === "video" && Boolean(creative.videoUrl);
  const isVideo = creative?.format === "video";

  if (!creative) {
    return (
      <div className={`${aspect} grid w-full place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-400`}>
        <div className="flex flex-col items-center gap-1 px-2 text-center">
          <ImageIcon className="size-5" aria-hidden />
          <span className="text-[10.5px] font-semibold leading-tight">Sem peça visual</span>
          <span className="text-[9.5px] font-medium leading-tight text-slate-400">
            sincronize para buscar
          </span>
        </div>
      </div>
    );
  }

  if (playing && creative.videoUrl) {
    return (
      <div className={`${aspect} relative w-full overflow-hidden rounded-xl bg-black`}>
        <video
          src={creative.videoUrl}
          poster={poster ?? undefined}
          controls
          autoPlay
          playsInline
          className="size-full object-contain"
        />
      </div>
    );
  }

  if (!poster || failed) {
    return (
      <div className={`${aspect} grid w-full place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-300`}>
        <div className="flex flex-col items-center gap-1.5">
          <ImageIcon className="size-6" aria-hidden />
          <span className="text-[11.5px] font-semibold">
            {formatLabel(creative.format) || "Sem imagem"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        if (!canPlay) return;
        // O card da galeria também é clicável (abre o detalhe). Sem parar aqui,
        // apertar o play abriria o painel junto.
        event.stopPropagation();
        setPlaying(true);
      }}
      disabled={!canPlay}
      aria-label={canPlay ? `Reproduzir vídeo de ${creative.title || "anúncio"}` : undefined}
      className={`${aspect} group relative w-full overflow-hidden rounded-xl border border-slate-200 ${
        isVideo ? "bg-slate-900" : "bg-slate-100"
      } ${canPlay ? "cursor-pointer" : "cursor-default"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={poster}
        alt={creative.title || ""}
        loading="lazy"
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
        className={`size-full transition-transform duration-300 group-hover:scale-[1.03] ${
          // Foto preenche a caixa. Vídeo vertical (9:16) numa caixa 4:3 seria
          // cortado em quase todo o quadro, então ele aparece inteiro, com
          // faixa escura nas laterais.
          isVideo ? "object-contain" : "object-cover"
        }`}
      />
      {canPlay ? (
        <>
          <span
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-slate-900/35 via-transparent to-transparent"
          />
          <span
            aria-hidden
            className="absolute inset-0 grid place-items-center"
          >
            <span className="grid size-11 place-items-center rounded-full bg-white/95 shadow-lg transition-transform duration-150 group-hover:scale-110">
              <Play className="ml-0.5 size-4.5 fill-slate-900 text-slate-900" />
            </span>
          </span>
        </>
      ) : null}
    </button>
  );
}

/** Selo pequeno com o formato da peça. */
export function CreativeFormatBadge({ format }: { format: string | undefined }) {
  const meta = FORMAT_META[format ?? ""];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white/95 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-700 shadow-xs backdrop-blur-sm">
      <Icon className="size-3" aria-hidden />
      {meta.label}
    </span>
  );
}
