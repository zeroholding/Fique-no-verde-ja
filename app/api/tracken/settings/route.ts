import { NextRequest, NextResponse } from "next/server";
import { authenticatePanelUser } from "@/lib/tracken/auth";
import { withClient } from "@/lib/tracken/db";
import { toErrorResponse } from "@/lib/tracken/errors";

/**
 * GET /api/tracken/settings
 * Alimenta a tela "Configuracoes": credenciais, mapa de status e fila de saida.
 *
 * Nenhum segredo trafega aqui. A resposta expoe apenas a api_key (identificador
 * publico) e um booleano dizendo se existe secret cifrado gravado. Hash e
 * secret cifrado nunca saem do banco.
 */

export const dynamic = "force-dynamic";

type CredentialRow = {
  id: string;
  name: string;
  api_key: string;
  environment: string;
  scopes: string[];
  require_signature: boolean;
  has_encrypted_secret: boolean;
  allowed_ips: string[];
  webhook_url: string | null;
  has_webhook_secret: boolean;
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const user = await authenticatePanelUser(request);

    // As cinco consultas rodam em UMA conexao, em sequencia, para nao ocupar
    // metade do pool de dez slots numa unica requisicao.
    const [credentials, statuses, outboxSummary, outboxRecent, requestLog] =
      await withClient(async (run) => [
        await run<CredentialRow>(
          `SELECT id, name, api_key, environment, scopes, require_signature,
                  (secret_encrypted IS NOT NULL) AS has_encrypted_secret,
                  allowed_ips, webhook_url,
                  -- Booleano, nunca o valor: e a chave que assina o que sai.
                  (webhook_secret IS NOT NULL
                   AND btrim(webhook_secret) <> '') AS has_webhook_secret,
                  is_active,
                  last_used_at, expires_at, created_at
             FROM tracken_api_credentials
            ORDER BY created_at DESC`
        ),

        await run(
          `SELECT code, label, tracken_status, color, sort_order,
                  is_initial, is_final, counts_as_sla, allowed_next, is_active
             FROM tracken_status_map
            ORDER BY sort_order`
        ),

        await run<{ status: string; total: string }>(
          `SELECT status, COUNT(*)::text AS total
             FROM tracken_outbox
            GROUP BY status`
        ),

        await run(
          `SELECT o.id, o.event_type, o.status, o.attempts, o.max_attempts,
                  o.next_attempt_at, o.last_error, o.last_http_status,
                  o.sent_at, o.created_at, t.shipment_id
             FROM tracken_outbox o
             JOIN tracken_tickets t ON t.id = o.ticket_id
            ORDER BY o.created_at DESC
            LIMIT 25`
        ),

        await run<{
          total: string;
          erros: string;
          ultima: string | null;
        }>(
          `SELECT COUNT(*)::text AS total,
                  COUNT(*) FILTER (
                    WHERE http_status >= 400 OR error IS NOT NULL
                  )::text AS erros,
                  MAX(created_at)::text AS ultima
             FROM tracken_request_log
            WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'`
        ),
      ]);

    const outboxByStatus = Object.fromEntries(
      outboxSummary.rows.map((row) => [row.status, Number(row.total)])
    );

    const publicCredentials = credentials.rows.map((row) => {
      // URL pode carregar token em query string. Ela e usada apenas para o
      // diagnostico abaixo e nao atravessa a fronteira da API para o navegador.
      const { webhook_url: privateWebhookUrl, ...credential } = row;
      void privateWebhookUrl;
      return credential;
    });

    return NextResponse.json({
      canManage: user.is_admin,
      credentials: publicCredentials,
      statuses: statuses.rows,
      outbox: {
        pending: outboxByStatus.pending ?? 0,
        sent: outboxByStatus.sent ?? 0,
        failed: outboxByStatus.failed ?? 0,
        dead: outboxByStatus.dead ?? 0,
        recent: outboxRecent.rows,
      },
      requestLog: {
        last7Days: Number(requestLog.rows[0]?.total ?? 0),
        errors: Number(requestLog.rows[0]?.erros ?? 0),
        lastAt: requestLog.rows[0]?.ultima ?? null,
      },
      // Mesmo conjunto de candidatos do worker: apenas credenciais ativas,
      // nao expiradas e com URL preenchida. O diagnostico valida a candidata
      // unica sem devolver qualquer segredo ao navegador.
      webhook: (() => {
        const now = Date.now();
        const destinos = credentials.rows.filter(
          (row) =>
            row.is_active &&
            Boolean(row.webhook_url?.trim()) &&
            (row.expires_at === null || new Date(row.expires_at).getTime() > now)
        );

        let blockedReason: string | null = null;

        if (destinos.length === 0) {
          blockedReason =
            "Nenhuma credencial ativa, nao expirada e com URL de webhook esta configurada.";
        } else if (destinos.length > 1) {
          blockedReason =
            `Ha ${destinos.length} credenciais utilizaveis com URL de webhook; ` +
            "o destino e ambiguo e a fila permanece parada.";
        } else {
          const destino = destinos[0]!;
          let parsed: URL | null = null;

          try {
            parsed = new URL(destino.webhook_url!.trim());
          } catch {
            blockedReason = "A URL de webhook configurada e invalida.";
          }

          if (parsed) {
            const isLocal =
              parsed.hostname === "localhost" ||
              parsed.hostname === "127.0.0.1" ||
              parsed.hostname === "::1";

            if (parsed.protocol !== "https:" && !isLocal) {
              blockedReason =
                "A URL de webhook precisa usar HTTPS; HTTP so e permitido para localhost.";
            } else if (
              destino.require_signature &&
              !destino.has_webhook_secret
            ) {
              blockedReason =
                "A credencial exige assinatura, mas nao ha webhook_secret configurado.";
            }
          }
        }

        return {
          // Campos mantidos por compatibilidade com consumidores existentes.
          configured: destinos.length > 0,
          signed: destinos.some((row) => row.has_webhook_secret),
          destinations: destinos.length,
          usable: blockedReason === null,
          blockedReason,
        };
      })(),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
