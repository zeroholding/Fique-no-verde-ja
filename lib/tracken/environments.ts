import type { TrackenEnvironment } from "./types";

/**
 * Destinos oficiais informados pela TRACKen para cada ambiente.
 *
 * Esta e a fonte de verdade usada pelo worker e pelo diagnostico do painel.
 * Alterar uma URL apenas no banco nao pode redirecionar production para
 * homologacao (ou o inverso) sem que o codigo rejeite a configuracao.
 */
export const TRACKEN_WEBHOOK_URLS = Object.freeze({
  production:
    "https://seller.tracken.app.br/api/ferramentas/controle-reputacao/webhooks/fnvj",
  sandbox:
    "https://homologasellercore.tracken.dev.br/api/ferramentas/controle-reputacao/webhooks/fnvj",
}) satisfies Readonly<Record<TrackenEnvironment, string>>;

const LOCAL_WEBHOOK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

export type ValidatedTrackenWebhook = {
  url: string;
  endpoint: string;
  isLocal: boolean;
};

export function trackenEnvironmentLabel(
  environment: TrackenEnvironment
): string {
  return environment === "production" ? "Producao" : "Homologacao";
}

/** Endpoint sem userinfo, query string ou fragmento, seguro para a UI/log. */
export function sanitizeTrackenWebhookEndpoint(
  value: string | null | undefined
): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "URL invalida";
  }
}

/**
 * Confere o vinculo ambiente -> endpoint, alem da sintaxe da URL.
 *
 * Por padrao apenas os dois endpoints oficiais sao aceitos. Localhost em
 * sandbox exige opt-in explicito do chamador para que uma flag esquecida em
 * producao nunca transforme uma URL arbitraria em destino utilizavel.
 */
export function validateTrackenWebhookUrl(
  value: string,
  environment: TrackenEnvironment,
  options: { allowLocalSandbox?: boolean } = {}
): ValidatedTrackenWebhook {
  const raw = value.trim();
  const canonical = TRACKEN_WEBHOOK_URLS[environment];

  if (raw === canonical) {
    const parsed = new URL(canonical);
    return {
      url: canonical,
      endpoint: `${parsed.origin}${parsed.pathname}`,
      isLocal: false,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`A webhook_url de ${environment} e invalida.`);
  }

  const isLocal = LOCAL_WEBHOOK_HOSTS.has(parsed.hostname);
  const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
  const localAllowed =
    environment === "sandbox" &&
    options.allowLocalSandbox === true &&
    isLocal &&
    isHttp &&
    !parsed.username &&
    !parsed.password;

  if (localAllowed) {
    return {
      url: parsed.toString(),
      endpoint: `${parsed.origin}${parsed.pathname}`,
      isLocal: true,
    };
  }

  const localHint =
    environment === "sandbox"
      ? " Localhost so e aceito com TRACKEN_ALLOW_LOCAL_SANDBOX_WEBHOOK=true."
      : "";
  throw new Error(
    `${trackenEnvironmentLabel(environment)} aceita exatamente ${canonical}.${localHint}`
  );
}
