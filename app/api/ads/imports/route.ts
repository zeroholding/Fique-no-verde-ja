import { NextRequest, NextResponse } from "next/server";

import { withAdsClient, withAdsTransaction } from "@/lib/ads/db";
import { buildImportPreview } from "@/lib/ads/preview";
import { AdsReportError } from "@/lib/ads/report-error";
import { REPORT_FILE_LIMITS, readReportFile, sha256Hex } from "@/lib/ads/report-file";
import { parseAdsReport } from "@/lib/ads/report-rows";
import { listImports, previewReplacement, saveImport } from "@/lib/ads/store";
import type { AdsImportsResponse } from "@/lib/ads/types";
import { authenticatePanelAdmin, authenticatePanelUser } from "@/lib/tracken/auth";
import {
  badRequest,
  payloadTooLarge,
  toErrorResponse,
  unprocessable,
} from "@/lib/tracken/errors";

/**
 * /api/ads/imports
 *
 * GET  -> histórico de envios (qualquer usuário ativo).
 * POST -> recebe o relatório em multipart, campo `file` (só administrador).
 *         `?preview=1` lê e mostra o que vai acontecer, sem gravar. A tela
 *         manda o mesmo arquivo de novo para salvar.
 *
 * O arquivo é lido em memória e descartado: nada vai para disco nem para pasta
 * pública. O que fica é o hash, o nome e as linhas interpretadas.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Folga para o envelope multipart, além do próprio arquivo. */
const MULTIPART_OVERHEAD = 64 * 1024;

const TOO_BIG = "O arquivo passa de 5 MB. Exporte um período menor ou envie em partes.";
const MISSING_FILE = "Não recebemos o arquivo. Tente enviar de novo.";

function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const printable = Array.from(base)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim();
  return (printable || "relatorio.csv").slice(0, 255);
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticatePanelUser(request);
    const imports = await withAdsClient((run) => listImports(run));
    const body: AdsImportsResponse = { imports, canManage: user.is_admin };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticatePanelAdmin(request);
    const isPreview = request.nextUrl.searchParams.get("preview") === "1";

    const declaredSize = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredSize) && declaredSize > REPORT_FILE_LIMITS.maxBytes + MULTIPART_OVERHEAD) {
      throw payloadTooLarge(TOO_BIG);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw badRequest("ARQUIVO_AUSENTE", MISSING_FILE);
    }

    const file = form.get("file");
    if (!file || typeof file === "string") {
      throw badRequest("ARQUIVO_AUSENTE", MISSING_FILE);
    }
    if (file.size > REPORT_FILE_LIMITS.maxBytes) {
      throw payloadTooLarge(TOO_BIG);
    }

    const data = new Uint8Array(await file.arrayBuffer());
    const fileName = cleanFileName(file.name);
    const table = readReportFile(data, fileName);
    const report = parseAdsReport(table);
    const fileInfo = {
      name: fileName,
      size: data.length,
      hash: sha256Hex(data),
      format: table.format,
    };

    if (isPreview) {
      const comparison = await withAdsClient((run) => previewReplacement(run, report, fileInfo.hash));
      const preview = buildImportPreview(report, fileInfo, comparison);
      return NextResponse.json({ preview }, { headers: { "Cache-Control": "no-store" } });
    }

    const saved = await withAdsTransaction((run) =>
      saveImport(run, { report, file: fileInfo, userId: user.id })
    );
    return NextResponse.json({ saved }, { status: 201 });
  } catch (error) {
    if (error instanceof AdsReportError) {
      return toErrorResponse(unprocessable("ARQUIVO_INVALIDO", error.message));
    }
    return toErrorResponse(error);
  }
}
