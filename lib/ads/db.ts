import type { PoolClient } from "pg";

import { withClient, withTransaction } from "@/lib/tracken/db";

import { ADS_SCHEMA_SQL } from "./schema";
import { ADS_SCHEMA_LOCK_SQL, type AdsRunner } from "./store";

/**
 * Conexões do /ads.
 *
 * Usa as funções do Tracken, que pegam um client dedicado do pool. Nunca use
 * `query("BEGIN")` de `lib/db.ts` aqui: ele guarda a transação numa variável
 * global e duas requisições ao mesmo tempo acabariam na mesma transação.
 */

function runnerFromClient(client: PoolClient): AdsRunner {
  return async <R = Record<string, unknown>>(text: string, params?: unknown[]) => {
    const result = await client.query(text, params as never[]);
    return { rows: result.rows as R[], rowCount: result.rowCount ?? 0 };
  };
}

let schemaReady: Promise<void> | null = null;

/**
 * Cria as tabelas do Ads se ainda não existirem (mesmo SQL da migration 027).
 * Roda uma vez por processo; se falhar, a próxima chamada tenta de novo.
 */
export function ensureAdsSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = withTransaction(async (client) => {
      await client.query(ADS_SCHEMA_LOCK_SQL);
      await client.query(ADS_SCHEMA_SQL);
    }).catch((error: unknown) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

/** Consultas em sequência numa única conexão. */
export async function withAdsClient<T>(fn: (run: AdsRunner) => Promise<T>): Promise<T> {
  await ensureAdsSchema();
  return withClient((run) => fn(run));
}

/** Transação isolada, com client exclusivo. */
export async function withAdsTransaction<T>(fn: (run: AdsRunner) => Promise<T>): Promise<T> {
  await ensureAdsSchema();
  return withTransaction((client) => fn(runnerFromClient(client)));
}
