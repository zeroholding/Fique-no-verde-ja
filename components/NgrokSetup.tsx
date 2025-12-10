"use client";

import { useEffect } from "react";

/**
 * Ajusta o fetch global para adicionar o header do ngrok sem interferir em uploads.
 */
export default function NgrokSetup() {
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      try {
        const baseHeaders =
          input instanceof Request ? input.headers : undefined;
        const headers = new Headers(baseHeaders);

        if (init?.headers) {
          new Headers(init.headers).forEach((value, key) => {
            headers.set(key, value);
          });
        }

        headers.set("ngrok-skip-browser-warning", "true");

        return originalFetch(input, {
          ...init,
          headers,
        });
      } catch (err) {
        console.warn("Fallback para fetch original (NgrokSetup)", err);
        return originalFetch(input, init);
      }
    };
  }, []);

  return null;
}
