/**
 * Bootstrap das credenciais da integracao Tracken.
 *
 * Uso:
 *   node scripts/tracken_credential.mjs genkey
 *     Gera um valor para TRACKEN_ENCRYPTION_KEY (32 bytes em hex).
 *
 *   node scripts/tracken_credential.mjs create "Tracken Producao" production
 *     Cria a credencial e imprime api_key e secret UMA UNICA VEZ.
 *
 *   node scripts/tracken_credential.mjs list
 *     Lista as credenciais existentes (sem expor segredos).
 *
 *   node scripts/tracken_credential.mjs revoke <api_key>
 *     Desativa uma credencial.
 *
 * Conexao: usa process.env.DATABASE_URL (o mesmo que a aplicacao usa em
 * lib/db.ts). Nao use o client do Supabase aqui: o .env.local aponta para um
 * projeto Supabase que NAO e o banco de producao.
 *
 * O secret nunca fica em texto puro no banco: guarda-se o hash SHA-256 e,
 * quando TRACKEN_ENCRYPTION_KEY esta definida, uma copia cifrada em
 * AES-256-GCM usada apenas para validar a assinatura HMAC das chamadas.
 */

import crypto from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });

const sha256 = (value) =>
  crypto.createHash("sha256").update(value, "utf8").digest("hex");

function resolveEncryptionKey() {
  const raw = process.env.TRACKEN_ENCRYPTION_KEY;
  if (!raw) return null;

  const candidate = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (candidate.length !== 32) {
    throw new Error(
      "TRACKEN_ENCRYPTION_KEY invalida: use 32 bytes em hex (64 caracteres) ou base64"
    );
  }
  return candidate;
}

function encryptSecret(plainText, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

function connect() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      "DATABASE_URL nao definida. Exporte a variavel antes de rodar:\n" +
        '  $env:DATABASE_URL="postgresql://usuario:senha@host:porta/banco"'
    );
    process.exit(1);
  }

  return new pg.Client({
    connectionString,
    ssl:
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: false }
        : false,
    connectionTimeoutMillis: 15000,
    statement_timeout: 30000,
  });
}

async function create(name, environment) {
  if (!["production", "sandbox"].includes(environment)) {
    console.error('environment deve ser "production" ou "sandbox"');
    process.exit(1);
  }

  const prefix = environment === "production" ? "fnvj_live" : "fnvj_test";
  const apiKey = `${prefix}_${crypto.randomBytes(18).toString("hex")}`;
  const secret = crypto.randomBytes(32).toString("base64url");

  const encryptionKey = resolveEncryptionKey();
  const secretEncrypted = encryptionKey
    ? encryptSecret(secret, encryptionKey)
    : null;

  // Sem chave de cifra nao ha como validar HMAC, entao a credencial nasce
  // sem exigir assinatura em vez de nascer quebrada.
  const requireSignature = Boolean(secretEncrypted);

  const client = connect();
  await client.connect();

  try {
    const { rows } = await client.query(
      `INSERT INTO tracken_api_credentials (
         name, api_key, secret_hash, secret_encrypted,
         scopes, environment, require_signature, is_active
       ) VALUES (
         $1, $2, $3, $4,
         ARRAY['tickets:write','tickets:read']::TEXT[],
         $5, $6, true
       )
       RETURNING id, name, api_key, environment, require_signature, created_at`,
      [name, apiKey, sha256(secret), secretEncrypted, environment, requireSignature]
    );

    console.log("\nCredencial criada.\n");
    console.log(JSON.stringify(rows[0], null, 2));
    console.log("\n--- ENTREGAR PARA A TRACKEN (exibido uma unica vez) ---");
    console.log(`api_key : ${apiKey}`);
    console.log(`secret  : ${secret}`);
    console.log(`\nAuthorization: Bearer ${apiKey}.${secret}`);

    if (requireSignature) {
      console.log(
        "\nAssinatura HMAC EXIGIDA. Headers obrigatorios em cada chamada:\n" +
          "  X-FNVJ-Timestamp: <unix seconds>\n" +
          "  X-FNVJ-Signature: sha256=HMAC_SHA256(secret, timestamp + '.' + corpo)"
      );
    } else {
      console.log(
        "\nAVISO: TRACKEN_ENCRYPTION_KEY nao esta definida, entao a credencial\n" +
          "foi criada com require_signature = false (sem HMAC). Gere a chave com\n" +
          "`node scripts/tracken_credential.mjs genkey` e recrie a credencial\n" +
          "para exigir assinatura."
      );
    }
    console.log("");
  } finally {
    await client.end().catch(() => {});
  }
}

async function list() {
  const client = connect();
  await client.connect();

  try {
    const { rows } = await client.query(
      `SELECT name, api_key, environment, scopes, require_signature,
              (secret_encrypted IS NOT NULL) AS tem_secret_cifrado,
              is_active, last_used_at, created_at
         FROM tracken_api_credentials
        ORDER BY created_at DESC`
    );

    if (rows.length === 0) {
      console.log("Nenhuma credencial cadastrada.");
      return;
    }
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await client.end().catch(() => {});
  }
}

async function revoke(apiKey) {
  if (!apiKey) {
    console.error("Informe a api_key a revogar.");
    process.exit(1);
  }

  const client = connect();
  await client.connect();

  try {
    const { rowCount } = await client.query(
      `UPDATE tracken_api_credentials
          SET is_active = false
        WHERE api_key = $1`,
      [apiKey]
    );
    console.log(
      rowCount > 0 ? "Credencial desativada." : "Nenhuma credencial encontrada."
    );
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "genkey":
      console.log(
        `TRACKEN_ENCRYPTION_KEY=${crypto.randomBytes(32).toString("hex")}`
      );
      break;

    case "create":
      await create(args[0] ?? "Tracken Producao", args[1] ?? "production");
      break;

    case "list":
      await list();
      break;

    case "revoke":
      await revoke(args[0]);
      break;

    default:
      console.log(
        "Comandos: genkey | create <nome> <production|sandbox> | list | revoke <api_key>"
      );
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Falhou:", error.message ?? error);
  if (error.detail) console.error("Detalhe:", error.detail);
  if (error.hint) console.error("Dica:", error.hint);
  process.exitCode = 1;
});
