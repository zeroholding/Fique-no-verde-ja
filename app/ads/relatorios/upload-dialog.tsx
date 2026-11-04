"use client";

import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { ArrowRight, CheckCircle2, FileSpreadsheet, FileUp, Sparkles, UploadCloud } from "lucide-react";

import { adsRequest, errorMessage, isAbortError } from "@/lib/ads/client";
import {
  formatCount,
  formatDateTime,
  formatDayRange,
  formatFileSize,
  formatMoney,
  pluralize,
} from "@/lib/ads/format";
import { ADS_METRIC_LABELS, type AdsMetricKey } from "@/lib/ads/metrics";
import type { AdsImportPreview, AdsImportSaved } from "@/lib/ads/types";

import { Button, Dialog, Notice, Spinner } from "../_components/ui";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT =
  ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Phase =
  | { step: "pick" }
  | { step: "reading"; file: File }
  | { step: "review"; file: File; preview: AdsImportPreview }
  | { step: "saving"; file: File; preview: AdsImportPreview };

function checkFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls")) {
    return "Esse é o formato antigo do Excel (.xls). Exporte novamente escolhendo CSV ou Excel (.xlsx).";
  }
  if (!name.endsWith(".csv") && !name.endsWith(".xlsx")) {
    return "Envie o arquivo .csv ou .xlsx exportado do Gerenciador de Anúncios.";
  }
  if (file.size === 0) return "O arquivo selecionado está vazio.";
  if (file.size > MAX_BYTES) {
    return "O arquivo excede o limite de 5 MB. Exporte um período menor ou envie em partes.";
  }
  return null;
}

function sendReport<T>(file: File, preview: boolean, signal?: AbortSignal): Promise<T> {
  const body = new FormData();
  body.append("file", file, file.name);
  return adsRequest<T>(`/api/ads/imports${preview ? "?preview=1" : ""}`, {
    method: "POST",
    body,
    signal,
  });
}

const COMPARED_METRICS: AdsMetricKey[] = ["spend", "impressions", "link_clicks", "results"];

function ReplacementSummary({ preview }: { preview: AdsImportPreview }) {
  const currency = preview.currency ?? "BRL";
  const { replacement } = preview;
  const period = formatDayRange(preview.firstDay, preview.lastDay);

  if (replacement.rows === 0) {
    return (
      <Notice tone="info">
        O painel ainda não possui dados de {period}. Nenhuma linha existente será substituída.
      </Notice>
    );
  }

  const metrics = COMPARED_METRICS.filter(
    (metric) => preview.totals[metric] !== null || replacement.totals[metric] !== null
  );
  const show = (metric: AdsMetricKey, value: number | null) =>
    metric === "spend" ? formatMoney(value, currency) : formatCount(value);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 text-[13px] font-semibold text-slate-800">
        Substituição de dados em {period}
        {preview.accounts.length === 1 ? " desta conta" : preview.accounts.length > 1 ? " destas contas" : ""}:
      </div>
      <table className="w-full text-[13px]">
        <thead className="text-[12px] uppercase tracking-wider text-slate-400 bg-slate-50/40">
          <tr>
            <th scope="col" className="px-4 py-2 text-left font-semibold">
              Métrica
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold">
              Antes no painel
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold text-blue-700">
              Novo no arquivo
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {metrics.map((metric) => (
            <tr key={metric} className="hover:bg-slate-50/60">
              <th scope="row" className="px-4 py-2 text-left font-medium text-slate-600">
                {ADS_METRIC_LABELS[metric]}
              </th>
              <td className="px-4 py-2 text-right tabular-nums text-slate-500 font-medium">
                {show(metric, replacement.totals[metric])}
              </td>
              <td className="px-4 py-2 text-right font-bold tabular-nums text-slate-900">
                {show(metric, preview.totals[metric])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PreviewSummary({ preview }: { preview: AdsImportPreview }) {
  const levels = [
    preview.counts.campaigns > 0 ? pluralize(preview.counts.campaigns, "campanha", "campanhas") : null,
    preview.counts.adsets > 0 ? pluralize(preview.counts.adsets, "conjunto", "conjuntos") : null,
    preview.counts.ads > 0 ? pluralize(preview.counts.ads, "anúncio", "anúncios") : null,
  ].filter((part): part is string => part !== null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
        <span className="grid size-9 place-items-center rounded-lg bg-blue-100 text-blue-700">
          <FileSpreadsheet className="size-5 shrink-0" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold text-slate-900" title={preview.fileName}>
            {preview.fileName}
          </p>
          <p className="text-[12.5px] text-slate-500 font-medium">
            {preview.format === "xlsx" ? "Excel (.xlsx)" : "CSV"} · {formatFileSize(preview.fileSize)}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-[13.5px] sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-y-2.5">
        <dt className="font-semibold text-slate-500">Período coberto</dt>
        <dd className="font-medium text-slate-900">
          {formatDayRange(preview.firstDay, preview.lastDay)} ·{" "}
          <span className="text-slate-500 font-normal">
            {pluralize(preview.days, "dia com veiculação", "dias com veiculação")}
          </span>
        </dd>

        <dt className="font-semibold text-slate-500">Linhas no arquivo</dt>
        <dd className="font-medium text-slate-900">
          {pluralize(preview.rowsToSave, "linha", "linhas")}
          {levels.length > 0 ? <span className="text-slate-500 font-normal"> · {levels.join(", ")}</span> : ""}
        </dd>

        {preview.accounts.length > 0 ? (
          <>
            <dt className="font-semibold text-slate-500">{preview.accounts.length > 1 ? "Contas" : "Conta"}</dt>
            <dd className="font-medium text-slate-900 break-words">{preview.accounts.join(", ")}</dd>
          </>
        ) : null}

        <dt className="font-semibold text-slate-500">Métricas lidas</dt>
        <dd className="text-slate-700 font-medium leading-relaxed">
          {preview.metrics.map((metric) => ADS_METRIC_LABELS[metric]).join(", ")}
        </dd>

        {preview.missing.length > 0 ? (
          <>
            <dt className="font-semibold text-slate-500">Não identificadas</dt>
            <dd className="text-slate-600">
              {preview.missing.map((metric) => ADS_METRIC_LABELS[metric]).join(", ")}
              <span className="block mt-0.5 text-[12px] text-slate-400 font-normal">
                Para visualizar custo por clique ou por resultado, certifique-se de marcar essas colunas na exportação.
              </span>
            </dd>
          </>
        ) : null}
      </dl>

      <ReplacementSummary preview={preview} />

      {preview.sameFile ? (
        <Notice tone="info">
          Este mesmo arquivo já foi importado em {formatDateTime(preview.sameFile.createdAt)}. Confirmar a importação
          manterá os mesmos registros atualizados.
        </Notice>
      ) : null}

      {preview.warnings.map((warning) => (
        <Notice key={warning} tone="warning">
          {warning}
        </Notice>
      ))}

      {preview.ignoredColumns.length > 0 ? (
        <p className="text-[12px] leading-relaxed text-slate-400 font-medium">
          Colunas secundárias ignoradas: {preview.ignoredColumns.join(", ")}. Taxas e custos são recalculados com precisão pelo painel.
        </p>
      ) : null}
    </div>
  );
}

export function UploadDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (saved: AdsImportSaved) => void;
}) {
  const inputId = useId();
  const [phase, setPhase] = useState<Phase>({ step: "pick" });
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const readingRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const reading = readingRef;
    return () => reading.current?.abort();
  }, []);

  const busy = phase.step === "reading" || phase.step === "saving";

  const readFile = async (file: File) => {
    const problem = checkFile(file);
    if (problem) {
      setError(problem);
      setPhase({ step: "pick" });
      return;
    }

    readingRef.current?.abort();
    const controller = new AbortController();
    readingRef.current = controller;
    setError(null);
    setPhase({ step: "reading", file });

    try {
      const { preview } = await sendReport<{ preview: AdsImportPreview }>(file, true, controller.signal);
      setPhase({ step: "review", file, preview });
    } catch (failure) {
      if (isAbortError(failure)) return;
      setError(errorMessage(failure));
      setPhase({ step: "pick" });
    }
  };

  const save = async () => {
    if (phase.step !== "review") return;
    const { file, preview } = phase;
    setPhase({ step: "saving", file, preview });
    setError(null);

    try {
      const { saved } = await sendReport<{ saved: AdsImportSaved }>(file, false);
      onSaved(saved);
    } catch (failure) {
      setError(errorMessage(failure));
      setPhase({ step: "review", file, preview });
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    const item = event.dataTransfer.files[0];
    if (item) readFile(item);
  };

  return (
    <Dialog
      title={phase.step === "review" ? "Conferir relatório" : "Enviar relatório do Meta Ads"}
      description={
        phase.step === "review"
          ? "Verifique o resumo do arquivo antes de gravar no banco de dados."
          : "Envie o arquivo CSV ou Excel exportado com detalhamento diário."
      }
      onClose={onClose}
      dismissable={!busy}
      size={phase.step === "review" ? "lg" : "md"}
      footer={
        phase.step === "review" ? (
          <>
            <Button onClick={() => setPhase({ step: "pick" })} disabled={busy}>
              Trocar arquivo
            </Button>
            <Button variant="primary" onClick={save} disabled={busy} className="gap-2">
              <CheckCircle2 className="size-4" aria-hidden />
              <span>Confirmar e salvar</span>
            </Button>
          </>
        ) : (
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {error ? <Notice tone="error">{error}</Notice> : null}

        {phase.step === "pick" || phase.step === "reading" ? (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
              dragging
                ? "border-blue-500 bg-blue-50/60"
                : "border-slate-200/90 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {phase.step === "reading" ? (
              <div className="py-6 text-center space-y-2">
                <Spinner label="Analisando colunas e linhas do arquivo…" className="text-[14px] text-slate-700" />
                <p className="text-[12.5px] text-slate-400">Isso leva apenas alguns instantes.</p>
              </div>
            ) : (
              <>
                <span className="grid size-12 place-items-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                  <UploadCloud className="size-6" aria-hidden />
                </span>
                <p className="mt-3 text-[14.5px] font-bold text-slate-800">
                  Arraste o relatório aqui ou escolha no computador
                </p>
                <p className="mt-1 text-[12.5px] text-slate-400 font-medium">
                  Arquivos .csv ou .xlsx até 5 MB (com detalhamento por dia)
                </p>
                <label
                  htmlFor={inputId}
                  className="mt-4 inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-[13.5px] font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors"
                >
                  <FileUp className="size-4" aria-hidden />
                  <span>Selecionar arquivo</span>
                </label>
                <input
                  id={inputId}
                  type="file"
                  accept={ACCEPT}
                  className="sr-only"
                  onChange={(event) => {
                    const chosen = event.target.files?.[0];
                    if (chosen) readFile(chosen);
                  }}
                />
              </>
            )}
          </div>
        ) : null}

        {phase.step === "review" || phase.step === "saving" ? (
          <div>
            {phase.step === "saving" ? (
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-center">
                <Spinner label="Gravando os dados no banco de dados…" className="text-[13.5px] font-semibold text-blue-800" />
              </div>
            ) : null}
            <PreviewSummary preview={phase.preview} />
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
