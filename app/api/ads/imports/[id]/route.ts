import { NextRequest, NextResponse } from "next/server";

import { withAdsTransaction } from "@/lib/ads/db";
import { deleteImport } from "@/lib/ads/store";
import { authenticatePanelAdmin } from "@/lib/tracken/auth";
import { notFound, toErrorResponse } from "@/lib/tracken/errors";

/**
 * DELETE /api/ads/imports/:id (só administrador)
 *
 * Tira do painel as linhas deste envio que ainda estão em uso e apaga o
 * registro do histórico. Dados de envios anteriores que ele substituiu não
 * voltam: para isso, envie o relatório daquele período de novo.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = "Este envio não existe mais. Atualize a página.";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await authenticatePanelAdmin(request);
    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) throw notFound(NOT_FOUND);

    const deleted = await withAdsTransaction((run) => deleteImport(run, id));
    if (!deleted) throw notFound(NOT_FOUND);

    return NextResponse.json({ deleted: true, fileName: deleted.fileName });
  } catch (error) {
    return toErrorResponse(error);
  }
}
