/**
 * E-mail diário com o saldo dos pacotes Flex — HTML e texto, sem dependência.
 *
 * Mostra o que a tela "Contas de Pacotes" mostra, numa leitura de um minuto:
 * os três totais do topo da tela e uma linha por cliente parceiro, com o saldo
 * em créditos e em reais. Lista TODOS os clientes com pacote, do menor para o
 * maior saldo, mesmo que o e-mail fique longo. Negativo e zerado ganham cor E
 * texto ("Saldo negativo", "Sem saldo"), para não depender só da cor.
 *
 * Feito para cliente de e-mail, não para navegador: layout em tabela, estilo
 * inline, 600px e nada que o Gmail ou o Outlook descartem. O logotipo é o PNG
 * do site, que tem texto branco, então o cabeçalho é escuro como o site.
 */

import type { ResumoSaldos, SaldoCliente } from "./consulta";

export const FUSO = "America/Sao_Paulo";

export type EntradaEmailSaldos = {
  resumo: ResumoSaldos;
  /** Momento da leitura do saldo. */
  geradoEm: Date;
  /** URL pública do sistema, sem barra no fim. Base de todos os links. */
  urlBase: string;
  /** URL absoluta do logotipo em PNG. Sem ela, o cabeçalho usa o nome em texto. */
  urlLogo?: string | null;
  /** Quem recebe; aparece no rodapé. */
  destinatarios: string[];
};

export type EmailMontado = {
  assunto: string;
  preheader: string;
  html: string;
  texto: string;
};

const COR = {
  fundo: "#F2F4F3",
  cabecalho: "#0A0A0A",
  marca: "#00CC6A",
  botao: "#008F4A",
  texto: "#101828",
  corpo: "#344054",
  suave: "#667085",
  fraco: "#98A2B3",
  fio: "#EAECF0",
  positivo: "#067647",
  zero: "#B54708",
  negativo: "#B42318",
  alertaNegativoFundo: "#FEF3F2",
  alertaNegativoBorda: "#FECDCA",
  alertaZeroFundo: "#FFFAEB",
  alertaZeroBorda: "#FEDF89",
};

const FONTE = "Montserrat,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";

const FORMATO_INTEIRO = new Intl.NumberFormat("pt-BR");
const FORMATO_MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** `|| 0` evita o "-0" que o Intl escreve para zero negativo. */
export const inteiro = (valor: number) => FORMATO_INTEIRO.format(valor || 0);
export const moeda = (valor: number) => FORMATO_MOEDA.format(valor || 0);

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plural(total: number, singular: string, varios: string): string {
  return total === 1 ? singular : varios;
}

export function dataCurta(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" }).format(
    data,
  );
}

function dataPorExtenso(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(data);
}

function hora(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    data,
  );
}

function corDoSaldo(qtde: number): string {
  if (qtde < 0) return COR.negativo;
  if (qtde === 0) return COR.zero;
  return COR.positivo;
}

/** Linha de apoio do cliente: situação (quando pede atenção) e valor médio. */
function detalheDoCliente(cliente: SaldoCliente): string {
  const partes: string[] = [];
  if (cliente.saldoQtde < 0) partes.push("Saldo negativo");
  if (cliente.saldoQtde === 0) partes.push("Sem saldo");
  partes.push(cliente.valorMedio !== null ? `valor médio ${moeda(cliente.valorMedio)}/un` : "valor médio -");
  const texto = partes.join(" · ");
  return texto.charAt(0).toLocaleUpperCase("pt-BR") + texto.slice(1);
}

function urlDoExtrato(urlBase: string, cliente: SaldoCliente): string {
  return `${urlBase}/dashboard/packages/statement?clientId=${encodeURIComponent(cliente.clienteId)}`;
}

/** "TRANSMOTO (-12), PEX (-3)" — nomes de quem pede atenção, no aviso do topo. */
function listaDeNomes(clientes: SaldoCliente[], comSaldo: boolean): string {
  return clientes.map((cliente) => (comSaldo ? `${cliente.nome} (${inteiro(cliente.saldoQtde)})` : cliente.nome)).join(", ");
}

export function assuntoDoEmail(resumo: ResumoSaldos, geradoEm: Date): string {
  const base = `Saldo dos pacotes Flex · ${dataCurta(geradoEm)}`;
  if (resumo.negativos === 0) return base;
  return `${base} · ${resumo.negativos} com saldo negativo`;
}

function htmlDoCliente(cliente: SaldoCliente, urlBase: string): string {
  const fio = `border-top:1px solid ${COR.fio};`;
  return `
              <tr>
                <td valign="top" style="${fio}padding:14px 0;font-family:${FONTE};">
                  <a href="${escaparHtml(urlDoExtrato(urlBase, cliente))}" style="display:block;font-size:15px;line-height:22px;font-weight:700;color:${COR.texto};text-decoration:none;word-break:break-word;">${escaparHtml(cliente.nome)}</a>
                  <span style="display:block;margin-top:2px;font-size:12.5px;line-height:18px;color:${cliente.saldoQtde <= 0 ? corDoSaldo(cliente.saldoQtde) : COR.suave};">${escaparHtml(detalheDoCliente(cliente))}</span>
                </td>
                <td valign="top" align="right" style="${fio}padding:14px 0 14px 16px;font-family:${FONTE};white-space:nowrap;">
                  <span style="display:block;font-size:18px;line-height:22px;font-weight:800;color:${corDoSaldo(cliente.saldoQtde)};">${escaparHtml(inteiro(cliente.saldoQtde))}</span>
                  <span style="display:block;margin-top:2px;font-size:12.5px;line-height:18px;color:${COR.suave};">${escaparHtml(moeda(cliente.saldoFinanceiro))}</span>
                </td>
              </tr>`;
}

function htmlDoIndicador(rotulo: string, valor: string, apoio: string, cor: string): string {
  return `<td class="fn-kpi" width="33%" valign="top" style="padding:14px 16px;border:1px solid ${COR.fio};border-radius:10px;font-family:${FONTE};">
                  <span style="display:block;font-size:12px;line-height:18px;font-weight:600;color:${COR.suave};">${escaparHtml(rotulo)}</span>
                  <span style="display:block;margin-top:4px;font-size:21px;line-height:28px;font-weight:800;color:${cor};white-space:nowrap;">${escaparHtml(valor)}</span>
                  <span style="display:block;font-size:12px;line-height:18px;color:${COR.fraco};">${escaparHtml(apoio)}</span>
                </td>`;
}

function htmlDoAviso(resumo: ResumoSaldos): string {
  if (resumo.negativos === 0 && resumo.zerados === 0) return "";
  const negativos = resumo.clientes.filter((cliente) => cliente.saldoQtde < 0);
  const zerados = resumo.clientes.filter((cliente) => cliente.saldoQtde === 0);
  const temNegativo = negativos.length > 0;
  const linhas: string[] = [];
  if (temNegativo) {
    linhas.push(
      `<strong>${negativos.length} ${plural(negativos.length, "cliente com saldo negativo", "clientes com saldo negativo")}:</strong> ${escaparHtml(listaDeNomes(negativos, true))}.`,
    );
  }
  if (zerados.length > 0) {
    linhas.push(
      `<strong>${zerados.length} sem saldo:</strong> ${escaparHtml(listaDeNomes(zerados, false))}.`,
    );
  }
  const fundo = temNegativo ? COR.alertaNegativoFundo : COR.alertaZeroFundo;
  const borda = temNegativo ? COR.alertaNegativoBorda : COR.alertaZeroBorda;
  const cor = temNegativo ? COR.negativo : COR.zero;
  return `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
              <tr>
                <td style="background:${fundo};border:1px solid ${borda};border-radius:10px;padding:12px 16px;font-family:${FONTE};font-size:13.5px;line-height:21px;color:${cor};">${linhas.join("<br>")}</td>
              </tr>
            </table>`;
}

export function montarEmailSaldos(entrada: EntradaEmailSaldos): EmailMontado {
  const { resumo, geradoEm } = entrada;
  const urlBase = entrada.urlBase.replace(/\/+$/, "");
  const urlTela = `${urlBase}/dashboard/packages`;
  const total = resumo.clientes.length;

  const assunto = assuntoDoEmail(resumo, geradoEm);
  const preheader =
    total === 0
      ? "Nenhum cliente parceiro com pacote cadastrado."
      : `${inteiro(resumo.totalQtde)} ${plural(Math.abs(resumo.totalQtde), "crédito", "créditos")} · ${moeda(resumo.totalFinanceiro)} em ${total} ${plural(total, "cliente parceiro", "clientes parceiros")}.`;
  const quando = `${dataPorExtenso(geradoEm)} · posição às ${hora(geradoEm)}`;
  const mediaGlobal = resumo.mediaGlobal !== null ? moeda(resumo.mediaGlobal) : "-";
  const rodape = `Envio automático, todo dia às 9h (horário de Brasília)${
    entrada.destinatarios.length ? `, para ${entrada.destinatarios.join(", ")}` : ""
  }. Os números são os da tela Contas de Pacotes no momento do envio.`;

  const logo = entrada.urlLogo
    ? `<img src="${escaparHtml(entrada.urlLogo)}" width="150" height="58" alt="Fique no Verde Já" style="display:block;width:150px;height:58px;border:0;outline:none;text-decoration:none;font-family:${FONTE};font-size:18px;font-weight:800;color:#FFFFFF;">`
    : `<span style="font-family:${FONTE};font-size:20px;font-weight:800;color:#FFFFFF;">Fique no <span style="color:${COR.marca};">Verde Já</span></span>`;

  const lista =
    total === 0
      ? `<p style="margin:0;padding:16px 0;border-top:1px solid ${COR.fio};font-family:${FONTE};font-size:14px;line-height:22px;color:${COR.suave};">Nenhum cliente parceiro com pacote cadastrado.</p>`
      : `<p style="margin:0 0 14px;font-family:${FONTE};font-size:13px;line-height:20px;color:${COR.suave};">Todos os ${total} ${plural(total, "cliente parceiro", "clientes parceiros")}, do menor para o maior saldo.</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:0 0 8px;font-family:${FONTE};font-size:11.5px;line-height:16px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${COR.fraco};">Cliente parceiro</td>
                <td align="right" style="padding:0 0 8px 16px;font-family:${FONTE};font-size:11.5px;line-height:16px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${COR.fraco};white-space:nowrap;">Saldo (qtde) · R$</td>
              </tr>${resumo.clientes.map((cliente) => htmlDoCliente(cliente, urlBase)).join("")}
              <tr>
                <td style="border-top:1px solid ${COR.fio};padding:14px 0 0;font-family:${FONTE};font-size:14px;line-height:20px;font-weight:700;color:${COR.texto};">Total</td>
                <td align="right" style="border-top:1px solid ${COR.fio};padding:14px 0 0 16px;font-family:${FONTE};white-space:nowrap;">
                  <span style="display:block;font-size:18px;line-height:22px;font-weight:800;color:${corDoSaldo(resumo.totalQtde)};">${escaparHtml(inteiro(resumo.totalQtde))}</span>
                  <span style="display:block;margin-top:2px;font-size:12.5px;line-height:18px;color:${COR.suave};">${escaparHtml(moeda(resumo.totalFinanceiro))}</span>
                </td>
              </tr>
            </table>`;

  // Caracteres invisíveis depois do pré-cabeçalho: sem eles o Gmail completa a
  // prévia com o começo do corpo.
  const preenchimento = "&#8199;&#65279;&#847;".repeat(40);

  const html = `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escaparHtml(assunto)}</title>
<!--[if !mso]><!-->
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
<!--<![endif]-->
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { -ms-interpolation-mode:bicubic; }
  @media only screen and (max-width: 620px) {
    .fn-largura { width:100% !important; }
    .fn-margem { padding-left:20px !important; padding-right:20px !important; }
    .fn-kpi { display:block !important; width:auto !important; margin-bottom:10px !important; }
    .fn-kpi-espaco { display:none !important; }
    .fn-botao { width:100% !important; }
    .fn-botao a { display:block !important; text-align:center !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COR.fundo};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escaparHtml(preheader)}${preenchimento}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COR.fundo}" style="background:${COR.fundo};">
  <tr>
    <td align="center" style="padding:24px 12px 32px;">
      <table role="presentation" class="fn-largura" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <tr>
          <td class="fn-margem" align="left" bgcolor="${COR.cabecalho}" style="background:${COR.cabecalho};border-radius:14px 14px 0 0;padding:22px 32px;">${logo}</td>
        </tr>
        <tr>
          <td class="fn-margem" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:0 0 14px 14px;padding:28px 32px 32px;font-family:${FONTE};">
            <p style="margin:0 0 6px;font-size:12px;line-height:18px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${COR.botao};">Relatório diário</p>
            <h1 style="margin:0 0 4px;font-size:24px;line-height:32px;font-weight:800;color:${COR.texto};">Saldo dos pacotes Flex</h1>
            <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:${COR.suave};">${escaparHtml(quando)}</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
              <tr>
                ${htmlDoIndicador("Saldo total", inteiro(resumo.totalQtde), plural(Math.abs(resumo.totalQtde), "crédito", "créditos"), corDoSaldo(resumo.totalQtde))}
                <td class="fn-kpi-espaco" width="10" style="width:10px;font-size:0;line-height:0;">&nbsp;</td>
                ${htmlDoIndicador("Saldo financeiro", moeda(resumo.totalFinanceiro), "em créditos não usados", COR.texto)}
                <td class="fn-kpi-espaco" width="10" style="width:10px;font-size:0;line-height:0;">&nbsp;</td>
                ${htmlDoIndicador("Média global / un", mediaGlobal, `${total} ${plural(total, "cliente parceiro", "clientes parceiros")}`, COR.texto)}
              </tr>
            </table>
${htmlDoAviso(resumo)}
            ${lista}

            <table role="presentation" class="fn-botao" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
              <tr>
                <td align="center" bgcolor="${COR.botao}" style="border-radius:8px;background:${COR.botao};">
                  <a href="${escaparHtml(urlTela)}" style="display:inline-block;padding:13px 26px;font-family:${FONTE};font-size:15px;line-height:20px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:8px;">Abrir Contas de Pacotes</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="fn-margem" style="padding:20px 32px 0;font-family:${FONTE};font-size:12px;line-height:19px;color:${COR.fraco};">${escaparHtml(rodape)}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const negativos = resumo.clientes.filter((cliente) => cliente.saldoQtde < 0);
  const zerados = resumo.clientes.filter((cliente) => cliente.saldoQtde === 0);
  const texto = [
    `Saldo dos pacotes Flex — ${quando}`,
    "",
    `Saldo total: ${inteiro(resumo.totalQtde)} ${plural(Math.abs(resumo.totalQtde), "crédito", "créditos")}`,
    `Saldo financeiro: ${moeda(resumo.totalFinanceiro)}`,
    `Média global / un: ${mediaGlobal}`,
    "",
    ...(negativos.length
      ? [`Atenção — ${negativos.length} com saldo negativo: ${listaDeNomes(negativos, true)}.`]
      : []),
    ...(zerados.length ? [`Sem saldo: ${listaDeNomes(zerados, false)}.`] : []),
    ...(negativos.length || zerados.length ? [""] : []),
    total === 0
      ? "Nenhum cliente parceiro com pacote cadastrado."
      : `Todos os ${total} ${plural(total, "cliente parceiro", "clientes parceiros")}, do menor para o maior saldo:`,
    ...resumo.clientes.map(
      (cliente) =>
        `- ${cliente.nome}: ${inteiro(cliente.saldoQtde)} ${plural(Math.abs(cliente.saldoQtde), "crédito", "créditos")} · ${moeda(cliente.saldoFinanceiro)} · ${detalheDoCliente(cliente)}`,
    ),
    "",
    `Abrir Contas de Pacotes: ${urlTela}`,
    "",
    rodape,
  ].join("\n");

  return { assunto, preheader, html, texto };
}
