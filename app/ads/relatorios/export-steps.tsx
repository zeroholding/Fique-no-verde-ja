import { useId } from "react";
import { Download, FileSpreadsheet, Filter, Layers, UploadCloud } from "lucide-react";

import { Card, CardHeader } from "../_components/ui";

/**
 * Passo a passo da exportação no Gerenciador de Anúncios da Meta.
 * Design limpo, profissional, sem emojis e com ícones SVG.
 */
export function ExportSteps() {
  const titleId = useId();
  const steps = [
    {
      icon: Filter,
      title: "Selecione o período",
      desc: (
        <>
          No Gerenciador de Anúncios, acesse a aba <strong>Anúncios</strong> e escolha o período desejado no canto superior direito.
        </>
      ),
    },
    {
      icon: Layers,
      title: "Detalhamento por dia (Obrigatório)",
      desc: (
        <>
          Clique em <strong>Detalhamento</strong> (ao lado de “Colunas”) e selecione <strong>Por tempo › Dia</strong>. Sem isso o Meta gera um total único acumulado e o sistema não aceita.
        </>
      ),
    },
    {
      icon: FileSpreadsheet,
      title: "Colunas de desempenho",
      desc: (
        <>
          Em <strong>Colunas</strong>, escolha <strong>Desempenho e cliques</strong> para incluir cliques, impressões e resultados.
        </>
      ),
    },
    {
      icon: Download,
      title: "Exportar arquivo",
      desc: (
        <>
          Abra o menu de download e selecione <strong>Exportar como .csv</strong> ou <strong>Exportar como .xlsx</strong>.
        </>
      ),
    },
    {
      icon: UploadCloud,
      title: "Enviar no painel",
      desc: (
        <>
          Envie o arquivo aqui. Se o período já existia, o sistema atualiza os dados automaticamente sem duplicar.
        </>
      ),
    },
  ];

  return (
    <Card aria-labelledby={titleId} className="overflow-hidden">
      <CardHeader title="Como exportar do Meta Ads" titleId={titleId} />
      <ol className="divide-y divide-slate-100 px-5 py-2">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={index} className="flex gap-3.5 py-3.5">
              <span
                aria-hidden
                className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-bold"
              >
                {index + 1}
              </span>
              <div className="min-w-0 text-[13px] leading-relaxed text-slate-600">
                <p className="font-semibold text-slate-800 text-[13.5px]">{step.title}</p>
                <div className="mt-0.5 font-normal text-slate-500 [&_strong]:font-semibold [&_strong]:text-slate-800">
                  {step.desc}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 text-[12px] leading-relaxed text-slate-500 font-medium">
        Para ver campanhas e conjuntos no painel, garanta que o relatório contenha as colunas{" "}
        <strong className="font-bold text-slate-700">Nome da campanha</strong> e{" "}
        <strong className="font-bold text-slate-700">Nome do conjunto de anúncios</strong>.
      </div>
    </Card>
  );
}
