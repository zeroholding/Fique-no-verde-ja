"use client";

import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { FileSpreadsheet, FileUp } from "lucide-react";

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

/**
 * Envio de relatório em duas etapas: o arquivo é conferido no servidor e a
 * pessoa vê o que vai mudar no painel antes de salvar. Na confirmação o mesmo
 * arquivo vai de novo, agora para gravar.
 */

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
    return "Esse é o formato antigo do Excel (.xls). Exporte de novo escolhendo CSV ou Excel (.xlsx).";
  }
  if (!name.endsWith(".csv") && !name.endsWith(".xlsx")) {
    return "Envie o arquivo .csv ou .xlsx exportado do Gerenciador de Anúncios.";
  }
  if (file.size === 0) return "O arquivo está vazio.";
  if (file.size > MAX_BYTES) {
    return "O arquivo passa de 5 MB. Exporte um período menor ou envie em partes.";
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
    return <Notice tone="info">O painel ainda não tem dados de {period}. Nada será substituído.</Notice>;
  }

  const metrics = COMPARED_METRICS.filter(
    (metric) => preview.totals[metric] !== null || replacement.totals[metric] !== null
  );
  const show = (metric: AdsMetricKey, value: number | null) =>
    metric === "spend" ? formatMoney(value, currency) : formatCount(value);

  return (
    <div className="overflow-hidden rounded-md border border-[var(--ads-line)]">
      <p className="border-b border-[var(--ads-line)] bg-[var(--ads-subtle)] px-3 py-2.5 text-[13.5px] text-[var(--ads-ink)]">
        O painel já tem dados de {period}
        {preview.accounts.length === 1 ? " desta conta" : preview.accounts.length > 1 ? " destas contas" : ""}.
        Eles serão trocados pelos deste arquivo.
      </p>
      <table className="w-full text-[13px]">
        <thead className="text-[12.5px] text-[var(--ads-ink-muted)]">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Métrica
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Hoje no painel
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Depois de salvar
            </th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => (
            <tr key={metric} className="border-t border-[var(--ads-line)]">
              <th scope="row" className="px-3 py-2 text-left font-normal text-[var(--ads-ink-soft)]">
                {ADS_METRIC_LABELS[metric]}
              </th>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--ads-ink-soft)]">
                {show(metric, replacement.totals[metric])}
              </td>
              <td className="px-3 py-2 text-right font-medium tabular-nums text-[var(--ads-ink)]">
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
      <div className="flex items-center gap-3 rounded-md border border-[var(--ads-line)] bg-[var(--ads-subtle)] px-3 py-2.5">
        <FileSpreadsheet className="size-5 shrink-0 text-[var(--ads-ink-muted)]" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-[var(--ads-ink)]" title={preview.fileName}>
            {preview.fileName}
          </p>
          <p className="text-[12.5px] text-[var(--ads-ink-muted)]">
            {preview.format === "xlsx" ? "Excel" : "CSV"} · {formatFileSize(preview.fileSize)}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-[13.5px] sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-y-2.5">
        <dt className="text-[var(--ads-ink-muted)]">Período</dt>
        <dd className="mb-2 text-[var(--ads-ink)] sm:mb-0">
          {formatDayRange(preview.firstDay, preview.lastDay)} ·{" "}
          {pluralize(preview.days, "dia com veiculação", "dias com veiculação")}
        </dd>

        <dt className="text-[var(--ads-ink-muted)]">Conteúdo</dt>
        <dd className="mb-2 text-[var(--ads-ink)] sm:mb-0">
          {pluralize(preview.rowsToSave, "linha", "linhas")}
          {levels.length > 0 ? ` · ${levels.join(", ")}` : ""}
        </dd>

        {preview.accounts.length > 0 ? (
          <>
            <dt className="text-[var(--ads-ink-muted)]">{preview.accounts.length > 1 ? "Contas" : "Conta"}</dt>
            <dd className="mb-2 break-words text-[var(--ads-ink)] sm:mb-0">{preview.accounts.join(", ")}</dd>
          </>
        ) : null}

        <dt className="text-[var(--ads-ink-muted)]">Dados do arquivo</dt>
        <dd className="mb-2 text-[var(--ads-ink)] sm:mb-0">
          {preview.metrics.map((metric) => ADS_METRIC_LABELS[metric]).join(", ")}
        </dd>

        {preview.missing.length > 0 ? (
          <>
            <dt className="text-[var(--ads-ink-muted)]">Não veio</dt>
            <dd className="text-[var(--ads-ink)]">
              {preview.missing.map((metric) => ADS_METRIC_LABELS[metric]).join(", ")}
              <span className="block text-[12.5px] text-[var(--ads-ink-muted)]">
                Inclua essas colunas na próxima exportação para ver custo por clique e por resultado.
              </span>
            </dd>
          </>
        ) : null}
      </dl>

      <ReplacementSummary preview={preview} />

      {preview.sameFile ? (
        <Notice tone="info">
          Este mesmo arquivo já foi enviado em {formatDateTime(preview.sameFile.createdAt)}. Salvar de novo
          mantém os mesmos números.
        </Notice>
      ) : null}

      {preview.warnings.map((warning) => (
        <Notice key={warning} tone="warning">
          {warning}
        </Notice>
      ))}

      {preview.ignoredColumns.length > 0 ? (
        <p className="text-[12.5px] leading-relaxed text-[var(--ads-ink-muted)]">
          Colunas não usadas: {preview.ignoredColumns.join(", ")}. Taxas e custos são recalculados pelo painel a
          partir dos números do arquivo.
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
    // Fechar o modal no meio da conferência cancela a leitura pendente.
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
    setError(null);
    setPhase({ step: "saving", file, preview });
    try {
      const { saved } = await sendReport<{ saved: AdsImportSaved }>(file, false);
      onSaved(saved);
    } catch (failure) {
      setError(errorMessage(failure));
      setPhase({ step: "review", file, preview });
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file && !busy) void readFile(file);
  };

  const footer =
    phase.step === "review" || phase.step === "saving" ? (
      <>
        <Button onClick={() => setPhase({ step: "pick" })} disabled={phase.step === "saving"}>
          Escolher outro arquivo
        </Button>
        <Button variant="primary" onClick={save} disabled={phase.step === "saving"}>
          {phase.step === "saving" ? <Spinner label="Salvando" /> : "Salvar no painel"}
        </Button>
      </>
    ) : (
      <Button onClick={onClose} disabled={busy}>
        Cancelar
      </Button>
    );

  return (
    <Dialog
      title="Enviar relatório do Meta"
      description="O arquivo é conferido antes de salvar. Nada muda no painel até você confirmar."
      onClose={onClose}
      dismissable={phase.step !== "saving"}
      size={phase.step === "review" || phase.step === "saving" ? "lg" : "md"}
      footer={footer}
    >
      <div className="space-y-4">
        {error ? <Notice tone="error">{error}</Notice> : null}

        {phase.step === "pick" ? (
          <label
            htmlFor={inputId}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ads-blue)] ${
              dragging
                ? "border-[var(--ads-blue)] bg-[var(--ads-blue-soft)]"
                : "border-[var(--ads-line-strong)] bg-[var(--ads-subtle)] hover:bg-[#f2f4f7]"
            }`}
          >
            <FileUp className="size-6 text-[var(--ads-ink-muted)]" aria-hidden />
            <span className="mt-2 text-[14px] font-medium text-[var(--ads-ink)]">
              Escolha o arquivo ou arraste para cá
            </span>
            <span className="mt-1 text-[12.5px] text-[var(--ads-ink-muted)]">CSV ou Excel (.xlsx), até 5 MB</span>
            <input
              id={inputId}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void readFile(file);
              }}
            />
          </label>
        ) : null}

        {phase.step === "reading" ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-[var(--ads-line)] px-6 py-10 text-center text-[14px] text-[var(--ads-ink-soft)]">
            <Spinner label="Conferindo o arquivo" />
            <span className="max-w-full truncate text-[12.5px] text-[var(--ads-ink-muted)]">{phase.file.name}</span>
          </div>
        ) : null}

        {phase.step === "review" || phase.step === "saving" ? <PreviewSummary preview={phase.preview} /> : null}
      </div>
    </Dialog>
  );
}
