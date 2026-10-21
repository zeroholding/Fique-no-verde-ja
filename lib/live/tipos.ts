// lib/live/tipos.ts
//
// Contrato do painel ao vivo (/live). Os mesmos tipos valem no servidor
// (consulta e fluxo de eventos) e na tela, então este arquivo não importa nada.

/** Uma hora do dia em Brasília (0 a 23) que teve atendimento. */
export type HoraDoPainel = {
  hora: number;
  atendimentos: number;
  atrasos: number;
  reclamacoes: number;
};

/**
 * Números de HOJE, no horário de Brasília. Dinheiro sempre em centavos, para
 * a soma não ganhar casa decimal fantasma no caminho até a tela.
 */
export type DadosDoPainel = {
  /** Dia a que os números se referem, AAAA-MM-DD em Brasília. */
  dia: string;
  /** Hora atual em Brasília (0 a 23) no momento da leitura. */
  horaAtual: number;
  /** Quando o servidor leu (epoch ms do relógio do servidor). Acerta o relógio da tela. */
  geradoEm: number;
  receitaLiquidaCentavos: number;
  receitaBrutaCentavos: number;
  descontosCentavos: number;
  estornosCentavos: number;
  atendimentos: number;
  atrasos: number;
  reclamacoes: number;
  /** Só as horas que tiveram atendimento, em ordem crescente. */
  porHora: HoraDoPainel[];
  /** Horário do atendimento mais recente de hoje (ISO), ou null se não houve. */
  ultimoAtendimentoEm: string | null;
};

/** Eventos do fluxo /api/live/stream. */
export type EventoDoPainel = "painel" | "ping" | "estado" | "sessao";

/** Por que o servidor encerrou o fluxo de uma tela. */
export type MotivoDeEncerramento = "expirada" | "sem_permissao";
