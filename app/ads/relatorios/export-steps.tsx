import { useId } from "react";

import { Card, CardHeader } from "../_components/ui";

/** Passo a passo da exportação no Gerenciador de Anúncios, com os nomes que aparecem na tela do Meta. */
export function ExportSteps() {
  const titleId = useId();
  const steps = [
    <>
      No Gerenciador de Anúncios, abra a aba <strong>Anúncios</strong> e escolha o período.
    </>,
    <>
      Em <strong>Detalhamento</strong>, escolha <strong>Por tempo › Dia</strong>.
    </>,
    <>
      Em <strong>Colunas</strong>, use <strong>Desempenho e cliques</strong>, ou inclua investimento,
      impressões, alcance, cliques no link e resultados.
    </>,
    <>
      Clique em <strong>Exportar › Exportar dados da tabela</strong> e escolha <strong>CSV</strong> ou{" "}
      <strong>Excel (.xlsx)</strong>.
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
        Para ver campanhas e conjuntos no painel, inclua também as colunas <strong className="font-medium">Nome da campanha</strong> e{" "}
        <strong className="font-medium">Nome do conjunto de anúncios</strong>.
      </p>
    </Card>
  );
}
