import { useId } from "react";

import { Card, CardHeader } from "../_components/ui";

/**
 * Passo a passo da exportação no Gerenciador de Anúncios.
 *
 * Os nomes seguem a tela do Meta vista em 13/10/2026: botão “Detalhamento” ao
 * lado de “Colunas” e, no menu do ícone de download, “Exportar como .csv” e
 * “Exportar como .xlsx”. Se o Meta mudar os rótulos, ajuste aqui e no README.
 */
export function ExportSteps() {
  const titleId = useId();
  const steps = [
    <>
      No Gerenciador de Anúncios, abra a aba <strong>Anúncios</strong> e escolha o período no canto direito.
    </>,
    <>
      Clique em <strong>Detalhamento</strong>, ao lado de “Colunas”, e escolha <strong>Por tempo › Dia</strong>.
      Sem isso o Meta exporta um total único do período, e o painel não consegue mostrar dia a dia.
    </>,
    <>
      Em <strong>Colunas</strong>, escolha <strong>Desempenho e cliques</strong>. Só <strong>Desempenho</strong>{" "}
      também funciona, mas sem os cliques no link.
    </>,
    <>
      Abra o menu do ícone de download (a setinha ao lado dele) e escolha <strong>Exportar como .csv</strong> ou{" "}
      <strong>Exportar como .xlsx</strong>.
    </>,
    <>Envie o arquivo aqui. Reenviar um período troca os dados dele, sem duplicar.</>,
  ];

  return (
    <Card aria-labelledby={titleId}>
      <CardHeader title="Como exportar do Meta" titleId={titleId} />
      <ol className="space-y-3 px-4 py-4 text-[13.5px] leading-relaxed text-[var(--ads-ink-soft)] sm:px-5">
        {steps.map((step, index) => (
          <li key={index} className="flex gap-3">
            <span
              aria-hidden
              className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-[var(--ads-line-strong)] text-[11.5px] font-semibold text-[var(--ads-ink)]"
            >
              {index + 1}
            </span>
            <span className="[&_strong]:font-medium [&_strong]:text-[var(--ads-ink)]">{step}</span>
          </li>
        ))}
      </ol>
      <p className="border-t border-[var(--ads-line)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--ads-ink-muted)] sm:px-5">
        Para ver campanhas e conjuntos no painel, o arquivo precisa ter as colunas{" "}
        <strong className="font-medium">Nome da campanha</strong> e{" "}
        <strong className="font-medium">Nome do conjunto de anúncios</strong>. Sem elas, o painel mostra só por
        anúncio.
      </p>
    </Card>
  );
}
