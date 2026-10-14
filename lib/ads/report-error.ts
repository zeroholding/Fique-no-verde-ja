/**
 * Problema no relatório enviado ao /ads, com a mensagem pronta para a tela.
 *
 * Quem lança escreve para quem exportou o relatório do Meta: sem termo técnico
 * e dizendo o que fazer. A API devolve o texto exatamente como veio.
 */
export class AdsReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdsReportError";
  }
}
