import type { PoolClient } from "pg";
import { pool } from "@/lib/db";

/**
 * Camada de acesso a dados do modulo Tracken.
 *
 * IMPORTANTE: a funcao `query` exportada por `lib/db.ts` mantem o client de
 * transacao em uma variavel de modulo (global do processo). Isso faz com que
 * duas requisicoes concorrentes compartilhem a mesma transacao e um ROLLBACK
 * desfaca o trabalho alheio.
 *
 * A API da Tracken recebe lotes e o painel muda status em paralelo, entao esse
 * modulo NUNCA usa `query("BEGIN")`. Toda transacao pega um client dedicado do
 * pool e o devolve no final.
 */

export type TrackenQueryResult<T> = {
  rows: T[];
  rowCount: number;
};

/** Executa uma query fora de transacao, com client proprio do pool. */
export async function trackenQuery<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<TrackenQueryResult<T>> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params as never[]);
    return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
  } finally {
    client.release();
  }
}

/**
 * Executa varias consultas em UMA unica conexao.
 *
 * Por que isso existe: `trackenQuery` pega um client do pool por chamada. Um
 * `Promise.all` de seis consultas ocupava seis das dez conexoes do pool de uma
 * vez, e a tela do painel dispara tres requisicoes ao carregar. Bastavam dois
 * atendentes ao mesmo tempo para estourar o limite e a conexao passar a falhar
 * por timeout, aparecendo como erro generico na tela.
 *
 * As consultas passam a rodar em sequencia numa conexao so. Perde-se o
 * paralelismo, que de todo modo era falso: o pool nao tinha folga para
 * sustenta-lo.
 */
export async function withClient<T>(
  fn: (run: <R = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ) => Promise<TrackenQueryResult<R>>) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  const run = async <R = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<TrackenQueryResult<R>> => {
    const result = await client.query(text, params as never[]);
    return { rows: result.rows as R[], rowCount: result.rowCount ?? 0 };
  };

  try {
    return await fn(run);
  } finally {
    client.release();
  }
}

/**
 * Executa `fn` dentro de uma transacao isolada.
 *
 * O client e exclusivo desta chamada: nenhuma outra requisicao consegue
 * entrar nesta transacao nem sofrer com o rollback dela.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("[TRACKEN] Falha no rollback:", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Registra uma chamada da integracao para auditoria.
 * Nunca lanca: falha de log nao pode derrubar a requisicao principal.
 */
export async function logTrackenRequest(entry: {
  direction: "inbound" | "outbound";
  endpoint: string;
  httpMethod?: string | null;
  httpStatus?: number | null;
  credentialId?: string | null;
  ticketId?: string | null;
  requestBody?: unknown;
  responseBody?: unknown;
  durationMs?: number | null;
  error?: string | null;
  ipAddress?: string | null;
}): Promise<void> {
  try {
    await trackenQuery(
      `INSERT INTO tracken_request_log (
         direction, endpoint, http_method, http_status, credential_id,
         ticket_id, request_body, response_body, duration_ms, error, ip_address
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        entry.direction,
        entry.endpoint,
        entry.httpMethod ?? null,
        entry.httpStatus ?? null,
        entry.credentialId ?? null,
        entry.ticketId ?? null,
        entry.requestBody === undefined ? null : JSON.stringify(entry.requestBody),
        entry.responseBody === undefined ? null : JSON.stringify(entry.responseBody),
        entry.durationMs ?? null,
        entry.error ?? null,
        entry.ipAddress ?? null,
      ]
    );
  } catch (error) {
    console.error("[TRACKEN] Falha ao gravar log de requisicao:", error);
  }
}
