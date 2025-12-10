/**
 * Função helper para fazer requisições fetch com headers necessários para ngrok
 * Adiciona automaticamente o header ngrok-skip-browser-warning
 */
export async function fetchWithNgrok(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const headers = new Headers(options?.headers);

  // Adicionar header para pular tela de aviso do ngrok
  headers.set('ngrok-skip-browser-warning', 'true');

  // Adicionar User-Agent customizado como fallback
  headers.set('User-Agent', 'fqnj-app');

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Hook de configuração global para fetch (opcional)
 * Pode ser chamado no início da aplicação para sobrescrever o fetch global
 */
export function setupGlobalFetch() {
  const originalFetch = window.fetch;

  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    headers.set('ngrok-skip-browser-warning', 'true');
    headers.set('User-Agent', 'fqnj-app');

    return originalFetch(input, {
      ...init,
      headers,
    });
  };
}
