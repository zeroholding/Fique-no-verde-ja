"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { inteiro, rotuloDaHora } from "./formato";
import { escalaVertical, type PontoDoGrafico } from "./pontos";

/* Verde do "VERDE" do logotipo e o ciano do modelo. Os mesmos da legenda (live.css). */
const COR_ATRASOS = "#00c32f";
const COR_RECLAMACOES = "#22d3ee";
const FUNDO = "#0a0a0a";
const LINHA_DO_EIXO = "rgba(255, 255, 255, 0.22)";
const GRADE = "rgba(255, 255, 255, 0.07)";

type PropsDoPonto = { cx?: number; cy?: number; payload?: PontoDoGrafico };

function PontoDaSerie({ cx, cy, payload, cor, raio }: PropsDoPonto & { cor: string; raio: number }) {
  if (typeof cx !== "number" || typeof cy !== "number" || !payload || payload.futura) return null;
  if (payload.atual) {
    // Hora em andamento: o ponto pulsa, porque o número ainda vai crescer.
    return (
      <g>
        <circle className="lv-ponto-agora" cx={cx} cy={cy} r={raio} fill={cor} />
        <circle cx={cx} cy={cy} r={raio * 1.15} fill={cor} stroke={FUNDO} strokeWidth={2} />
      </g>
    );
  }
  return <circle cx={cx} cy={cy} r={raio} fill={cor} stroke={FUNDO} strokeWidth={2} />;
}

type PropsDaMarca = { x?: number; y?: number; payload?: { value?: number | string } };

function MarcaDaHora({ x, y, payload, horaAtual, fonte }: PropsDaMarca & { horaAtual: number | null; fonte: number }) {
  if (typeof x !== "number" || typeof y !== "number" || payload?.value === undefined) return null;
  const hora = Number(payload.value);
  const atual = hora === horaAtual;
  const futura = horaAtual !== null && hora > horaAtual;
  const cor = atual ? "#ffffff" : futura ? "#5b6067" : "#a0a0a0";

  return (
    <g transform={`translate(${x},${y})`}>
      <text dy={fonte * 1.25} textAnchor="middle" fill={cor} fontSize={fonte} fontWeight={atual ? 700 : 500}>
        {rotuloDaHora(hora)}
      </text>
      {atual && (
        <text dy={fonte * 2.45} textAnchor="middle" fill={COR_ATRASOS} fontSize={fonte * 0.82} fontWeight={600}>
          em andamento
        </text>
      )}
    </g>
  );
}

type ItemDaDica = { dataKey?: string | number; value?: number | string | null };

function DicaDaHora({ active, payload }: { active?: boolean; payload?: ItemDaDica[] }) {
  const ponto = (payload?.[0] as { payload?: PontoDoGrafico } | undefined)?.payload;
  if (!active || !ponto || ponto.futura) return null;

  return (
    <div className="lv-dica">
      <p className="lv-dica__titulo">
        {rotuloDaHora(ponto.hora)} às {rotuloDaHora((ponto.hora + 1) % 24)}
        {ponto.atual ? " (em andamento)" : ""}
      </p>
      <p className="lv-dica__linha" style={{ ["--lv-cor" as string]: COR_ATRASOS }}>
        <span className="lv-dica__nome">Atrasos</span>
        <span className="lv-dica__valor">{inteiro(ponto.atrasos ?? 0)}</span>
      </p>
      <p className="lv-dica__linha" style={{ ["--lv-cor" as string]: COR_RECLAMACOES }}>
        <span className="lv-dica__nome">Reclamações</span>
        <span className="lv-dica__valor">{inteiro(ponto.reclamacoes ?? 0)}</span>
      </p>
      <p className="lv-dica__linha">
        <span className="lv-dica__nome">Atendimentos</span>
        <span className="lv-dica__valor">{inteiro(ponto.atendimentos ?? 0)}</span>
      </p>
    </div>
  );
}

type Props = {
  pontos: PontoDoGrafico[];
  horaAtual: number | null;
  /** --lv-u em pixels. */
  unidade: number;
  animar: boolean;
};

/** Remoções por hora: atrasos (verde) e reclamações (ciano). */
export default function GraficoPorHora({ pontos, horaAtual, unidade, animar }: Props) {
  const { teto, marcas } = escalaVertical(pontos);
  const fonte = Math.max(11, unidade * 0.86);
  const raio = Math.max(3.5, unidade * 0.3);
  const traco = Math.max(2, unidade * 0.16);
  const temHoraAtual = horaAtual !== null && pontos.some((ponto) => ponto.atual);

  return (
    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
      <ComposedChart data={pontos} margin={{ top: fonte * 0.8, right: fonte * 0.6, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="lv-area-atrasos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COR_ATRASOS} stopOpacity={0.2} />
            <stop offset="100%" stopColor={COR_ATRASOS} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="lv-area-reclamacoes" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COR_RECLAMACOES} stopOpacity={0.24} />
            <stop offset="100%" stopColor={COR_RECLAMACOES} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid stroke={GRADE} vertical horizontal />

        <XAxis
          dataKey="hora"
          interval={0}
          tickLine={false}
          axisLine={{ stroke: LINHA_DO_EIXO }}
          height={Math.ceil(fonte * 3.5)}
          padding={{ left: fonte * 0.8, right: fonte * 0.8 }}
          tick={(props: PropsDaMarca) => <MarcaDaHora {...props} horaAtual={horaAtual} fonte={fonte} />}
        />
        <YAxis
          domain={[0, teto]}
          ticks={marcas}
          allowDecimals={false}
          width="auto"
          tickLine={false}
          axisLine={{ stroke: LINHA_DO_EIXO }}
          tick={{ fill: "#a0a0a0", fontSize: fonte }}
          tickFormatter={(valor: number) => inteiro(valor)}
        />

        <Tooltip
          content={<DicaDaHora />}
          cursor={{ stroke: "rgba(255, 255, 255, 0.2)", strokeWidth: 1 }}
          isAnimationActive={false}
        />

        {temHoraAtual && (
          <ReferenceLine x={horaAtual} stroke="rgba(255, 255, 255, 0.16)" strokeDasharray="4 6" />
        )}

        <Area
          type="monotone"
          dataKey="reclamacoes"
          name="Reclamações"
          stroke={COR_RECLAMACOES}
          strokeWidth={traco}
          fill="url(#lv-area-reclamacoes)"
          connectNulls={false}
          dot={(props: PropsDoPonto) => <PontoDaSerie {...props} cor={COR_RECLAMACOES} raio={raio} />}
          activeDot={{ r: raio * 1.5, fill: COR_RECLAMACOES, stroke: FUNDO, strokeWidth: 2 }}
          isAnimationActive={animar}
          animationDuration={900}
          animationEasing="ease-out"
        />
        <Area
          type="monotone"
          dataKey="atrasos"
          name="Atrasos"
          stroke={COR_ATRASOS}
          strokeWidth={traco}
          fill="url(#lv-area-atrasos)"
          connectNulls={false}
          dot={(props: PropsDoPonto) => <PontoDaSerie {...props} cor={COR_ATRASOS} raio={raio} />}
          activeDot={{ r: raio * 1.5, fill: COR_ATRASOS, stroke: FUNDO, strokeWidth: 2 }}
          isAnimationActive={animar}
          animationDuration={900}
          animationEasing="ease-out"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
