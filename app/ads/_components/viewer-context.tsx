"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Quem está usando o /ads, lido do banco no layout (servidor).
 *
 * Serve só para a tela decidir o que mostrar, como o botão de enviar relatório.
 * A permissão de verdade é conferida de novo em cada API.
 */
export type AdsViewer = {
  name: string;
  isAdmin: boolean;
};

const AdsViewerContext = createContext<AdsViewer>({ name: "", isAdmin: false });

export function AdsViewerProvider({ viewer, children }: { viewer: AdsViewer; children: ReactNode }) {
  return <AdsViewerContext.Provider value={viewer}>{children}</AdsViewerContext.Provider>;
}

export function useAdsViewer(): AdsViewer {
  return useContext(AdsViewerContext);
}
