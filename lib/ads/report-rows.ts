import {
  ADS_INTEGER_METRICS,
  ADS_METRIC_KEYS,
  ADS_METRIC_LABELS,
  emptyMetricValues,
  type AdsMetricKey,
  type AdsMetricValues,
} from "./metrics";
import { AdsReportError } from "./report-error";
import type { ReportCell, ReportTable } from "./report-file";

/**
 * Interpreta as linhas do relatório do Meta: reconhece colunas, lê números e
 * datas no formato que vier e devolve uma linha por anúncio por dia.
 *
 * Função pura, sem banco e sem rede. O contrato das colunas está em
 * `app/ads/README.md`; ao mudar um apelido aqui, atualize o README.
 */

type DimensionKey =
  | "day"
  | "reportStart"
  | "reportEnd"
  | "accountId"
  | "accountName"
  | "campaignId"
  | "campaignName"
  | "adsetId"
  | "adsetName"
  | "adId"
  | "adName"
  | "currency"
  | "resultType";

type FieldKey = DimensionKey | AdsMetricKey;

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  day: "Dia",
  reportStart: "Início do relatório",
  reportEnd: "Fim do relatório",
  accountId: "ID da conta",
  accountName: "Conta",
  campaignId: "ID da campanha",
  campaignName: "Campanha",
  adsetId: "ID do conjunto",
  adsetName: "Conjunto de anúncios",
  adId: "ID do anúncio",
  adName: "Anúncio",
  currency: "Moeda",
  resultType: "Tipo de resultado",
};

/**
 * Cabeçalhos aceitos, já normalizados (sem acento, minúsculos, `_` no lugar de
 * espaço e pontuação). `prefix` aceita sufixos como a moeda: "Valor gasto (BRL)"
 * vira `valor_gasto_brl`. Colunas que o Meta já entrega calculadas (CTR, CPC,
 * CPM, custo por resultado, frequência, ROAS) ficam de fora de propósito: o
 * painel recalcula a partir das métricas brutas para poder somar períodos.
 */
const FIELD_RULES: ReadonlyArray<{
  field: FieldKey;
  exact?: readonly string[];
  prefix?: readonly string[];
}> = [
  { field: "day", exact: ["dia", "day", "data", "date"] },
  { field: "reportStart", exact: ["inicio_dos_relatorios", "reporting_starts"] },
  { field: "reportEnd", exact: ["encerramento_dos_relatorios", "reporting_ends"] },
  {
    field: "accountId",
    exact: ["id_da_conta", "id_da_conta_de_anuncios", "account_id", "ad_account_id"],
  },
  {
    field: "accountName",
    exact: ["nome_da_conta", "nome_da_conta_de_anuncios", "account_name", "ad_account_name"],
  },
  { field: "campaignId", exact: ["id_da_campanha", "campaign_id"] },
  { field: "campaignName", exact: ["nome_da_campanha", "campaign_name"] },
  { field: "adsetId", exact: ["id_do_conjunto_de_anuncios", "ad_set_id", "adset_id"] },
  { field: "adsetName", exact: ["nome_do_conjunto_de_anuncios", "ad_set_name", "adset_name"] },
  { field: "adId", exact: ["id_do_anuncio", "ad_id"] },
  { field: "adName", exact: ["nome_do_anuncio", "ad_name"] },
  { field: "currency", exact: ["moeda", "currency"] },
  {
    field: "resultType",
    exact: [
      "tipo_de_resultado",
      "result_type",
      "indicador_de_resultado",
      "indicador_de_resultados",
      "result_indicator",
    ],
  },
  {
    field: "spend",
    prefix: ["valor_usado", "valor_gasto", "valor_investido", "amount_spent", "spend", "investimento"],
  },
  { field: "impressions", exact: ["impressoes", "impressions"] },
  { field: "reach", exact: ["alcance", "reach"] },
  { field: "link_clicks", exact: ["cliques_no_link", "link_clicks"] },
  { field: "all_clicks", exact: ["cliques_todos", "clicks_all"] },
  { field: "results", exact: ["resultados", "resultado", "results"] },
  {
    field: "landing_page_views",
    exact: ["visualizacoes_da_pagina_de_destino", "landing_page_views"],
  },
  {
    field: "conversations",
    exact: ["conversas_por_mensagem_iniciadas", "messaging_conversations_started"],
  },
  { field: "leads", prefix: ["leads"] },
  { field: "purchases", exact: ["compras", "purchases"] },
  {
    field: "purchase_value",
    exact: [
      "valor_de_conversao_de_compras",
      "purchases_conversion_value",
      "purchase_conversion_value",
    ],
  },
];

const METRIC_KEYS: ReadonlySet<string> = new Set<string>(ADS_METRIC_KEYS);

function isMetricField(field: FieldKey): field is AdsMetricKey {
  return METRIC_KEYS.has(field);
}

function fieldLabel(field: FieldKey): string {
  return isMetricField(field) ? ADS_METRIC_LABELS[field] : DIMENSION_LABELS[field];
}

export function normalizeHeader(header: string): string {
  return header
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function matchField(header: string): FieldKey | null {
  const key = normalizeHeader(header);
  if (!key) return null;
  for (const rule of FIELD_RULES) {
    if (rule.exact?.includes(key)) return rule.field;
    if (rule.prefix?.some((prefix) => key === prefix || key.startsWith(`${prefix}_`))) {
      return rule.field;
    }
  }
  return null;
}

// ---------------------------------------------------------------
// Números
// ---------------------------------------------------------------

type DecimalSeparator = "." | ",";

const countChar = (text: string, char: string) => text.split(char).length - 1;

/** Tira espaço, R$ e sinais, deixando só dígitos e separadores. */
function stripNumberText(raw: string): string {
  return raw.replace(/[\s\u00a0\u202f]/g, "").replace(/R\$|\$/gi, "");
}

/**
 * Descobre o separador decimal do arquivo inteiro. Um valor como "1.234" é
 * ambíguo sozinho, mas "12.34" ou "1.234,56" em outra linha resolve.
 */
function inferDecimalSeparator(samples: string[]): DecimalSeparator | null {
  let dotVotes = 0;
  let commaVotes = 0;
  for (const raw of samples) {
    const text = stripNumberText(raw).replace(/^[-+(]+|\)+$/g, "");
    if (!/^\d[\d.,]*$/.test(text)) continue;
    const dots = countChar(text, ".");
    const commas = countChar(text, ",");
    if (dots > 0 && commas > 0) {
      if (text.lastIndexOf(".") > text.lastIndexOf(",")) dotVotes += 1;
      else commaVotes += 1;
      continue;
    }
    if (dots + commas === 0) continue;
    const separator = dots > 0 ? "." : ",";
    if (dots > 1 || commas > 1) {
      // Separador repetido só pode ser de milhar: o outro é o decimal.
      if (separator === ".") commaVotes += 1;
      else dotVotes += 1;
      continue;
    }
    const position = text.indexOf(separator);
    const fractionDigits = text.length - position - 1;
    if (fractionDigits !== 3 || text.slice(0, position) === "0") {
      if (separator === ".") dotVotes += 1;
      else commaVotes += 1;
    }
  }
  if (dotVotes === 0 && commaVotes === 0) return null;
  return dotVotes >= commaVotes ? "." : ",";
}

/**
 * Lê um número escrito em qualquer convenção ("1234.5", "1.234,50", "R$ 12,30").
 * Devolve `null` para célula vazia e `undefined` para texto que não é número.
 *
 * Sem pista do arquivo: com os dois separadores, o último é o decimal; com um
 * só seguido de exatamente três dígitos, é milhar; caso contrário, é decimal.
 */
export function parseLocaleNumber(
  raw: string,
  decimal: DecimalSeparator | null = null
): number | null | undefined {
  let text = stripNumberText(raw);
  if (text === "" || text === "-" || text === "\u2013" || text === "\u2014") return null;

  let negative = false;
  if (text.startsWith("(") && text.endsWith(")")) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }
  if (!/^(?:\d[\d.,]*|[.,]\d+)$/.test(text)) return undefined;

  const dots = countChar(text, ".");
  const commas = countChar(text, ",");
  let normalized = text;

  if (dots + commas > 0) {
    let separator: DecimalSeparator | null = decimal;
    if (separator === null) {
      if (dots > 0 && commas > 0) {
        separator = text.lastIndexOf(".") > text.lastIndexOf(",") ? "." : ",";
      } else {
        const only: DecimalSeparator = dots > 0 ? "." : ",";
        const position = text.indexOf(only);
        const fractionDigits = text.length - position - 1;
        const integerPart = text.slice(0, position);
        const isThousands =
          dots + commas > 1 || (fractionDigits === 3 && integerPart !== "" && integerPart !== "0");
        separator = isThousands ? null : only;
      }
    }

    if (separator === null) {
      normalized = text.replace(/[.,]/g, "");
    } else {
      const thousands = separator === "." ? "," : ".";
      const withoutThousands = text.split(thousands).join("");
      if (countChar(withoutThousands, separator) > 1) return undefined;
      normalized = withoutThousands.replace(separator, ".");
    }
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return undefined;
  return negative ? -value : value;
}

// ---------------------------------------------------------------
// Datas
// ---------------------------------------------------------------

type SlashOrder = "dmy" | "mdy";

const pad = (value: number) => String(value).padStart(2, "0");

function buildDay(year: number, month: number, day: number): string | undefined {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Datas com barra: "03/07/2026" é dia/mês; o arquivo inteiro decide se for mês/dia. */
function inferSlashOrder(samples: string[]): SlashOrder {
  let dayFirst = 0;
  let monthFirst = 0;
  for (const sample of samples) {
    const match = /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/.exec(sample.trim());
    if (!match) continue;
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (first > 12 && second <= 12) dayFirst += 1;
    else if (second > 12 && first <= 12) monthFirst += 1;
  }
  return monthFirst > dayFirst ? "mdy" : "dmy";
}

/** Lê um dia. `null` = célula vazia; `undefined` = texto que não é data. */
export function parseDayText(raw: string, order: SlashOrder = "dmy"): string | null | undefined {
  const text = raw.trim();
  if (text === "") return null;

  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(text);
  if (match) return buildDay(Number(match[1]), Number(match[2]), Number(match[3]));

  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:[T\s].*)?$/.exec(text);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    return order === "mdy" ? buildDay(year, first, second) : buildDay(year, second, first);
  }

  match = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (match) return buildDay(Number(match[1]), Number(match[2]), Number(match[3]));

  return undefined;
}

/** Número de série de data do Excel (dias desde 30/12/1899, ou 01/01/1904). */
function excelSerialToDay(raw: string, date1904: boolean): string | undefined {
  const serial = Number(raw);
  if (!Number.isFinite(serial)) return undefined;
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.floor(serial) * 86_400_000);
  return buildDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

// ---------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------

export type AdsReportRow = {
  day: string;
  accountId: string;
  accountName: string;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  adId: string;
  adName: string;
  resultType: string;
  /** `null` quando a coluna não veio no arquivo; vazio na célula conta como zero. */
  metrics: AdsMetricValues;
};

export type ParsedAdsReport = {
  rows: AdsReportRow[];
  columns: { header: string; usedAs: string | null }[];
  /** Métricas presentes no arquivo. */
  metrics: AdsMetricKey[];
  levels: { account: boolean; campaign: boolean; adset: boolean; ad: boolean };
  firstDay: string;
  lastDay: string;
  days: number;
  accountIds: string[];
  accountNames: string[];
  /** Nome de exibição de cada conta (nome, ou o ID quando não há nome). */
  accounts: string[];
  counts: { campaigns: number; adsets: number; ads: number };
  currency: string | null;
  totals: AdsMetricValues;
  /** Linhas de dados lidas do arquivo, sem o cabeçalho. */
  rowsRead: number;
  /** Linhas de total ou resumo deixadas de fora. */
  rowsIgnored: number;
  /** Linhas repetidas (mesmo anúncio no mesmo dia) somadas numa só. */
  rowsMerged: number;
  warnings: string[];
};

const UNKNOWN_COLUMNS =
  "Não reconhecemos as colunas deste arquivo. Envie o relatório exportado do Gerenciador de Anúncios do Meta, sem mudar os títulos das colunas.";
const NOT_DAILY =
  "Este relatório não está separado por dia. No Gerenciador de Anúncios, abra Detalhamento › Por tempo › Dia e exporte de novo.";
const NO_ROWS =
  "Não encontramos linhas com dia e valores neste arquivo. Confira se o relatório foi exportado com Detalhamento › Por tempo › Dia.";

function cellText(cell: ReportCell | undefined): string {
  if (cell === undefined) return "";
  return typeof cell === "string" ? cell : cell.excelNumber;
}

function shortValue(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > 40 ? `${clean.slice(0, 37)}...` : clean;
}

const roundCents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function findHeader(rows: ReportCell[][]): {
  index: number;
  cells: string[];
  fields: (FieldKey | null)[];
} {
  const limit = Math.min(rows.length, 10);
  for (let index = 0; index < limit; index++) {
    const cells = rows[index].map((cell) => cellText(cell).trim());
    const fields = cells.map((text) => (text ? matchField(text) : null));
    const recognized = fields.filter((field): field is FieldKey => field !== null);
    if (recognized.length >= 2 && recognized.some(isMetricField)) {
      return { index, cells, fields };
    }
  }
  throw new AdsReportError(UNKNOWN_COLUMNS);
}

function distinct(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value !== "")));
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count.toLocaleString("pt-BR")} ${count === 1 ? singular : pluralForm}`;
}

export function parseAdsReport(table: ReportTable): ParsedAdsReport {
  if (table.rows.length === 0) throw new AdsReportError("O arquivo está vazio.");

  const header = findHeader(table.rows);
  const columnOf = new Map<FieldKey, number>();
  const columns = header.cells.map((text, index) => {
    const field = header.fields[index];
    if (field && !columnOf.has(field)) {
      columnOf.set(field, index);
      return { header: text, usedAs: fieldLabel(field) };
    }
    return { header: text, usedAs: null };
  });

  const dayColumn = columnOf.get("day");
  const startColumn = columnOf.get("reportStart");
  const endColumn = columnOf.get("reportEnd");
  if (dayColumn === undefined && (startColumn === undefined || endColumn === undefined)) {
    throw new AdsReportError(NOT_DAILY);
  }

  const metricColumns = ADS_METRIC_KEYS.flatMap((key) => {
    const column = columnOf.get(key);
    return column === undefined ? [] : [[key, column] as const];
  });

  // "Valor gasto (BRL)": a moeda vem no título quando não há coluna própria.
  let headerCurrency: string | null = null;
  for (const key of ["spend", "purchase_value"] as const) {
    const column = columnOf.get(key);
    const match = column === undefined ? null : /\(([A-Za-z]{3})\)\s*$/.exec(header.cells[column]);
    if (match) {
      headerCurrency = match[1].toUpperCase();
      break;
    }
  }

  const dataRows = table.rows.slice(header.index + 1);
  const dataLines = table.lineNumbers.slice(header.index + 1);
  if (dataRows.length === 0) {
    throw new AdsReportError("O arquivo só tem os títulos das colunas, sem nenhuma linha de dados.");
  }

  const metricSamples: string[] = [];
  const dateSamples: string[] = [];
  for (const cells of dataRows) {
    for (const [, column] of metricColumns) {
      const cell = cells[column];
      if (typeof cell === "string" && cell !== "") metricSamples.push(cell);
    }
    for (const column of [dayColumn, startColumn, endColumn]) {
      const cell = column === undefined ? undefined : cells[column];
      if (typeof cell === "string" && cell !== "") dateSamples.push(cell);
    }
  }
  const decimal = inferDecimalSeparator(metricSamples);
  const slashOrder = inferSlashOrder(dateSamples);

  const readDay = (cell: ReportCell | undefined): string | null | undefined => {
    if (cell === undefined) return null;
    if (typeof cell !== "string") return excelSerialToDay(cell.excelNumber, table.date1904);
    return parseDayText(cell, slashOrder);
  };

  const hasNameColumns = (
    ["accountId", "accountName", "campaignId", "campaignName", "adsetId", "adsetName", "adId", "adName"] as const
  ).some((field) => columnOf.has(field));

  const problems: string[] = [];
  let problemCount = 0;
  const addProblem = (line: number, message: string) => {
    problemCount += 1;
    if (problems.length < 3) problems.push(`Linha ${line}: ${message}.`);
  };

  const merged = new Map<string, AdsReportRow>();
  const currencies = new Set<string>();
  let rowsIgnored = 0;
  let rowsMerged = 0;
  let notDailyRows = 0;

  for (let index = 0; index < dataRows.length; index++) {
    const cells = dataRows[index];
    const line = dataLines[index] ?? index + header.index + 2;
    const text = (field: DimensionKey) => {
      const column = columnOf.get(field);
      return column === undefined ? "" : cellText(cells[column]).trim();
    };

    const accountId = text("accountId");
    const accountName = text("accountName");
    const campaignId = text("campaignId");
    const campaignName = text("campaignName");
    const adsetId = text("adsetId");
    const adsetName = text("adsetName");
    const adId = text("adId");
    const adName = text("adName");
    const hasNames = [accountId, accountName, campaignId, campaignName, adsetId, adsetName, adId, adName].some(
      (value) => value !== ""
    );

    let day: string;
    if (dayColumn !== undefined) {
      const parsed = readDay(cells[dayColumn]);
      if (parsed === null) {
        // Sem dia: linha de total ou resumo do período.
        rowsIgnored += 1;
        continue;
      }
      if (parsed === undefined) {
        if (!hasNames) {
          rowsIgnored += 1;
          continue;
        }
        addProblem(line, `o dia “${shortValue(cellText(cells[dayColumn]))}” não é uma data válida`);
        continue;
      }
      day = parsed;
    } else {
      const start = readDay(startColumn === undefined ? undefined : cells[startColumn]);
      const end = readDay(endColumn === undefined ? undefined : cells[endColumn]);
      if (start === null || end === null) {
        rowsIgnored += 1;
        continue;
      }
      if (start === undefined || end === undefined) {
        if (!hasNames) {
          rowsIgnored += 1;
          continue;
        }
        addProblem(line, "o início ou o fim do relatório não é uma data válida");
        continue;
      }
      if (start !== end) {
        notDailyRows += 1;
        continue;
      }
      day = start;
    }

    if (hasNameColumns && !hasNames) {
      // Linha de total do dia num relatório que identifica conta, campanha ou anúncio.
      rowsIgnored += 1;
      continue;
    }

    const metrics = emptyMetricValues();
    let rowProblem: string | null = null;
    for (const [key, column] of metricColumns) {
      const cell = cells[column];
      let value: number | null | undefined;
      if (typeof cell === "object" && cell !== null) {
        const number = Number(cell.excelNumber);
        value = Number.isFinite(number) ? number : undefined;
      } else {
        value = parseLocaleNumber(cell ?? "", decimal);
      }
      const title = header.cells[column];
      if (value === undefined) {
        rowProblem = `o valor “${shortValue(cellText(cell))}” em “${title}” não é um número`;
        break;
      }
      let number = value ?? 0;
      if (number < 0) {
        rowProblem = `o valor de “${title}” está negativo`;
        break;
      }
      if (ADS_INTEGER_METRICS.has(key)) {
        const rounded = Math.round(number);
        if (Math.abs(number - rounded) > 1e-6) {
          rowProblem = `“${title}” deveria ser um número inteiro e veio “${shortValue(cellText(cell))}”`;
          break;
        }
        number = rounded;
      } else {
        number = roundCents(number);
      }
      metrics[key] = number;
    }
    if (rowProblem) {
      addProblem(line, rowProblem);
      continue;
    }

    const rowCurrency = (text("currency") || headerCurrency || "").toUpperCase();
    if (rowCurrency) currencies.add(rowCurrency);

    const row: AdsReportRow = {
      day,
      accountId,
      accountName,
      campaignId,
      campaignName,
      adsetId,
      adsetName,
      adId,
      adName,
      resultType: text("resultType"),
      metrics,
    };
    const key = [day, accountId, accountName, campaignId, campaignName, adsetId, adsetName, adId, adName].join(
      "\u001f"
    );
    const existing = merged.get(key);
    if (existing) {
      rowsMerged += 1;
      for (const [metric] of metricColumns) {
        existing.metrics[metric] = roundCents((existing.metrics[metric] ?? 0) + (metrics[metric] ?? 0));
      }
      if (!existing.resultType) existing.resultType = row.resultType;
    } else {
      merged.set(key, row);
    }
  }

  if (problemCount > 0) {
    const intro =
      problemCount === 1
        ? "Não conseguimos ler uma linha do arquivo."
        : `Não conseguimos ler ${problemCount.toLocaleString("pt-BR")} linhas do arquivo.`;
    const more = problemCount > problems.length ? " Há outras linhas com o mesmo problema." : "";
    throw new AdsReportError(
      `${intro} ${problems.join(" ")}${more} Exporte o relatório de novo, sem editar.`
    );
  }
  if (notDailyRows > 0) throw new AdsReportError(NOT_DAILY);
  if (merged.size === 0) throw new AdsReportError(NO_ROWS);
  if (currencies.size > 1) {
    throw new AdsReportError(
      `O relatório mistura moedas (${Array.from(currencies).join(", ")}). Exporte uma moeda por vez.`
    );
  }

  const rows = Array.from(merged.values()).sort((left, right) =>
    left.day < right.day ? -1 : left.day > right.day ? 1 : 0
  );

  const totals = emptyMetricValues();
  for (const [metric] of metricColumns) {
    let sum = 0;
    for (const row of rows) sum += row.metrics[metric] ?? 0;
    totals[metric] = roundCents(sum);
  }

  const uniqueDays = distinct(rows.map((row) => row.day));
  const accountKeys = new Map<string, string>();
  for (const row of rows) {
    const key = `${row.accountId}\u001f${row.accountName}`;
    const label = row.accountName || row.accountId;
    if (label && !accountKeys.has(key)) accountKeys.set(key, label);
  }
  const entityCount = (pick: (row: AdsReportRow) => string) => distinct(rows.map(pick)).length;

  const warnings: string[] = [];
  if (rowsIgnored > 0) {
    warnings.push(
      `${plural(rowsIgnored, "linha de total ou resumo ficou", "linhas de total ou resumo ficaram")} de fora.`
    );
  }
  if (rowsMerged > 0) {
    warnings.push(
      "Algumas linhas repetiam o mesmo anúncio no mesmo dia, provavelmente por outro detalhamento (idade, posicionamento etc.). Os valores foram somados, e o alcance pode ficar acima do real."
    );
  }

  return {
    rows,
    columns,
    metrics: metricColumns.map(([metric]) => metric),
    levels: {
      account: columnOf.has("accountId") || columnOf.has("accountName"),
      campaign: columnOf.has("campaignId") || columnOf.has("campaignName"),
      adset: columnOf.has("adsetId") || columnOf.has("adsetName"),
      ad: columnOf.has("adId") || columnOf.has("adName"),
    },
    firstDay: rows[0].day,
    lastDay: rows[rows.length - 1].day,
    days: uniqueDays.length,
    accountIds: distinct(rows.map((row) => row.accountId)),
    accountNames: distinct(rows.map((row) => row.accountName)),
    accounts: Array.from(new Set(accountKeys.values())),
    counts: {
      campaigns: entityCount((row) => row.campaignId || row.campaignName),
      adsets: entityCount((row) => row.adsetId || row.adsetName),
      ads: entityCount((row) => row.adId || row.adName),
    },
    currency: currencies.size === 1 ? Array.from(currencies)[0] : null,
    totals,
    rowsRead: dataRows.length,
    rowsIgnored,
    rowsMerged,
    warnings,
  };
}
