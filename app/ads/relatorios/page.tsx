import type { Metadata } from "next";

import ReportsManager from "./reports-manager";

export const metadata: Metadata = {
  title: "Relatórios",
};

/** Histórico e envio dos relatórios exportados do Meta Ads. */
export default function AdsReportsPage() {
  return <ReportsManager />;
}
