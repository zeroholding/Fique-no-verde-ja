import type { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { trackenQuery } from "./db";
import { decryptSecret, sha256, timingSafeEqual, verifySignature } from "./crypto";
import { forbidden, tooManyRequests, unauthorized } from "./errors";

/**
 * Autenticacao do modulo Tracken.
 *
 * Sao dois mundos distintos, que nunca se misturam:
 *  - `/api/tracken/v1/*`  -> credencial de maquina da Tracken
 *  - `/api/tracken/*`     -> JWT do usuario logado no painel
 */

// ---------------------------------------------------------------
// Credencial de maquina (Tracken chamando a FNVJ)
// ---------------------------------------------------------------

export type TrackenCredential = {
  id: string;
  name: string;
  api_key: string;
  secret_hash: string;
  secret_encrypted: string | null;
  scopes: string[];
  environment: string;
  allowed_ips: string[];
  require_signature: boolean;
  is_active: boolean;
  expires_at: string | null;
};

/** Janela de tolerancia da assinatura, em segundos. Barra ataque de replay. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Teto de chamadas por credencial dentro da janela. */
const RATE_LIMIT_MAX_REQUESTS = 120;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Contador em memoria por credencial.
 * Em ambiente serverless o contador e por instancia, entao serve como
 * primeira barreira, nao como garantia global.
 */
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function enforceRateLimit(credentialId: string): void {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(credentialId);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(credentialId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return;
  }

  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
    throw tooManyRequests(
      `Limite de ${RATE_LIMIT_MAX_REQUESTS} chamadas por minuto excedido`
    );
  }
}

export function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip");
}

/**
 * Extrai `api_key` e `secret` da requisicao.
 *
 * Formato principal:  Authorization: Bearer <api_key>.<secret>
 * Formato alternativo: X-FNVJ-Api-Key + X-FNVJ-Api-Secret
 */
function extractCredentialParts(
  request: NextRequest
): { apiKey: string; secret: string } | null {
  const headerKey = request.headers.get("x-fnvj-api-key");
  const headerSecret = request.headers.get("x-fnvj-api-secret");
  if (headerKey && headerSecret) {
    return { apiKey: headerKey.trim(), secret: headerSecret.trim() };
  }

  const authorization = request.headers.get("authorization");
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.substring(7).trim();
  const separatorIndex = token.lastIndexOf(".");
  if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
    return null;
  }

  return {
    apiKey: token.substring(0, separatorIndex),
    secret: token.substring(separatorIndex + 1),
  };
}

/**
 * Valida a credencial da Tracken.
 *
 * Ordem das checagens: credencial existe e esta ativa -> nao expirou ->
 * secret confere -> IP permitido -> assinatura (quando exigida) ->
 * escopo -> rate limit.
 *
 * @param rawBody corpo bruto da requisicao, necessario para a assinatura
 */
export async function authenticateMachineRequest(
  request: NextRequest,
  options: { rawBody?: string; requiredScope: string }
): Promise<TrackenCredential> {
  const parts = extractCredentialParts(request);
  if (!parts) {
    throw unauthorized(
      "Credencial ausente: envie Authorization: Bearer <api_key>.<secret>"
    );
  }

  const result = await trackenQuery<TrackenCredential>(
    `SELECT id, name, api_key, secret_hash, secret_encrypted, scopes,
            environment, allowed_ips, require_signature, is_active, expires_at
       FROM tracken_api_credentials
      WHERE api_key = $1`,
    [parts.apiKey]
  );

  const credential = result.rows[0];
  if (!credential || !credential.is_active) {
    throw unauthorized("Credencial invalida ou inativa");
  }

  if (credential.expires_at && new Date(credential.expires_at) <= new Date()) {
    throw unauthorized("Credencial expirada");
  }

  if (!timingSafeEqual(credential.secret_hash, sha256(parts.secret))) {
    throw unauthorized("Credencial invalida ou inativa");
  }

  if (credential.allowed_ips.length > 0) {
    const clientIp = getClientIp(request);
    if (!clientIp || !credential.allowed_ips.includes(clientIp)) {
      throw forbidden(
        "IP_NOT_ALLOWED",
        "Endereco de origem nao autorizado para esta credencial"
      );
    }
  }

  if (credential.require_signature) {
    verifyRequestSignature(request, credential, options.rawBody ?? "");
  }

  if (!credential.scopes.includes(options.requiredScope)) {
    throw forbidden(
      "MISSING_SCOPE",
      `Credencial nao possui o escopo "${options.requiredScope}"`
    );
  }

  enforceRateLimit(credential.id);

  // Registro de uso; falha aqui nao deve barrar a requisicao.
  trackenQuery(
    `UPDATE tracken_api_credentials
        SET last_used_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [credential.id]
  ).catch((error) => {
    console.error("[TRACKEN] Falha ao registrar uso da credencial:", error);
  });

  return credential;
}

function verifyRequestSignature(
  request: NextRequest,
  credential: TrackenCredential,
  rawBody: string
): void {
  const timestamp = request.headers.get("x-fnvj-timestamp");
  const signature = request.headers.get("x-fnvj-signature");

  if (!timestamp || !signature) {
    throw unauthorized(
      "Assinatura obrigatoria: envie X-FNVJ-Timestamp e X-FNVJ-Signature"
    );
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    throw unauthorized("X-FNVJ-Timestamp invalido");
  }

  const driftSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
  if (driftSeconds > SIGNATURE_TOLERANCE_SECONDS) {
    throw unauthorized(
      `X-FNVJ-Timestamp fora da janela de ${SIGNATURE_TOLERANCE_SECONDS} segundos`
    );
  }

  if (!credential.secret_encrypted) {
    // Configuracao incompleta: a credencial exige assinatura mas nao guarda o
    // secret de forma recuperavel. Falhar explicitamente e melhor que aceitar.
    throw forbidden(
      "SIGNATURE_NOT_CONFIGURED",
      "Credencial exige assinatura mas nao possui secret recuperavel gravado"
    );
  }

  let plainSecret: string;
  try {
    plainSecret = decryptSecret(credential.secret_encrypted);
  } catch (error) {
    console.error("[TRACKEN] Falha ao decifrar secret da credencial:", error);
    throw forbidden(
      "SIGNATURE_NOT_CONFIGURED",
      "Nao foi possivel recuperar o secret da credencial para validar a assinatura"
    );
  }

  if (!verifySignature(plainSecret, timestamp, rawBody, signature)) {
    throw unauthorized("Assinatura invalida");
  }
}

// ---------------------------------------------------------------
// Usuario do painel (JWT compartilhado com o dashboard atual)
// ---------------------------------------------------------------

export type TrackenPanelUser = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_admin: boolean;
};

/**
 * O segredo tem de ser o mesmo que assinou o token no `/api/auth/signin`,
 * senao nenhuma sessao existente valida. Por isso o fallback historico do
 * projeto e mantido, mas com aviso alto em producao.
 */
function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[TRACKEN] JWT_SECRET nao configurada em producao: sessoes usam segredo default"
    );
  }
  return "your-secret-key-change-this";
}

function getUserTokenFromRequest(request: NextRequest): string | null {
  const cookieToken = request.cookies.get("token")?.value;
  if (cookieToken) {
    return cookieToken;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  return null;
}

/** Valida a sessao do atendente e devolve o usuario lido do banco. */
export async function authenticatePanelUser(
  request: NextRequest
): Promise<TrackenPanelUser> {
  const token = getUserTokenFromRequest(request);
  if (!token) {
    throw unauthorized("Token de autenticacao nao informado");
  }

  let userId: string;
  try {
    const decoded = jwt.verify(token, resolveJwtSecret()) as { userId?: string };
    if (!decoded?.userId) {
      throw new Error("Token sem userId");
    }
    userId = decoded.userId;
  } catch {
    throw unauthorized("Sessao invalida ou expirada");
  }

  const result = await trackenQuery<TrackenPanelUser & { is_active: boolean }>(
    `SELECT id, first_name, last_name, email, is_admin, is_active
       FROM users
      WHERE id = $1`,
    [userId]
  );

  const user = result.rows[0];
  if (!user) {
    throw unauthorized("Usuario nao encontrado");
  }
  if (!user.is_active) {
    throw forbidden("USER_INACTIVE", "Usuario desativado");
  }

  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    is_admin: user.is_admin,
  };
}

/** Exige perfil administrativo. */
export async function authenticatePanelAdmin(
  request: NextRequest
): Promise<TrackenPanelUser> {
  const user = await authenticatePanelUser(request);
  if (!user.is_admin) {
    throw forbidden(
      "ADMIN_REQUIRED",
      "Usuario nao possui permissao administrativa"
    );
  }
  return user;
}
