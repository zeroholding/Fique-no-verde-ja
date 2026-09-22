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
 *   node scripts/tracken_credential.mjs webhook <api_key> <url> [secret]
 *     Grava o destino das notificacoes de saida. Sem `secret`, as entregas
 *     saem sem `X-FNVJ-Signature`. Use `--clear` no lugar da url para apagar.
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
              webhook_url,
              (webhook_secret IS NOT NULL
               AND btrim(webhook_secret) <> '') AS webhook_assinado,
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

/**
 * Grava o destino das notificacoes de saida (`tracken_outbox`).
 *
 * Fica no terminal, e nao na tela de Configuracoes, pelo mesmo motivo que
 * emitir credencial: `webhook_secret` e material de assinatura. Um formulario
 * no painel faria esse valor atravessar o navegador de quem estiver logado, e
 * a tela hoje exibe apenas um booleano dizendo que existe segredo gravado.
 *
 * A URL nao e segredo, mas mora na mesma coluna-irma e muda junto (homologacao
 * primeiro, producao depois), entao as duas sao definidas de uma vez para nao
 * existir estado pela metade.
 */
async function webhook(apiKey, url, secret) {
  if (!apiKey) {
    console.error(
      "Informe a api_key da credencial.\n" +
        '  node scripts/tracken_credential.mjs webhook <api_key> <url> [secret]'
    );
    process.exit(1);
  }

  const limpar = url === "--clear";

  if (!limpar) {
    if (!url) {
      console.error(
        "Informe a URL de destino, ou --clear para apagar o destino atual."
      );
      process.exit(1);
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      console.error(`URL invalida: ${url}`);
      process.exit(1);
    }

    // Mesma regra do worker (lib/tracken/webhook.ts). Checar aqui evita gravar
    // um destino que o dispatch vai recusar depois, quando o erro aparece so
    // como fila parada na tela de Configuracoes.
    const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !local) {
      console.error(
        `A URL precisa usar https (recebido ${parsed.protocol}//).\n` +
          "O corpo leva dado de comprador e vendedor, e o header leva assinatura."
      );
      process.exit(1);
    }
  }

  let webhookSecret = null;
  if (!limpar && secret) {
    const encryptionKey = resolveEncryptionKey();
    if (!encryptionKey) {
      // `readWebhookSecret` no worker aceita texto puro, por compatibilidade
      // com o que a coluna foi criada para guardar. Gravar em claro por aqui
      // seria escolher o pior caminho disponivel: a TRACKen reaproveita o
      // secret da credencial, e em texto puro uma leitura do banco passa a
      // permitir autenticar COMO ela na nossa API de entrada.
      console.error(
        "TRACKEN_ENCRYPTION_KEY nao definida: sem ela o segredo so poderia ser\n" +
          "gravado em texto puro, e ele e o mesmo que autentica a TRACKen na\n" +
          "entrada. Gere a chave com `node scripts/tracken_credential.mjs genkey`."
      );
      process.exit(1);
    }

    webhookSecret = encryptSecret(secret, encryptionKey);

    // A coluna e VARCHAR(255). O formato cifrado de um secret de 32 bytes fica
    // perto de 90 caracteres, entao isso so estoura com um segredo enorme --
    // e nesse caso o Postgres recusaria com erro de tipo, sem dizer o motivo.
    if (webhookSecret.length > 255) {
      console.error(
        `O segredo cifrado tem ${webhookSecret.length} caracteres e a coluna\n` +
          "webhook_secret aceita 255. Use um segredo mais curto."
      );
      process.exit(1);
    }
  }

  const client = connect();
  await client.connect();

  try {
    const { rows } = await client.query(
      `UPDATE tracken_api_credentials
          SET webhook_url = $2,
              webhook_secret = CASE
                WHEN $2::text IS NULL THEN NULL
                WHEN $3::text IS NOT NULL THEN $3
                ELSE webhook_secret
              END
        WHERE api_key = $1
        RETURNING id, name, api_key, environment, is_active, webhook_url,
                  (webhook_secret IS NOT NULL
                   AND btrim(webhook_secret) <> '') AS tem_segredo`,
      [apiKey, limpar ? null : url, webhookSecret]
    );

    const credential = rows[0];
    if (!credential) {
      console.error("Nenhuma credencial encontrada com essa api_key.");
      process.exitCode = 1;
      return;
    }

    if (limpar) {
      console.log("\nDestino do webhook apagado.\n");
      console.log(JSON.stringify(credential, null, 2));
      return;
    }

    console.log("\nDestino do webhook gravado.\n");
    console.log(JSON.stringify(credential, null, 2));

    if (!credential.is_active) {
      console.log(
        "\nAVISO: a credencial esta revogada. O worker so entrega em credencial\n" +
          "ativa, entao a fila continua parada enquanto ela estiver assim."
      );
    }

    if (!credential.tem_segredo) {
      console.log(
        "\nAVISO: sem segredo gravado as entregas saem SEM X-FNVJ-Signature.\n" +
          "A TRACKen nao tem como distinguir a nossa chamada de uma forjada por\n" +
          "quem descobrir a URL."
      );
    }

    // O worker recusa entregar quando ha mais de um destino ativo, em vez de
    // escolher um. Avisar aqui e melhor que descobrir pela fila parada.
    const { rows: outros } = await client.query(
      `SELECT name, api_key, environment, webhook_url
         FROM tracken_api_credentials
        WHERE is_active = true
          AND webhook_url IS NOT NULL
          AND btrim(webhook_url) <> ''
          AND api_key <> $1`,
      [apiKey]
    );

    if (outros.length > 0) {
      console.log(
        "\nATENCAO: outra credencial ativa tambem tem destino configurado.\n" +
          "O worker nao escolhe entre dois destinos: ele para a fila e informa a\n" +
          "ambiguidade, para nao mandar evento de producao para homologacao.\n" +
          "Apague o destino que nao vale mais com:\n" +
          "  node scripts/tracken_credential.mjs webhook <api_key> --clear\n"
      );
      console.log(JSON.stringify(outros, null, 2));
    }
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

    case "webhook":
      await webhook(args[0], args[1], args[2]);
      break;

    default:
      console.log(
        "Comandos:\n" +
          "  genkey\n" +
          "  create <nome> <production|sandbox>\n" +
          "  list\n" +
          "  revoke <api_key>\n" +
          "  webhook <api_key> <url|--clear> [secret]"
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
