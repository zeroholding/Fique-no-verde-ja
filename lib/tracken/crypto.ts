import crypto from "crypto";

/**
 * Primitivas criptograficas do modulo Tracken.
 *
 * REGRA DO PROJETO: nenhum segredo desta integracao tem valor default. Se a
 * variavel de ambiente faltar, a operacao falha de forma explicita em vez de
 * cair silenciosamente em uma chave conhecida.
 */

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTED_PREFIX = "v1";

/** Compara duas strings em tempo constante. */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) {
    // Ainda faz uma comparacao para nao vazar o tamanho pelo tempo de resposta.
    crypto.timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return crypto.timingSafeEqual(bufferA, bufferB);
}

/** Hash SHA-256 em hex. Usado para conferir o secret apresentado. */
export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

/** Gera um identificador publico de credencial. */
export function generateApiKey(environment: "production" | "sandbox"): string {
  const prefix = environment === "production" ? "fnvj_live" : "fnvj_test";
  return `${prefix}_${crypto.randomBytes(18).toString("hex")}`;
}

/** Gera um secret compartilhado. Exibido uma unica vez, na criacao. */
export function generateApiSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function resolveEncryptionKey(): Buffer {
  const raw = process.env.TRACKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TRACKEN_ENCRYPTION_KEY nao configurada: impossivel cifrar ou decifrar secrets da Tracken"
    );
  }

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

/** Cifra um segredo para persistencia. Formato: v1.<iv>.<tag>.<dados>. */
export function encryptSecret(plainText: string): string {
  const key = resolveEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTED_PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

/** Decifra um segredo persistido. */
export function decryptSecret(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== ENCRYPTED_PREFIX) {
    throw new Error("Secret cifrado em formato desconhecido");
  }

  const key = resolveEncryptionKey();
  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    key,
    Buffer.from(parts[1], "base64")
  );
  decipher.setAuthTag(Buffer.from(parts[2], "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(parts[3], "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Assinatura das trocas com a Tracken.
 * Base assinada: `<timestamp>.<corpo bruto>`.
 */
export function buildSignature(
  secret: string,
  timestamp: string,
  rawBody: string
): string {
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  return `sha256=${hmac}`;
}

/** Confere a assinatura recebida contra a esperada. */
export function verifySignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  receivedSignature: string
): boolean {
  const expected = buildSignature(secret, timestamp, rawBody);
  const normalized = receivedSignature.trim().toLowerCase();
  return timingSafeEqual(expected, normalized);
}
