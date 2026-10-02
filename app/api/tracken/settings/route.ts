import { NextRequest, NextResponse } from "next/server";
import { authenticatePanelUser } from "@/lib/tracken/auth";
import { withClient } from "@/lib/tracken/db";
import { toErrorResponse } from "@/lib/tracken/errors";
import {
  sanitizeTrackenWebhookEndpoint,
  validateTrackenWebhookUrl,
} from "@/lib/tracken/environments";
import {
  TRACKEN_ENVIRONMENTS,
  isTrackenEnvironment,
  type TrackenEnvironment,
} from "@/lib/tracken/types";

/**
 * GET /api/tracken/settings
 * Alimenta a tela "Configuracoes": credenciais, mapa de status e fila de saida.
 *
 * Nenhum segredo trafega aqui. URL sai somente como origin + pathname dentro do
 * diagnostico: query string, credenciais embutidas e webhook_secret permanecem
 * no servidor.
 */

export const dynamic = "force-dynamic";

const ALLOW_LOCAL_SANDBOX_WEBHOOK =
  process.env.TRACKEN_ALLOW_LOCAL_SANDBOX_WEBHOOK === "true";

type CredentialRow = {
  id: string;
  name: string;
  api_key: string;
  environment: TrackenEnvironment;
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

type OutboxTotals = {
  pending: number;
  sent: number;
  failed: number;
  dead: number;
};

type WebhookEnvironmentDiagnostic = {
  configured: boolean;
  signed: boolean;
  destinations: number;
  usable: boolean;
  blockedReason: string | null;
  endpoint: string | null;
};

function emptyOutboxTotals(): OutboxTotals {
  return { pending: 0, sent: 0, failed: 0, dead: 0 };
}

function diagnoseWebhook(
  environment: TrackenEnvironment,
  credentials: CredentialRow[]
): WebhookEnvironmentDiagnostic {
  const now = Date.now();
  const destinations = credentials.filter(
    (row) =>
      row.environment === environment &&
      row.is_active &&
      Boolean(row.webhook_url?.trim()) &&
      (row.expires_at === null || new Date(row.expires_at).getTime() > now)
  );

  let blockedReason: string | null = null;
  let endpoint: string | null = null;

  if (destinations.length === 0) {
    blockedReason =
      "Nenhuma credencial ativa, nao expirada e com URL esta configurada.";
  } else if (destinations.length > 1) {
    blockedReason =
      `Ha ${destinations.length} destinos ativos neste ambiente; ` +
      "a entrega permanece parada ate existir exatamente um.";
  } else {
    const destination = destinations[0]!;
    endpoint = sanitizeTrackenWebhookEndpoint(destination.webhook_url);

    try {
      const validated = validateTrackenWebhookUrl(
        destination.webhook_url!,
        environment,
        { allowLocalSandbox: ALLOW_LOCAL_SANDBOX_WEBHOOK }
      );
      endpoint = validated.endpoint;
    } catch (error) {
      blockedReason =
        error instanceof Error
          ? error.message
          : "A URL nao corresponde ao destino oficial deste ambiente.";
    }

    if (
      blockedReason === null &&
      destination.require_signature &&
      !destination.has_webhook_secret
    ) {
      blockedReason =
        "A credencial exige assinatura, mas nao ha webhook_secret configurado.";
    }
  }

  return {
    configured: destinations.length > 0,
    signed: destinations.some((row) => row.has_webhook_secret),
    destinations: destinations.length,
    usable: blockedReason === null,
    blockedReason,
    endpoint,
  };
}

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

        await run<{ environment: string; status: string; total: string }>(
          `SELECT environment, status, COUNT(*)::text AS total
             FROM tracken_outbox
            GROUP BY environment, status`
        ),

        await run(
          `SELECT o.id, o.environment, o.event_type, o.status,
                  o.attempts, o.max_attempts, o.next_attempt_at,
                  o.last_error, o.last_http_status, o.sent_at, o.created_at,
                  t.shipment_id
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

    const outbox = emptyOutboxTotals();
    const outboxByEnvironment: Record<TrackenEnvironment, OutboxTotals> = {
      production: emptyOutboxTotals(),
      sandbox: emptyOutboxTotals(),
    };

    for (const row of outboxSummary.rows) {
      if (!(row.status in outbox)) continue;
      const status = row.status as keyof OutboxTotals;
      const total = Number(row.total);
      outbox[status] += total;

      if (isTrackenEnvironment(row.environment)) {
        outboxByEnvironment[row.environment][status] += total;
      }
    }

    const publicCredentials = credentials.rows.map((row) => {
      const { webhook_url: privateWebhookUrl, ...credential } = row;
      void privateWebhookUrl;
      return credential;
    });

    const webhookByEnvironment: Record<
      TrackenEnvironment,
      WebhookEnvironmentDiagnostic
    > = {
      production: diagnoseWebhook("production", credentials.rows),
      sandbox: diagnoseWebhook("sandbox", credentials.rows),
    };

    const blockedEnvironments = TRACKEN_ENVIRONMENTS.filter(
      (environment) => !webhookByEnvironment[environment].usable
    );
    const destinations = TRACKEN_ENVIRONMENTS.reduce(
      (total, environment) =>
        total + webhookByEnvironment[environment].destinations,
      0
    );

    return NextResponse.json({
      canManage: user.is_admin,
      credentials: publicCredentials,
      statuses: statuses.rows,
      outbox: {
        ...outbox,
        recent: outboxRecent.rows,
        byEnvironment: outboxByEnvironment,
      },
      requestLog: {
        last7Days: Number(requestLog.rows[0]?.total ?? 0),
        errors: Number(requestLog.rows[0]?.erros ?? 0),
        lastAt: requestLog.rows[0]?.ultima ?? null,
      },
      webhook: {
        // Agregados legados: `signed` so e verdadeiro quando TODOS os
        // ambientes possuem secret; nunca anuncia HMAC parcial como completo.
        configured: destinations > 0,
        signed: TRACKEN_ENVIRONMENTS.every(
          (environment) => webhookByEnvironment[environment].signed
        ),
        destinations,
        usable: blockedEnvironments.length === 0,
        blockedReason:
          blockedEnvironments.length === 0
            ? null
            : blockedEnvironments
                .map((environment) => {
                  const label =
                    environment === "production" ? "Producao" : "Homologacao";
                  return `${label}: ${webhookByEnvironment[environment].blockedReason}`;
                })
                .join(" "),
        byEnvironment: webhookByEnvironment,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
