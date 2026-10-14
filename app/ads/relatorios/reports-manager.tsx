"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { FileUp, Trash2 } from "lucide-react";

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

const STATUS_STYLE: Record<AdsImportItem["status"], { label: string; dot: string }> = {
  in_use: { label: "Em uso", dot: "bg-[#12b76a]" },
  partial: { label: "Em uso em parte", dot: "bg-[#f79009]" },
  replaced: { label: "Substituído", dot: "bg-[#98a2b3]" },
};

function StatusLabel({ item }: { item: AdsImportItem }) {
  const style = STATUS_STYLE[item.status];
  const detail =
    item.status === "partial"
      ? `${formatCount(item.rowsInUse)} de ${formatCount(item.rowsImported)} linhas`
      : item.status === "replaced"
        ? "por um envio mais recente"
        : null;
  return (
    <div>
      <p className="inline-flex items-center gap-1.5 whitespace-nowrap text-[var(--ads-ink)]">
        <span aria-hidden className={`size-1.5 rounded-full ${style.dot}`} />
        {style.label}
      </p>
      {detail ? <p className="text-[12px] text-[var(--ads-ink-muted)]">{detail}</p> : null}
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
      <table className="w-full min-w-[760px] border-collapse text-[13.5px]">
        <thead className="bg-[var(--ads-subtle)] text-[12.5px] text-[var(--ads-ink-soft)]">
          <tr>
            <th scope="col" className="py-2 pl-4 pr-3 text-left font-medium sm:pl-5">
              Arquivo
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Período
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Linhas
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Enviado
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Situação
            </th>
            {canManage ? (
              <th scope="col" className="py-2 pl-3 pr-4 text-right font-medium sm:pr-5">
                <span className="sr-only">Ações</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {imports.map((item) => (
            <tr key={item.id} className="border-t border-[var(--ads-line)] align-top">
              <td className="max-w-[280px] py-3 pl-4 pr-3 sm:pl-5">
                <p className="truncate font-medium text-[var(--ads-ink)]" title={item.fileName}>
                  {item.fileName}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-[var(--ads-ink-muted)]">
                  {item.format === "xlsx" ? "Excel" : "CSV"} · {formatFileSize(item.fileSize)}
                  {item.accounts.length > 0 ? ` · ${item.accounts.join(", ")}` : ""}
                </p>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-[var(--ads-ink)] tabular-nums">
                {formatDayRange(item.firstDay, item.lastDay)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right text-[var(--ads-ink)] tabular-nums">
                {formatCount(item.rowsImported)}
              </td>
              <td className="px-3 py-3">
                <p className="whitespace-nowrap text-[var(--ads-ink)]">{formatDateTime(item.createdAt)}</p>
                {item.uploadedBy ? (
                  <p className="text-[12px] text-[var(--ads-ink-muted)]">por {item.uploadedBy}</p>
                ) : null}
              </td>
              <td className="px-3 py-3">
                <StatusLabel item={item} />
              </td>
              {canManage ? (
                <td className="py-2.5 pl-3 pr-4 text-right sm:pr-5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(item)}
                    aria-label={`Excluir o envio ${item.fileName}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
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
      text: `Relatório salvo: ${pluralize(saved.rowsImported, "linha", "linhas")} de ${formatDayRange(
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
      setNotice({ tone: "success", text: `Envio “${pendingDelete.fileName}” excluído.`, showPanelLink: false });
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
        <div className="px-5 py-8 text-[13.5px] text-[var(--ads-ink-muted)]">
          <Spinner label="Carregando os envios" />
        </div>
      ) : (
        <div className="px-4 py-4 sm:px-5">
          <Notice
            tone="error"
            action={
              <Button size="sm" onClick={reload}>
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
      <p className="px-5 py-10 text-center text-[13.5px] text-[var(--ads-ink-muted)]">
        Nenhum relatório enviado ainda.
      </p>
    );
  } else {
    historyBody = <HistoryTable imports={imports} canManage={canManage} onDelete={setPendingDelete} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ads-ink)]">Relatórios</h1>
          <p className="mt-1 max-w-2xl text-[13.5px] text-[var(--ads-ink-soft)]">
            Arquivos exportados do Gerenciador de Anúncios do Meta. Para cada dia, o painel usa o envio mais
            recente.
          </p>
        </div>
        {canManage ? (
          <Button variant="primary" onClick={openUpload}>
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
                Ver painel
              </Link>
            ) : undefined
          }
        >
          {notice.text}
        </Notice>
      ) : null}

      <div className={canManage ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start" : ""}>
        <Card aria-labelledby={historyTitleId} aria-busy={loading}>
          <CardHeader
            title="Envios"
            titleId={historyTitleId}
            description={imports && imports.length > 0 ? pluralize(imports.length, "envio", "envios") : undefined}
            actions={
              loading && imports ? (
                <Spinner label="Atualizando" className="text-[13px] text-[var(--ads-ink-muted)]" />
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
                {deleting ? <Spinner label="Excluindo" /> : "Excluir envio"}
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-[14px] leading-relaxed text-[var(--ads-ink-soft)]">
            {deleteError ? <Notice tone="error">{deleteError}</Notice> : null}
            <p>
              <span className="font-medium text-[var(--ads-ink)]">{pendingDelete.fileName}</span> (
              {formatDayRange(pendingDelete.firstDay, pendingDelete.lastDay)}) sai do histórico, e os dados dele
              saem do painel.
            </p>
            <p>
              Dados de envios anteriores que ele substituiu não voltam. Para recuperar um período, envie o
              relatório dele de novo.
            </p>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
