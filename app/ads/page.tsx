import AdsDashboard from "./ads-dashboard";

/**
 * Entrada do módulo de tráfego pago.
 *
 * Estado atual: fundação visual + pré-validação local de relatórios. A
 * persistência só será ligada depois de recebermos um export real da Meta e
 * fixarmos o contrato de colunas em `README.md`.
 */
export default function AdsPage() {
  return <AdsDashboard />;
}
