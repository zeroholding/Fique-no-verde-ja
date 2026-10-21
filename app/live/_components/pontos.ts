import type { HoraDoPainel } from "@/lib/live/tipos";

/** Janela do expediente; o eixo estica se houver atendimento fora dela. */
const PRIMEIRA_HORA = 8;
const ULTIMA_HORA = 18;

export type PontoDoGrafico = {
  hora: number;
  atrasos: number | null;
  reclamacoes: number | null;
  atendimentos: number | null;
  /** Hora em andamento. */
  atual: boolean;
  /** Hora que ainda não chegou (sem valor, a linha para antes). */
  futura: boolean;
};

/**
 * Uma posição por hora, de 08h a 18h (ou mais, se houver atendimento antes ou
 * depois). Hora que já passou sem atendimento vale zero; hora que ainda não
 * chegou fica vazia, e a linha para na hora atual.
 */
export function montarPontos(porHora: HoraDoPainel[], horaAtual: number | null): PontoDoGrafico[] {
  const horas = porHora.map((linha) => linha.hora);
  const inicio = Math.min(PRIMEIRA_HORA, ...horas);
  const fim = Math.max(ULTIMA_HORA, ...horas);
  const pontos: PontoDoGrafico[] = [];

  for (let hora = inicio; hora <= fim; hora += 1) {
    const futura = horaAtual !== null && hora > horaAtual;
    const linha = porHora.find((item) => item.hora === hora);
    pontos.push({
      hora,
      atrasos: futura ? null : (linha?.atrasos ?? 0),
      reclamacoes: futura ? null : (linha?.reclamacoes ?? 0),
      atendimentos: futura ? null : (linha?.atendimentos ?? 0),
      atual: hora === horaAtual,
      futura,
    });
  }

  return pontos;
}

/** Passo "redondo" (1, 2, 5, 10, 20, 50...) para quatro faixas no eixo. */
function passoRedondo(bruto: number): number {
  const ordem = 10 ** Math.floor(Math.log10(Math.max(bruto, 1)));
  for (const multiplo of [1, 2, 5, 10]) {
    if (multiplo * ordem >= bruto) return multiplo * ordem;
  }
  return 10 * ordem;
}

/** Eixo vertical de 0 a um teto redondo, com folga acima do maior valor. */
export function escalaVertical(pontos: PontoDoGrafico[]): { teto: number; marcas: number[] } {
  const maior = Math.max(
    0,
    ...pontos.map((ponto) => Math.max(ponto.atrasos ?? 0, ponto.reclamacoes ?? 0)),
  );
  const passo = passoRedondo(Math.max(maior * 1.1, 4) / 4);
  return { teto: passo * 4, marcas: [0, passo, passo * 2, passo * 3, passo * 4] };
}
