import { NextResponse } from "next/server";

/** Erro com codigo e status HTTP explicitos, para respostas previsiveis. */
export class TrackenApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "TrackenApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (
  code: string,
  message: string,
  details?: Record<string, unknown>
) => new TrackenApiError(400, code, message, details);

export const unauthorized = (message = "Falha na autenticacao da credencial") =>
  new TrackenApiError(401, "UNAUTHORIZED", message);

export const forbidden = (code: string, message: string) =>
  new TrackenApiError(403, code, message);

export const notFound = (message = "Atendimento nao encontrado") =>
  new TrackenApiError(404, "NOT_FOUND", message);

export const payloadTooLarge = (message: string) =>
  new TrackenApiError(413, "PAYLOAD_TOO_LARGE", message);

export const unprocessable = (code: string, message: string) =>
  new TrackenApiError(422, code, message);

export const tooManyRequests = (message = "Limite de chamadas excedido") =>
  new TrackenApiError(429, "RATE_LIMITED", message);

/** Converte qualquer erro no formato de resposta da API. */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof TrackenApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      { status: error.status }
    );
  }

  console.error("[TRACKEN] Erro nao tratado:", error);
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Erro interno ao processar a requisicao",
      },
    },
    { status: 500 }
  );
}
