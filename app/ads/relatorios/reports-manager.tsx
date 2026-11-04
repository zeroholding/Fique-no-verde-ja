"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { FileSpreadsheet, FileText, FileUp, Trash2, Calendar, HardDrive, RefreshCw } from "lucide-react";

import { adsRequest, errorMessage, isAbortError } from "@/lib/ads/client";
import {
  formatCount,
  formatDateTime,
  formatDayRange,
  formatFileSize,
  pluralize,
} from "@/lib/ads/format";
import type { AdsImportItem, AdsImportSaved, AdsImportsResponse } from "@/lib/ads/types";

import { Button, Card, CardHeader, Dialog, Notice, Spinner, buttonClasses } from "../_components/ui";
import { useAdsViewer } from "../_components/viewer-context";
import { ExportSteps } from "./export-steps";
import { UploadDialog } from "./upload-dialog";

/**
 * Tela de relatórios: histórico de envios para todos e, para administradores,
 * o envio de arquivo, a exclusão e o passo a passo da exportação no Meta.
 */

type ListState = {
  key: number;
  imports: AdsImportItem[] | null;
  canManage: boolean;
  error: string | null;
};

type PageNotice = { tone: "success" | "error"; text: string; showPanelLink: boolean };

function StatusLabel({ item }: { item: AdsImportItem }) {
  const isOk = item.status === "in_use";
  const isPartial = item.status === "partial";
  const label = isOk ? "Em uso" : isPartial ? "Em uso parcial" : "Substituído";
  const pillClasses = isOk
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : isPartial
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-slate-100 text-slate-600 border-slate-200";
  const dotClasses = isOk ? "bg-emerald-500" : isPartial ? "bg-amber-500" : "bg-slate-400";
  const detail =
    item.status === "partial"
      ? `${formatCount(item.rowsInUse)} de ${formatCount(item.rowsImported)} linhas ativas`
      : item.status === "replaced"
        ? "substituído por envio posterior"
        : null;

  return (
    <div>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium tracking-tight ${pillClasses}`}
      >
        <span aria-hidden className={`size-1.5 rounded-full ${dotClasses}`} />
        {label}
      </span>
      {detail ? <p className="mt-1 text-[11px] text-[var(--ads-ink-muted)]">{detail}</p> : null}
    </div>
  );
}

export function HistoryTable({
  imports,
  canManage,
  onDelete,
}: {
  imports: AdsImportItem[];
  canManage: boolean;
  onDelete: (item: AdsImportItem) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[780px] border-collapse text-[13.5px]">
        <thead className="border-b border-[var(--ads-line)] bg-slate-50/70 text-[11.5px] font-semibold uppercase tracking-wider text-[var(--ads-ink-soft)]">
          <tr>
            <th scope="col" className="py-3 pl-4 pr-3 text-left sm:pl-5">
              Arquivo e contas
            </th>
            <th scope="col" className="px-3 py-3 text-left">
              Período coberto
            </th>
            <th scope="col" className="px-3 py-3 text-right">
              Linhas
            </th>
            <th scope="col" className="px-3 py-3 text-left">
              Enviado em
            </th>
            <th scope="col" className="px-3 py-3 text-left">
              Situação
            </th>
            {canManage ? (
              <th scope="col" className="py-3 pl-3 pr-4 text-right sm:pr-5">
                <span className="sr-only">Ações</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--ads-line)]">
          {imports.map((item) => (
            <tr key={item.id} className="transition-colors hover:bg-slate-50/60 align-top">
              <td className="max-w-[280px] py-3.5 pl-4 pr-3 sm:pl-5">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-xs">
                    {item.format === "xlsx" ? (
                      <FileSpreadsheet className="size-3.5 text-emerald-600" />
                    ) : (
                      <FileText className="size-3.5 text-blue-600" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--ads-ink)]" title={item.fileName}>
                      {item.fileName}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[var(--ads-ink-muted)]">
                      <span className="rounded bg-slate-100 px-1.5 py-0.2 font-mono uppercase text-[10px] font-semibold text-slate-700">
                        {item.format}
                      </span>
                      <span>·</span>
                      <span>{formatFileSize(item.fileSize)}</span>
                      {item.accounts.length > 0 ? (
                        <>
                          <span>·</span>
                          <span className="truncate max-w-[150px]" title={item.accounts.join(", ")}>
                            {item.accounts.join(", ")}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-3.5 text-[var(--ads-ink)] tabular-nums">
                <div className="flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-slate-400" />
                  <span>{formatDayRange(item.firstDay, item.lastDay)}</span>
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-3.5 text-right font-medium text-[var(--ads-ink)] tabular-nums">
                {formatCount(item.rowsImported)}
              </td>
              <td className="px-3 py-3.5">
                <p className="whitespace-nowrap font-medium text-[var(--ads-ink)]">
                  {formatDateTime(item.createdAt)}
                </p>
                {item.uploadedBy ? (
                  <p className="text-[11.5px] text-[var(--ads-ink-muted)]">por {item.uploadedBy}</p>
                ) : null}
              </td>
              <td className="px-3 py-3.5">
                <StatusLabel item={item} />
              </td>
              {canManage ? (
                <td className="py-3 pl-3 pr-4 text-right sm:pr-5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(item)}
                    aria-label={`Excluir o envio ${item.fileName}`}
                    className="text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Excluir
                  </Button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportsManager() {
  const viewer = useAdsViewer();
  const historyTitleId = useId();
  const [attempt, setAttempt] = useState(0);
  const [list, setList] = useState<ListState>({ key: -1, imports: null, canManage: false, error: null });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [notice, setNotice] = useState<PageNotice | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdsImportItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loading = list.key !== attempt;

  useEffect(() => {
    const controller = new AbortController();
    adsRequest<AdsImportsResponse>("/api/ads/imports", { signal: controller.signal })
      .then((body) =>
        setList({ key: attempt, imports: body.imports, canManage: body.canManage, error: null })
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setList((current) => ({ ...current, key: attempt, error: errorMessage(error) }));
      });
    return () => controller.abort();
  }, [attempt]);

  const reload = () => setAttempt((current) => current + 1);
  const canManage = list.imports ? list.canManage : viewer.isAdmin;
  const imports = list.imports;

  const openUpload = () => {
    setNotice(null);
    setUploadOpen(true);
  };

  const handleSaved = (saved: AdsImportSaved) => {
    setUploadOpen(false);
    const replaced =
      saved.rowsReplaced > 0
        ? `, no lugar de ${pluralize(saved.rowsReplaced, "linha anterior", "linhas anteriores")}`
        : "";
    setNotice({
      tone: "success",
      text: `Relatório salvo com sucesso: ${pluralize(saved.rowsImported, "linha", "linhas")} de ${formatDayRange(
        saved.firstDay,
        saved.lastDay
      )}${replaced}.`,
      showPanelLink: true,
    });
    reload();
  };

  const closeDelete = () => {
    if (deleting) return;
    setPendingDelete(null);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await adsRequest<{ deleted: boolean }>(`/api/ads/imports/${encodeURIComponent(pendingDelete.id)}`, {
        method: "DELETE",
      });
      setNotice({ tone: "success", text: `Envio “${pendingDelete.fileName}” excluído com sucesso.`, showPanelLink: false });
      setPendingDelete(null);
      reload();
    } catch (error) {
      setDeleteError(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  };

  let historyBody: ReactNode;
  if (imports === null) {
    historyBody =
      loading || !list.error ? (
        <div className="flex items-center justify-center px-5 py-12 text-[13.5px] text-[var(--ads-ink-muted)]">
          <Spinner label="Carregando lista de envios..." />
        </div>
      ) : (
        <div className="px-4 py-4 sm:px-5">
          <Notice
            tone="error"
            action={
              <Button size="sm" onClick={reload}>
                <RefreshCw className="size-3.5" />
                Tentar de novo
              </Button>
            }
          >
            {list.error}
          </Notice>
        </div>
      );
  } else if (imports.length === 0) {
    historyBody = (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-2.5">
          <FileSpreadsheet className="size-5" />
        </div>
        <p className="font-semibold text-[var(--ads-ink)]">Nenhum relatório enviado ainda</p>
        <p className="mt-1 text-xs text-[var(--ads-ink-muted)] max-w-sm">
          Envie os relatórios exportados do Gerenciador de Anúncios do Meta para começar a visualizar as métricas no painel.
        </p>
      </div>
    );
  } else {
    historyBody = <HistoryTable imports={imports} canManage={canManage} onDelete={setPendingDelete} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--ads-ink)] sm:text-2xl">
            Relatórios e Importações
          </h1>
          <p className="mt-1 text-[13px] text-[var(--ads-ink-soft)] max-w-2xl">
            Arquivos CSV ou Excel exportados do Gerenciador de Anúncios da Meta. Para cada dia e conta, o painel consolida sempre o envio mais recente.
          </p>
        </div>
        {canManage ? (
          <Button variant="primary" onClick={openUpload} className="shrink-0 shadow-sm">
            <FileUp className="size-4" aria-hidden />
            Enviar relatório
          </Button>
        ) : null}
      </div>

      {notice ? (
        <Notice
          tone={notice.tone}
          action={
            notice.showPanelLink ? (
              <Link href="/ads" className={buttonClasses("secondary", "sm")}>
                Ir para o painel
              </Link>
            ) : undefined
          }
        >
          {notice.text}
        </Notice>
      ) : null}

      <div className={canManage ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start" : ""}>
        <Card aria-labelledby={historyTitleId} aria-busy={loading} className="overflow-hidden">
          <CardHeader
            title="Histórico de Envios"
            titleId={historyTitleId}
            description={imports && imports.length > 0 ? pluralize(imports.length, "envio registrado", "envios registrados") : undefined}
            actions={
              loading && imports ? (
                <Spinner label="Atualizando..." className="text-[12px] text-[var(--ads-ink-muted)]" />
              ) : null
            }
          />
          {imports && list.error && !loading ? (
            <div className="border-b border-[var(--ads-line)] px-4 py-3 sm:px-5">
              <Notice tone="error">{list.error}</Notice>
            </div>
          ) : null}
          {historyBody}
        </Card>

        {canManage ? <ExportSteps /> : null}
      </div>

      {uploadOpen ? <UploadDialog onClose={() => setUploadOpen(false)} onSaved={handleSaved} /> : null}

      {pendingDelete ? (
        <Dialog
          title="Excluir este envio?"
          onClose={closeDelete}
          dismissable={!deleting}
          footer={
            <>
              <Button onClick={closeDelete} disabled={deleting}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? <Spinner label="Excluindo..." /> : "Excluir envio"}
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-[13.5px] leading-relaxed text-[var(--ads-ink-soft)]">
            {deleteError ? <Notice tone="error">{deleteError}</Notice> : null}
            <p>
              O relatório <span className="font-semibold text-[var(--ads-ink)]">{pendingDelete.fileName}</span> (
              {formatDayRange(pendingDelete.firstDay, pendingDelete.lastDay)}) será removido do histórico, e seus dados serão retirados do painel.
            </p>
            <p className="rounded-lg bg-amber-50 p-3 text-[12.5px] text-amber-800 border border-amber-200">
              Dados de envios anteriores que foram substituídos por este não retornam automaticamente. Caso queira restabelecer o período, envie novamente o arquivo correspondente.
            </p>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
