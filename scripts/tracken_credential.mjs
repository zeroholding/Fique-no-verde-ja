/**
 * Bootstrap das credenciais da integracao Tracken.
 *
 * Uso:
 *   node scripts/tracken_credential.mjs genkey
 *     Gera um valor para TRACKEN_ENCRYPTION_KEY (32 bytes em hex).
 *
 *   node scripts/tracken_credential.mjs create "Tracken Producao" production
 *     Cria a credencial com TRACKEN_CREDENTIAL_SECRET e imprime apenas a
 *     api_key. Nenhum secret e ecoado pelo script.
 *
 *   node scripts/tracken_credential.mjs list
 *     Lista as credenciais existentes (sem expor segredos).
 *
 *   node scripts/tracken_credential.mjs set-environment <api_key> sandbox
 *     Reclassifica uma credencial somente ANTES da migration 025. Usado para
 *     manter a credencial atual da homologacao como sandbox.
 *
 *   node scripts/tracken_credential.mjs revoke <api_key>
 *     Desativa uma credencial.
 *
 *   node scripts/tracken_credential.mjs webhook <api_key> <url>
 *     Grava o destino das notificacoes de saida. Se
 *     TRACKEN_WEBHOOK_SECRET estiver definido, cifra e substitui o secret;
 *     sem a variavel, preserva o valor ja gravado. Use `--clear` no lugar da
 *     URL para apagar ambos. O secret nunca vira argumento/historico do shell.
 *
 * Conexao: usa process.env.DATABASE_URL (o mesmo que a aplicacao usa em
 * lib/db.ts). Nao use o client do Supabase aqui: o .env.local aponta para um
 * projeto Supabase que NAO e o banco de producao.
 *
 * O secret nunca fica em texto puro no banco: guarda-se o hash SHA-256 e uma
 * copia cifrada em AES-256-GCM usada para validar a assinatura HMAC. O comando
 * `create` exige TRACKEN_ENCRYPTION_KEY valida e sempre cria a credencial com
 * assinatura obrigatoria; configuracao ausente/invalida falha antes do INSERT.
 */

import crypto from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });

const TRACKEN_WEBHOOK_URLS = Object.freeze({
  production:
    "https://seller.tracken.app.br/api/ferramentas/controle-reputacao/webhooks/fnvj",
  sandbox:
    "https://homologasellercore.tracken.dev.br/api/ferramentas/controle-reputacao/webhooks/fnvj",
});

const LOCAL_WEBHOOK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

const ALLOW_LOCAL_SANDBOX_WEBHOOK =
  process.env.TRACKEN_ALLOW_LOCAL_SANDBOX_WEBHOOK === "true";

function sanitizeWebhookEndpoint(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "URL invalida";
  }
}

function validateWebhookUrl(value, environment) {
  const canonical = TRACKEN_WEBHOOK_URLS[environment];
  if (!canonical) {
    throw new Error(`Ambiente Tracken invalido: ${environment}`);
  }

  if (value === canonical) {
    return value;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("URL de webhook invalida.");
  }

  const local = LOCAL_WEBHOOK_HOSTS.has(parsed.hostname);
  const http = parsed.protocol === "http:" || parsed.protocol === "https:";

  if (
    environment === "sandbox" &&
    ALLOW_LOCAL_SANDBOX_WEBHOOK &&
    local &&
    http &&
    !parsed.username &&
    !parsed.password
  ) {
    return parsed.toString();
  }

  const label = environment === "production" ? "production" : "sandbox";
  throw new Error(
    `A credencial ${label} aceita exatamente ${canonical}` +
      (environment === "sandbox"
        ? " (localhost exige TRACKEN_ALLOW_LOCAL_SANDBOX_WEBHOOK=true)."
        : ".")
  );
}

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
  if (!name?.trim() || !environment) {
    throw new Error(
      'Uso: node scripts/tracken_credential.mjs create "<nome>" <production|sandbox>. Nome e ambiente sao obrigatorios.'
    );
  }
  if (!["production", "sandbox"].includes(environment)) {
    console.error('environment deve ser "production" ou "sandbox"');
    process.exit(1);
  }

  const prefix = environment === "production" ? "fnvj_live" : "fnvj_test";
  const apiKey = `${prefix}_${crypto.randomBytes(18).toString("hex")}`;
  const secret = process.env.TRACKEN_CREDENTIAL_SECRET?.trim();

  // O operador fornece o valor por variavel de ambiente e o entrega por canal
  // seguro. Gerar e imprimir aqui faria o secret parar em terminal/CI/log.
  if (!secret || !/^[A-Za-z0-9_-]{32,}$/.test(secret)) {
    throw new Error(
      "TRACKEN_CREDENTIAL_SECRET ausente ou invalido: informe ao menos 32 caracteres base64url; o script nunca imprime esse valor."
    );
  }

  const encryptionKey = resolveEncryptionKey();
  if (!encryptionKey) {
    throw new Error(
      "TRACKEN_ENCRYPTION_KEY nao configurada: o comando create exige uma chave valida e nao cria credencial sem HMAC. Gere uma com `node scripts/tracken_credential.mjs genkey`."
    );
  }
  const secretEncrypted = encryptSecret(secret, encryptionKey);

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
         $5, true, true
       )
       RETURNING id, name, api_key, environment, require_signature, created_at`,
      [name.trim(), apiKey, sha256(secret), secretEncrypted, environment]
    );

    console.log("\nCredencial criada.\n");
    console.log(JSON.stringify(rows[0], null, 2));
    console.log("\n--- ENTREGAR PARA A TRACKEN POR CANAL SEGURO ---");
    console.log(`api_key : ${apiKey}`);
    console.log(
      "secret  : use o valor de TRACKEN_CREDENTIAL_SECRET (nao exibido)"
    );

    console.log(
      "\nAssinatura HMAC EXIGIDA. Headers obrigatorios em cada chamada:\n" +
        "  X-FNVJ-Timestamp: <unix seconds>\n" +
        "  X-FNVJ-Signature: sha256=HMAC_SHA256(secret, timestamp + '.' + corpo)"
    );
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
              is_active, last_used_at, expires_at, created_at
         FROM tracken_api_credentials
        ORDER BY created_at DESC`
    );

    if (rows.length === 0) {
      console.log("Nenhuma credencial cadastrada.");
      return;
    }

    // Nunca imprime webhook_secret nem query string que possa carregar token.
    const publicRows = rows.map(({ webhook_url, ...row }) => {
      let webhookUrlValid = false;
      let webhookBlockedReason = null;
      if (webhook_url) {
        try {
          validateWebhookUrl(webhook_url, row.environment);
          webhookUrlValid = true;
        } catch (error) {
          webhookBlockedReason = error.message ?? String(error);
        }
      }

      const expired = Boolean(
        row.expires_at && new Date(row.expires_at).getTime() <= Date.now()
      );
      return {
        ...row,
        expired,
        expected_webhook_endpoint: TRACKEN_WEBHOOK_URLS[row.environment] ?? null,
        webhook_endpoint: sanitizeWebhookEndpoint(webhook_url),
        webhook_url_valid: webhookUrlValid,
        webhook_usable: Boolean(
          row.is_active &&
            !expired &&
            webhookUrlValid &&
            (!row.require_signature || row.webhook_assinado)
        ),
        webhook_blocked_reason: webhookBlockedReason,
      };
    });
    console.log(JSON.stringify(publicRows, null, 2));
  } finally {
    await client.end().catch(() => {});
  }
}

async function setEnvironment(apiKey, environment) {
  if (!apiKey || !["production", "sandbox"].includes(environment)) {
    throw new Error(
      "Uso: node scripts/tracken_credential.mjs set-environment <api_key> <production|sandbox>"
    );
  }

  const client = connect();
  await client.connect();
  try {
    await client.query("BEGIN");

    // Depois da 025 o ambiente fica congelado por trigger. Recusar aqui gera
    // uma mensagem clara antes de depender do erro interno do PostgreSQL.
    const migrated = await client.query(
      `SELECT 1
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'tracken_tickets'
          AND column_name = 'environment'`
    );
    if (migrated.rowCount > 0) {
      throw new Error(
        "A migration 025 ja foi aplicada: environment e imutavel. Nao reclassifique credenciais depois do backfill."
      );
    }

    const current = await client.query(
      `SELECT id, name, environment, webhook_url, is_active
         FROM tracken_api_credentials
        WHERE api_key = $1
        FOR UPDATE`,
      [apiKey]
    );
    const credential = current.rows[0];
    if (!credential) throw new Error("Credencial nao encontrada.");

    if (credential.webhook_url) {
      validateWebhookUrl(credential.webhook_url, environment);
    }

    const conflict = await client.query(
      `SELECT name
         FROM tracken_api_credentials
        WHERE environment = $1
          AND id <> $2
          AND is_active = true
          AND webhook_url IS NOT NULL
          AND btrim(webhook_url) <> ''
        LIMIT 1`,
      [environment, credential.id]
    );
    if (conflict.rowCount > 0) {
      throw new Error(
        `Ja existe destino ativo em ${environment}: ${conflict.rows[0].name}.`
      );
    }

    const updated = await client.query(
      `UPDATE tracken_api_credentials
          SET environment = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING name, api_key, environment, is_active, expires_at`,
      [credential.id, environment]
    );
    await client.query("COMMIT");
    console.log("\nAmbiente da credencial atualizado antes da migration 025.\n");
    console.log(JSON.stringify(updated.rows[0], null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
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
async function webhook(apiKey, url) {
  const secret = process.env.TRACKEN_WEBHOOK_SECRET?.trim() || null;
  if (!apiKey) {
    console.error(
      "Informe a api_key da credencial.\n" +
        "  node scripts/tracken_credential.mjs webhook <api_key> <url>"
    );
    process.exit(1);
  }

  const limpar = url === "--clear";
  if (!limpar && !url) {
    console.error(
      "Informe a URL de destino, ou --clear para apagar o destino atual."
    );
    process.exit(1);
  }

  if (secret && secret.length < 32) {
    throw new Error(
      "TRACKEN_WEBHOOK_SECRET invalido: informe ao menos 32 caracteres; o valor nunca deve ser passado como argumento do comando."
    );
  }

  const client = connect();
  await client.connect();

  try {
    await client.query("BEGIN");

    const { rows: credentialRows } = await client.query(
      `SELECT id, name, api_key, environment, require_signature, is_active,
              expires_at,
              (webhook_secret IS NOT NULL
               AND btrim(webhook_secret) <> '') AS tem_segredo
         FROM tracken_api_credentials
        WHERE api_key = $1
        FOR UPDATE`,
      [apiKey]
    );

    const credential = credentialRows[0];
    if (!credential) {
      throw new Error("Nenhuma credencial encontrada com essa api_key.");
    }

    let targetUrl = null;
    let webhookSecret = null;

    if (!limpar) {
      // A validacao depende do ambiente persistido e acontece ANTES do UPDATE.
      // Production aceita apenas o endpoint production; sandbox aceita apenas
      // o endpoint sandbox, com excecao explicita para desenvolvimento local.
      targetUrl = validateWebhookUrl(url, credential.environment);

      if (secret) {
        const encryptionKey = resolveEncryptionKey();
        if (!encryptionKey) {
          throw new Error(
            "TRACKEN_ENCRYPTION_KEY nao definida: o segredo do webhook nao pode ser gravado em texto puro."
          );
        }

        webhookSecret = encryptSecret(secret, encryptionKey);
        if (webhookSecret.length > 255) {
          throw new Error(
            `O segredo cifrado tem ${webhookSecret.length} caracteres; webhook_secret aceita 255.`
          );
        }
      }

      // Omissao preserva o valor atual. Se a credencial exige HMAC e nao ha
      // valor atual nem novo, recusa antes de criar um target inutilizavel.
      if (
        credential.require_signature &&
        !credential.tem_segredo &&
        !webhookSecret
      ) {
        throw new Error(
          "A credencial exige assinatura e nao possui webhook_secret. Defina TRACKEN_WEBHOOK_SECRET antes de configurar o destino."
        );
      }

      // Exatamente um target ativo por ambiente. O outro ambiente nao entra na
      // consulta, portanto production e sandbox podem coexistir. A checagem e
      // anterior ao UPDATE; o indice parcial da migration 025 cobre a corrida.
      const { rows: conflicts } = await client.query(
        `SELECT name
           FROM tracken_api_credentials
          WHERE environment = $1
            AND id <> $2
            AND is_active = true
            AND webhook_url IS NOT NULL
            AND btrim(webhook_url) <> ''
          FOR UPDATE`,
        [credential.environment, credential.id]
      );

      if (conflicts.length > 0) {
        const names = conflicts.map((row) => row.name).join(", ");
        throw new Error(
          `Ja existe destino ativo em ${credential.environment}: ${names}. ` +
            "Limpe ou revogue esse destino antes de configurar outro no mesmo ambiente."
        );
      }
    }

    const { rows } = await client.query(
      `UPDATE tracken_api_credentials
          SET webhook_url = $2,
              webhook_secret = CASE
                WHEN $2::text IS NULL THEN NULL
                WHEN $3::text IS NOT NULL THEN $3
                ELSE webhook_secret
              END
        WHERE id = $1
        RETURNING id, name, api_key, environment, is_active, expires_at,
                  (webhook_secret IS NOT NULL
                   AND btrim(webhook_secret) <> '') AS tem_segredo`,
      [credential.id, limpar ? null : targetUrl, webhookSecret]
    );

    await client.query("COMMIT");

    const updated = rows[0];
    console.log(
      limpar
        ? "\nDestino do webhook apagado.\n"
        : "\nDestino do webhook gravado.\n"
    );
    // Nao inclui secret, ciphertext nem query string da URL.
    console.log(
      JSON.stringify(
        {
          ...updated,
          webhook_endpoint: limpar
            ? null
            : sanitizeWebhookEndpoint(targetUrl),
        },
        null,
        2
      )
    );

    if (!updated.is_active) {
      console.log(
        "\nAVISO: a credencial esta revogada; o worker nao usa este destino."
      );
    } else if (
      updated.expires_at &&
      new Date(updated.expires_at).getTime() <= Date.now()
    ) {
      console.log(
        "\nAVISO: a credencial esta expirada; o worker nao usa este destino."
      );
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
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
      await create(args[0], args[1]);
      break;

    case "list":
      await list();
      break;

    case "set-environment":
      await setEnvironment(args[0], args[1]);
      break;

    case "revoke":
      await revoke(args[0]);
      break;

    case "webhook":
      if (args[2]) {
        throw new Error(
          "Nao passe secret na linha de comando. Use TRACKEN_WEBHOOK_SECRET para evitar historico/log do shell."
        );
      }
      await webhook(args[0], args[1]);
      break;

    default:
      console.log(
        "Comandos:\n" +
          "  genkey\n" +
          "  create <nome> <production|sandbox>\n" +
          "  list\n" +
          "  set-environment <api_key> <production|sandbox>\n" +
          "  revoke <api_key>\n" +
          "  webhook <api_key> <url|--clear>"
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
