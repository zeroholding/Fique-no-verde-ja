import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

import { AdsReportError } from "./report-error";

/**
 * Abre o relatório enviado ao /ads (CSV ou Excel .xlsx) e devolve as linhas.
 *
 * Roda só no servidor e não interpreta colunas: isso fica em `report-rows.ts`.
 * Aqui o trabalho é abrir o arquivo com segurança, dentro dos limites.
 *
 * O .xlsx é lido com `node:zlib`, sem biblioteca. O pacote `xlsx@0.18.5` tem
 * vulnerabilidades conhecidas sem correção no npm, e as alternativas trazem
 * dependências pesadas. O leitor cobre o que o Gerenciador de Anúncios gera:
 * primeira aba visível, textos compartilhados ou inline e números. Planilha com
 * senha, Zip64 e compressão fora do padrão são recusados com mensagem clara.
 *
 * Todo laço é linear no tamanho do arquivo: os padrões de tag param no próximo
 * `<`, então XML malformado não provoca retrocesso quadrático.
 */

export const REPORT_FILE_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxDataRows: 50_000,
  maxColumns: 200,
  maxCellChars: 10_000,
  /** Teto descompactado de cada parte interna do .xlsx (defesa contra zip bomb). */
  maxXlsxPartBytes: 48 * 1024 * 1024,
  /** Teto descompactado somando todas as partes lidas. */
  maxXlsxTotalBytes: 80 * 1024 * 1024,
} as const;

export type ReportFileFormat = "csv" | "xlsx";

/** Célula numérica do Excel: texto canônico do arquivo (ponto decimal, sem milhar). */
export type ExcelNumberCell = { readonly excelNumber: string };
export type ReportCell = string | ExcelNumberCell;

export type ReportTable = {
  format: ReportFileFormat;
  /** Linhas não vazias, na ordem do arquivo. */
  rows: ReportCell[][];
  /** Número da linha no arquivo original (1 = primeira), para apontar problemas. */
  lineNumbers: number[];
  /** Planilhas antigas de Mac contam datas a partir de 1904. */
  date1904: boolean;
};

const TOO_BIG = "O arquivo passa de 5 MB. Exporte um período menor ou envie em partes.";
const TOO_MANY_ROWS = `O arquivo tem mais de ${REPORT_FILE_LIMITS.maxDataRows.toLocaleString("pt-BR")} linhas. Exporte um período menor.`;
const TOO_MANY_COLUMNS = `O arquivo tem mais de ${REPORT_FILE_LIMITS.maxColumns} colunas. Exporte só as colunas do relatório de anúncios.`;
const NOT_CSV =
  "Este arquivo não parece ser um CSV. Exporte de novo do Gerenciador de Anúncios escolhendo CSV ou Excel (.xlsx).";
const OLD_EXCEL =
  "Esta planilha está no formato antigo do Excel (.xls) ou tem senha. Exporte de novo escolhendo CSV ou Excel (.xlsx), sem senha.";
const NOT_SPREADSHEET =
  "Este arquivo compactado não é uma planilha do Excel. Se o Meta entregou um .zip, descompacte e envie o .csv ou .xlsx que está dentro.";
const BROKEN_SPREADSHEET =
  "Não foi possível abrir esta planilha. Exporte de novo do Gerenciador de Anúncios e envie sem editar, ou use CSV.";
const PROTECTED_SPREADSHEET =
  "A planilha está protegida por senha. Exporte de novo sem senha, em CSV ou Excel (.xlsx).";
const SPREADSHEET_TOO_BIG =
  "A planilha é grande demais para o painel. Exporte um período menor ou use CSV.";

const cellTooLong = (line: number) =>
  new AdsReportError(
    `A linha ${line} tem um texto com mais de ${REPORT_FILE_LIMITS.maxCellChars.toLocaleString("pt-BR")} caracteres. Confira se o arquivo é o relatório exportado do Meta.`
  );

export function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function hasSignature(data: Uint8Array, signature: number[]): boolean {
  if (data.length < signature.length) return false;
  return signature.every((byte, index) => data[index] === byte);
}

/**
 * Lê o arquivo enviado. O formato é decidido pelo conteúdo, não pela extensão:
 * um .csv renomeado continua sendo lido como CSV.
 */
export function readReportFile(data: Uint8Array, fileName: string): ReportTable {
  if (data.length === 0) {
    throw new AdsReportError("O arquivo está vazio.");
  }
  if (data.length > REPORT_FILE_LIMITS.maxBytes) {
    throw new AdsReportError(TOO_BIG);
  }
  if (hasSignature(data, OLE_SIGNATURE)) {
    throw new AdsReportError(OLD_EXCEL);
  }
  if (hasSignature(data, ZIP_SIGNATURE)) {
    return readXlsx(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  }
  if (fileName.toLowerCase().endsWith(".xlsx")) {
    throw new AdsReportError(BROKEN_SPREADSHEET);
  }
  return readCsv(data);
}

// ---------------------------------------------------------------
// CSV
// ---------------------------------------------------------------

function readCsv(data: Uint8Array): ReportTable {
  const text = decodeText(data);
  if (text.indexOf("\u0000") >= 0) {
    throw new AdsReportError(NOT_CSV);
  }
  const { rows, lineNumbers } = parseCsv(text);
  return { format: "csv", rows, lineNumbers, date1904: false };
}

/**
 * O Meta exporta UTF-8 com BOM. Um CSV salvo de novo pelo Excel em português
 * costuma virar Windows-1252, então esse é o plano B quando o UTF-8 não fecha.
 */
function decodeText(data: Uint8Array): string {
  if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(data.subarray(3));
  }
  if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(data.subarray(2));
  }
  if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) {
    return decodeUtf16be(data.subarray(2));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return decodeWindows1252(data);
  }
}

function decodeUtf16be(data: Uint8Array): string {
  const swapped = new Uint8Array(data.length - (data.length % 2));
  for (let index = 0; index + 1 < data.length; index += 2) {
    swapped[index] = data[index + 1];
    swapped[index + 1] = data[index];
  }
  return new TextDecoder("utf-16le").decode(swapped);
}

/** Bytes 0x80 a 0x9F do Windows-1252. Os demais coincidem com o Latin-1. */
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x8d, 0x017d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013,
  0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
];

function decodeWindows1252(data: Uint8Array): string {
  const parts: string[] = [];
  const chunkSize = 8192;
  for (let start = 0; start < data.length; start += chunkSize) {
    const end = Math.min(start + chunkSize, data.length);
    const codes = new Array<number>(end - start);
    for (let index = start; index < end; index++) {
      const byte = data[index];
      codes[index - start] = byte >= 0x80 && byte <= 0x9f ? CP1252_HIGH[byte - 0x80] : byte;
    }
    parts.push(String.fromCharCode(...codes));
  }
  return parts.join("");
}

/** Escolhe o separador pela linha de cabeçalho: vírgula, ponto e vírgula ou tabulação. */
function detectDelimiter(text: string, start: number): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  const stop = Math.min(text.length, start + 64 * 1024);
  for (let index = start; index < stop; index++) {
    const char = text[index];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (char === "\n" || char === "\r") break;
    if (char === "," || char === ";" || char === "\t") counts[char] += 1;
  }
  let best = ",";
  for (const candidate of [";", "\t"]) {
    if (counts[candidate] > counts[best]) best = candidate;
  }
  return best;
}

/**
 * CSV no padrão RFC 4180: campos entre aspas, aspas duplicadas e quebra de
 * linha dentro de campo. Linhas totalmente vazias são descartadas.
 */
function parseCsv(text: string): { rows: string[][]; lineNumbers: number[] } {
  const { maxCellChars, maxColumns, maxDataRows } = REPORT_FILE_LIMITS;
  let position = 0;
  let line = 1;
  let delimiter: string | null = null;

  // O Excel às vezes grava "sep=;" na primeira linha para indicar o separador.
  const hint = /^sep=([,;\t|])\r?\n/i.exec(text.slice(0, 8));
  if (hint) {
    delimiter = hint[1];
    position = hint[0].length;
    line = 2;
  }
  const separator = delimiter ?? detectDelimiter(text, position);

  const rows: string[][] = [];
  const lineNumbers: number[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let rowLine = line;

  const pushField = () => {
    row.push(field);
    field = "";
    if (row.length > maxColumns) throw new AdsReportError(TOO_MANY_COLUMNS);
  };
  const pushRow = () => {
    if (row.some((cell) => cell.trim() !== "")) {
      rows.push(row);
      lineNumbers.push(rowLine);
      if (rows.length > maxDataRows + 1) throw new AdsReportError(TOO_MANY_ROWS);
    }
    row = [];
  };

  for (let index = position; index < text.length; index++) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === "\n" || (char === "\r" && text[index + 1] !== "\n")) line += 1;
        field += char;
        if (field.length > maxCellChars) throw cellTooLong(rowLine);
      }
      continue;
    }

    if (char === '"' && field === "") {
      inQuotes = true;
      continue;
    }
    if (char === separator) {
      pushField();
      continue;
    }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      pushField();
      pushRow();
      line += 1;
      rowLine = line;
      continue;
    }
    field += char;
    if (field.length > maxCellChars) throw cellTooLong(rowLine);
  }

  if (inQuotes) {
    throw new AdsReportError(
      "O arquivo termina no meio de um texto entre aspas. Ele pode ter sido cortado; exporte de novo."
    );
  }
  if (field !== "" || row.length > 0) {
    pushField();
    pushRow();
  }

  return { rows, lineNumbers };
}

// ---------------------------------------------------------------
// Excel (.xlsx)
// ---------------------------------------------------------------

type ZipEntry = {
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_MARKER = 0xffffffff;

/** Índice do zip: nome da parte (minúsculo) → posição e tamanhos. */
function readZipDirectory(zip: Buffer): Map<string, ZipEntry> {
  if (zip.length < 22) throw new AdsReportError(BROKEN_SPREADSHEET);

  let eocd = -1;
  const lowest = Math.max(0, zip.length - 22 - 0xffff);
  for (let index = zip.length - 22; index >= lowest; index--) {
    if (zip.readUInt32LE(index) === EOCD_SIGNATURE) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new AdsReportError(BROKEN_SPREADSHEET);

  const entryCount = zip.readUInt16LE(eocd + 10);
  const directorySize = zip.readUInt32LE(eocd + 12);
  const directoryOffset = zip.readUInt32LE(eocd + 16);
  if (entryCount === 0xffff || directorySize === ZIP64_MARKER || directoryOffset === ZIP64_MARKER) {
    throw new AdsReportError(BROKEN_SPREADSHEET);
  }
  if (directoryOffset + directorySize > eocd) throw new AdsReportError(BROKEN_SPREADSHEET);

  const entries = new Map<string, ZipEntry>();
  let cursor = directoryOffset;
  for (let count = 0; count < entryCount; count++) {
    if (cursor + 46 > eocd || zip.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw new AdsReportError(BROKEN_SPREADSHEET);
    }
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const nameEnd = cursor + 46 + nameLength;
    if (nameEnd > eocd) throw new AdsReportError(BROKEN_SPREADSHEET);

    const name = zip
      .toString("utf8", cursor + 46, nameEnd)
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .toLowerCase();
    entries.set(name, {
      flags: zip.readUInt16LE(cursor + 8),
      method: zip.readUInt16LE(cursor + 10),
      compressedSize: zip.readUInt32LE(cursor + 20),
      uncompressedSize: zip.readUInt32LE(cursor + 24),
      localHeaderOffset: zip.readUInt32LE(cursor + 42),
    });
    cursor = nameEnd + extraLength + commentLength;
  }
  return entries;
}

function readZipEntry(zip: Buffer, entry: ZipEntry, budget: { left: number }): Buffer {
  if (entry.flags & 0x1) throw new AdsReportError(PROTECTED_SPREADSHEET);
  if (
    entry.compressedSize === ZIP64_MARKER ||
    entry.uncompressedSize === ZIP64_MARKER ||
    entry.localHeaderOffset === ZIP64_MARKER
  ) {
    throw new AdsReportError(BROKEN_SPREADSHEET);
  }

  const header = entry.localHeaderOffset;
  if (header + 30 > zip.length || zip.readUInt32LE(header) !== LOCAL_SIGNATURE) {
    throw new AdsReportError(BROKEN_SPREADSHEET);
  }
  const start = header + 30 + zip.readUInt16LE(header + 26) + zip.readUInt16LE(header + 28);
  const end = start + entry.compressedSize;
  if (end > zip.length) throw new AdsReportError(BROKEN_SPREADSHEET);
  const raw = zip.subarray(start, end);

  const cap = Math.min(REPORT_FILE_LIMITS.maxXlsxPartBytes, budget.left);
  if (cap <= 0) throw new AdsReportError(SPREADSHEET_TOO_BIG);

  let content: Buffer;
  if (entry.method === 0) {
    if (raw.length > cap) throw new AdsReportError(SPREADSHEET_TOO_BIG);
    content = raw;
  } else if (entry.method === 8) {
    try {
      content = inflateRawSync(raw, { maxOutputLength: cap });
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (error instanceof RangeError || code === "ERR_BUFFER_TOO_LARGE") {
        throw new AdsReportError(SPREADSHEET_TOO_BIG);
      }
      throw new AdsReportError(BROKEN_SPREADSHEET);
    }
  } else {
    throw new AdsReportError(BROKEN_SPREADSHEET);
  }

  budget.left -= content.length;
  return content;
}

function readXlsx(zip: Buffer): ReportTable {
  const entries = readZipDirectory(zip);
  const budget = { left: REPORT_FILE_LIMITS.maxXlsxTotalBytes as number };
  const readPart = (path: string): string | null => {
    const entry = entries.get(path.toLowerCase());
    return entry ? readZipEntry(zip, entry, budget).toString("utf8") : null;
  };

  const workbookXml = readPart("xl/workbook.xml");
  if (workbookXml === null) throw new AdsReportError(NOT_SPREADSHEET);

  const relations = parseRelationships(readPart("xl/_rels/workbook.xml.rels") ?? "");
  const sheetPath = resolveFirstSheetPath(workbookXml, relations, entries);

  let sharedPath = "xl/sharedStrings.xml";
  relations.forEach((relation) => {
    if (/\/sharedStrings$/i.test(relation.type)) {
      sharedPath = resolvePartPath("xl/", relation.target);
    }
  });
  const sharedXml = readPart(sharedPath);
  const sharedStrings = sharedXml ? parseSharedStrings(sharedXml) : [];

  const sheetXml = readPart(sheetPath);
  if (sheetXml === null) throw new AdsReportError(BROKEN_SPREADSHEET);

  const { rows, lineNumbers } = parseSheet(sheetXml, sharedStrings);
  const date1904 =
    /<(?:[\w.-]+:)?workbookPr(?=[\s/>])[^<>]{0,8192}?\bdate1904\s*=\s*["'](?:1|true)["']/i.test(
      workbookXml
    );

  return { format: "xlsx", rows, lineNumbers, date1904 };
}

type Relationship = { target: string; type: string };

function parseAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    attributes.set(match[1], decodeXmlText(match[2] ?? match[3] ?? ""));
  }
  return attributes;
}

function parseRelationships(xml: string): Map<string, Relationship> {
  const relations = new Map<string, Relationship>();
  const pattern = /<(?:[\w.-]+:)?Relationship(?=[\s/>])([^<>]{0,8192}?)\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) {
    const attributes = parseAttributes(match[1]);
    const id = attributes.get("Id");
    const target = attributes.get("Target");
    if (id && target && attributes.get("TargetMode") !== "External") {
      relations.set(id, { target, type: attributes.get("Type") ?? "" });
    }
  }
  return relations;
}

/** Caminho de uma parte relativa a `baseDir` ("xl/"), tratando "./", "../" e "/". */
function resolvePartPath(baseDir: string, target: string): string {
  const joined = target.startsWith("/") ? target.slice(1) : baseDir + target;
  const segments: string[] = [];
  for (const segment of joined.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments.join("/");
}

/** Primeira aba visível, na ordem das abas. Sem índice legível, usa a sheet de menor número. */
function resolveFirstSheetPath(
  workbookXml: string,
  relations: Map<string, Relationship>,
  entries: Map<string, ZipEntry>
): string {
  const sheets: Map<string, string>[] = [];
  const pattern = /<(?:[\w.-]+:)?sheet(?=[\s/>])([^<>]{0,8192}?)\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(workbookXml))) {
    sheets.push(parseAttributes(match[1]));
  }

  const chosen = sheets.find((sheet) => !/hidden/i.test(sheet.get("state") ?? "")) ?? sheets[0];
  if (chosen) {
    let relationId: string | undefined;
    chosen.forEach((value, key) => {
      if (/^[\w.-]+:id$/.test(key)) relationId = value;
    });
    const relation = relationId ? relations.get(relationId) : undefined;
    if (relation) {
      const path = resolvePartPath("xl/", relation.target);
      if (entries.has(path.toLowerCase())) return path;
    }
  }

  const sheetNumber = (path: string) => Number(/sheet(\d+)\.xml$/.exec(path)?.[1] ?? "0");
  const fallback = Array.from(entries.keys())
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path))
    .sort((left, right) => sheetNumber(left) - sheetNumber(right))[0];
  if (fallback) return fallback;

  throw new AdsReportError(BROKEN_SPREADSHEET);
}

const XML_ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

/** Entidades XML e o escape `_xHHHH_` que o Excel usa para caracteres de controle. */
function decodeXmlText(raw: string): string {
  let text = raw;
  if (text.indexOf("&") >= 0) {
    text = text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|apos);/g, (whole, entity: string) => {
      if (entity[0] !== "#") return XML_ENTITIES[entity] ?? whole;
      const code =
        entity[1] === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
      try {
        return String.fromCodePoint(code);
      } catch {
        return "";
      }
    });
  }
  if (text.indexOf("_x") >= 0) {
    text = text.replace(/_x([0-9A-Fa-f]{4})_/g, (_whole, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    );
  }
  return text;
}

/** Textos compartilhados. Ignora a leitura fonética (`<rPh>`), que não faz parte do texto. */
function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const pattern = /<(\/?)(?:[\w.-]+:)?(si|t|rPh)(?=[\s/>])[^<>]{0,4096}?(\/?)>/g;
  let inItem = false;
  let inPhonetic = false;
  let textStart = -1;
  let text = "";
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(xml))) {
    const closing = match[1] === "/";
    const selfClosing = match[3] === "/";
    const name = match[2];

    if (name === "si") {
      if (closing) {
        strings.push(text);
        inItem = false;
      } else if (selfClosing) {
        strings.push("");
      } else {
        inItem = true;
        text = "";
      }
    } else if (name === "rPh") {
      inPhonetic = !closing && !selfClosing;
    } else if (inItem && !inPhonetic) {
      if (closing) {
        if (textStart >= 0) text += decodeXmlText(xml.slice(textStart, match.index));
        textStart = -1;
      } else if (!selfClosing) {
        textStart = pattern.lastIndex;
      }
    }
  }
  return strings;
}

const ATTR_REF = /(?:^|\s)r\s*=\s*(?:"([^"]*)"|'([^']*)')/;
const ATTR_TYPE = /(?:^|\s)t\s*=\s*(?:"([^"]*)"|'([^']*)')/;

function readAttribute(pattern: RegExp, source: string): string | undefined {
  const match = pattern.exec(source);
  return match ? match[1] ?? match[2] : undefined;
}

function columnIndexFromRef(ref: string): number | null {
  const match = /^\$?([A-Za-z]{1,3})\$?\d*$/.exec(ref.trim());
  if (!match) return null;
  let index = 0;
  for (const char of match[1].toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

function cellValue(
  type: string | undefined,
  value: string | null,
  inlineText: string,
  sharedStrings: string[]
): ReportCell | null {
  if (type === "inlineStr") return inlineText === "" ? null : inlineText;
  if (value === null) return null;
  switch (type) {
    case "s": {
      const index = Number(value.trim());
      const text = Number.isInteger(index) ? sharedStrings[index] : undefined;
      return text === undefined || text === "" ? null : text;
    }
    case "str":
    case "d":
      return value === "" ? null : value;
    case "b":
      return value.trim() === "1" ? "1" : "0";
    case "e":
      return null;
    default: {
      const trimmed = value.trim();
      return trimmed === "" ? null : { excelNumber: trimmed };
    }
  }
}

/** Linhas da aba, com as células na coluna certa mesmo quando o Excel pula células vazias. */
function parseSheet(
  xml: string,
  sharedStrings: string[]
): { rows: ReportCell[][]; lineNumbers: number[] } {
  const { maxCellChars, maxColumns, maxDataRows } = REPORT_FILE_LIMITS;
  const rows: ReportCell[][] = [];
  const lineNumbers: number[] = [];
  const pattern = /<(\/?)(?:[\w.-]+:)?(row|c|v|is|t|rPh)(?=[\s/>])([^<>]{0,4096}?)(\/?)>/g;

  let row: ReportCell[] | null = null;
  let rowNumber = 0;
  let rowHasValue = false;
  let nextColumn = 0;

  let cell: { column: number; type: string | undefined } | null = null;
  let value: string | null = null;
  let valueStart = -1;
  let inInline = false;
  let inPhonetic = false;
  let inlineText = "";
  let textStart = -1;

  const finishCell = () => {
    if (cell && row) {
      const content = cellValue(cell.type, value, inlineText, sharedStrings);
      if (content !== null) {
        if (cell.column >= maxColumns) throw new AdsReportError(TOO_MANY_COLUMNS);
        if (typeof content === "string" && content.length > maxCellChars) {
          throw cellTooLong(rowNumber);
        }
        while (row.length < cell.column) row.push("");
        row[cell.column] = content;
        rowHasValue = true;
      }
    }
    cell = null;
    value = null;
    valueStart = -1;
    inInline = false;
    inlineText = "";
    textStart = -1;
  };

  const finishRow = () => {
    if (cell) finishCell();
    if (row && rowHasValue) {
      rows.push(row);
      lineNumbers.push(rowNumber);
      if (rows.length > maxDataRows + 1) throw new AdsReportError(TOO_MANY_ROWS);
    }
    row = null;
    rowHasValue = false;
  };

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) {
    const closing = match[1] === "/";
    const name = match[2];
    const attributes = match[3];
    const selfClosing = match[4] === "/";

    switch (name) {
      case "row": {
        if (closing) {
          finishRow();
          break;
        }
        if (row) finishRow();
        const declared = Number(readAttribute(ATTR_REF, attributes));
        rowNumber = Number.isInteger(declared) && declared > 0 ? declared : rowNumber + 1;
        row = [];
        nextColumn = 0;
        if (selfClosing) finishRow();
        break;
      }
      case "c": {
        if (closing) {
          finishCell();
          break;
        }
        if (cell) finishCell();
        const ref = readAttribute(ATTR_REF, attributes);
        const column = (ref ? columnIndexFromRef(ref) : null) ?? nextColumn;
        cell = { column, type: readAttribute(ATTR_TYPE, attributes) };
        nextColumn = column + 1;
        if (selfClosing) finishCell();
        break;
      }
      case "v": {
        if (!cell) break;
        if (closing) {
          if (valueStart >= 0) value = decodeXmlText(xml.slice(valueStart, match.index));
          valueStart = -1;
        } else if (selfClosing) {
          value = "";
        } else {
          valueStart = pattern.lastIndex;
        }
        break;
      }
      case "is": {
        if (cell) inInline = !closing && !selfClosing;
        break;
      }
      case "rPh": {
        inPhonetic = !closing && !selfClosing;
        break;
      }
      case "t": {
        if (!cell || !inInline || inPhonetic) break;
        if (closing) {
          if (textStart >= 0) inlineText += decodeXmlText(xml.slice(textStart, match.index));
          textStart = -1;
        } else if (!selfClosing) {
          textStart = pattern.lastIndex;
        }
        break;
      }
    }
  }
  finishRow();

  return { rows, lineNumbers };
}
