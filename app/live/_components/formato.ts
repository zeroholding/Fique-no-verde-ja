// Formatação do painel ao vivo. Sempre no horário de Brasília, qualquer que
// seja o fuso da TV ou do navegador.

const FUSO = "America/Sao_Paulo";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const INTEIRO = new Intl.NumberFormat("pt-BR");
const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });
const HORARIO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const HORA_E_MINUTO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const SO_A_HORA = new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", hourCycle: "h23" });

/** R$ 8.307,50 */
export const moeda = (centavos: number) => MOEDA.format(centavos / 100);

/** 1.284 */
export const inteiro = (valor: number) => INTEIRO.format(valor);

/** 17/10/2026 */
export const dataEmBrasilia = (ms: number) => DATA.format(ms);

/** 16:42:08 */
export const horarioEmBrasilia = (ms: number) => HORARIO.format(ms);

/** 16:42 */
export const horaEMinutoEmBrasilia = (iso: string) => HORA_E_MINUTO.format(new Date(iso));

/** Hora cheia em Brasília, de 0 a 23. */
export const horaCheiaEmBrasilia = (ms: number) => Number(SO_A_HORA.format(ms)) % 24;

/** 08h */
export const rotuloDaHora = (hora: number) => `${String(hora).padStart(2, "0")}h`;
