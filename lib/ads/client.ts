/**
 * Chamadas da tela do /ads às APIs `/api/ads/*`.
 *
 * Todo erro vira uma frase para quem está usando, sem código nem termo técnico.
 * Mensagens de arquivo (422) e de período (400) já vêm escritas pelo servidor.
 */

export class AdsRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AdsRequestError";
    this.status = status;
  }
}

const GENERIC_MESSAGE = "Não foi possível concluir agora. Tente de novo em alguns instantes.";

export function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "AbortError";
}

export function errorMessage(error: unknown): string {
  return error instanceof AdsRequestError ? error.message : GENERIC_MESSAGE;
}

export function isSessionError(error: unknown): boolean {
  return error instanceof AdsRequestError && error.status === 401;
}

function friendlyMessage(status: number, serverMessage: string): string {
  switch (status) {
    case 401:
      return "Sua sessão terminou. Entre de novo para continuar.";
    case 403:
      return "Seu usuário não tem permissão para esta ação.";
    case 413:
      return "O arquivo passa de 5 MB. Exporte um período menor ou envie em partes.";
    case 400:
    case 404:
    case 422:
      return serverMessage || GENERIC_MESSAGE;
    default:
      return GENERIC_MESSAGE;
  }
}

export async function adsRequest<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new AdsRequestError(0, "Sem conexão com o servidor. Confira a internet e tente de novo.");
  }

  if (response.ok) {
    try {
      return (await response.json()) as T;
    } catch {
      throw new AdsRequestError(response.status, GENERIC_MESSAGE);
    }
  }

  let serverMessage = "";
  try {
    const body = (await response.json()) as { error?: { message?: unknown } } | null;
    if (typeof body?.error?.message === "string") serverMessage = body.error.message;
  } catch {
    // Resposta sem corpo JSON: fica a mensagem padrão do status.
  }
  throw new AdsRequestError(response.status, friendlyMessage(response.status, serverMessage));
}
