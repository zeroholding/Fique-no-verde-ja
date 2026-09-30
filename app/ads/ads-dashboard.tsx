"use client";

import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileCheck2,
  FileSpreadsheet,
  Filter,
  Info,
  Layers3,
  Megaphone,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UploadCloud,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_CSV_ROWS = 5_000;
const MAX_CSV_COLUMNS = 100;
const MAX_CELL_CHARACTERS = 10_000;
const SUPPORTED_EXTENSIONS = new Set(["csv"]);

const REPORT_COLUMNS = [
  {
    label: "Conta",
    required: false,
    aliases: ["nome_da_conta", "account_name", "conta"],
  },
  {
    label: "Data",
    required: true,
    aliases: ["dia", "data", "date", "reporting_starts", "inicio_dos_relatorios"],
  },
  {
    label: "Anúncio",
    required: true,
    aliases: ["nome_do_anuncio", "ad_name", "anuncio"],
  },
  {
    label: "ID do anúncio",
    required: false,
    aliases: ["id_do_anuncio", "ad_id"],
  },
  {
    label: "Campanha",
    required: false,
    aliases: ["nome_da_campanha", "campaign_name", "campanha"],
  },
  {
    label: "ID da campanha",
    required: false,
    aliases: ["id_da_campanha", "campaign_id"],
  },
  {
    label: "Conjunto",
    required: false,
    aliases: ["nome_do_conjunto_de_anuncios", "ad_set_name", "adset_name", "conjunto_de_anuncios"],
  },
  {
    label: "ID do conjunto",
    required: false,
    aliases: ["id_do_conjunto_de_anuncios", "ad_set_id", "adset_id"],
  },
  {
    label: "Alcance",
    required: false,
    aliases: ["alcance", "reach"],
  },
  {
    label: "Impressões",
    required: true,
    aliases: ["impressoes", "impressions"],
  },
  {
    label: "Frequência",
    required: false,
    aliases: ["frequencia", "frequency"],
  },
  {
    label: "Moeda",
    required: false,
    aliases: ["moeda", "currency"],
  },
  {
    label: "Investimento",
    required: true,
    aliases: [
      "valor_gasto_brl",
      "valor_gasto",
      "valor_usado_brl",
      "valor_usado",
      "amount_spent",
      "spend",
      "investimento",
    ],
  },
  {
    label: "Cliques no link",
    required: false,
    aliases: ["cliques_no_link", "link_clicks", "outbound_clicks"],
  },
  {
    label: "Visualizações da página",
    required: false,
    aliases: ["visualizacoes_da_pagina_de_destino", "landing_page_views"],
  },
  {
    label: "Resultados",
    required: false,
    aliases: ["resultados", "results"],
  },
  {
    label: "Custo por resultado",
    required: false,
    aliases: ["custo_por_resultado", "cost_per_result"],
  },
  {
    label: "Valor de conversão",
    required: false,
    aliases: ["valor_de_conversao", "conversion_value", "purchase_conversion_value"],
  },
  {
    label: "Atribuição",
    required: false,
    aliases: ["configuracao_de_atribuicao", "attribution_setting"],
  },
  {
    label: "Início do relatório",
    required: false,
    aliases: ["inicio_dos_relatorios", "reporting_starts"],
  },
  {
    label: "Encerramento do relatório",
    required: false,
    aliases: ["encerramento_dos_relatorios", "reporting_ends"],
  },
] as const;

type Preview = {
  fileName: string;
  size: number;
  sheetName: string;
  headers: string[];
  rowCount: number;
  rows: string[][];
  recognized: string[];
  missing: string[];
};

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function displayCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text =
    value instanceof Date && !Number.isNaN(value.getTime())
      ? value.toLocaleDateString("pt-BR")
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

function detectCsvDelimiter(text: string): "," | ";" | "\t" {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  const limit = Math.min(text.length, 20_000);

  for (let index = 0; index < limit; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) break;
    if (!quoted && (char === "," || char === ";" || char === "\t")) {
      counts[char] += 1;
    }
  }

  const delimiter = (Object.entries(counts) as Array<["," | ";" | "\t", number]>)
    .sort((a, b) => b[1] - a[1])[0];
  if (!delimiter || delimiter[1] === 0) {
    throw new Error("Não foi possível identificar as colunas do CSV.");
  }
  return delimiter[0];
}

/** Parser limitado para a prévia: não executa fórmula nem expande ZIP/XLSX. */
function parseCsvPreview(textInput: string): string[][] {
  const text = textInput.replace(/^\uFEFF/, "");
  const delimiter = detectCsvDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const pushCell = () => {
    if (cell.length > MAX_CELL_CHARACTERS) {
      throw new Error("O CSV possui uma célula maior que 10.000 caracteres.");
    }
    row.push(cell);
    cell = "";
    if (row.length > MAX_CSV_COLUMNS) {
      throw new Error(`O CSV possui mais de ${MAX_CSV_COLUMNS} colunas.`);
    }
  };
  const pushRow = () => {
    pushCell();
    if (row.some((value) => value.trim() !== "")) rows.push(row);
    row = [];
    if (rows.length > MAX_CSV_ROWS + 1) {
      throw new Error(`O CSV possui mais de ${MAX_CSV_ROWS} linhas de dados.`);
    }
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell.length === 0) quoted = true;
    else if (char === delimiter) pushCell();
    else if (char === "\n") pushRow();
    else if (char === "\r" && text[index + 1] !== "\n") pushRow();
    else if (char !== "\r") cell += char;
  }

  if (quoted) throw new Error("O CSV possui aspas abertas sem fechamento.");
  if (cell.length > 0 || row.length > 0) pushRow();
  return rows;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function AdsDashboard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    if (!importOpen) return;
    const previousOverflow = document.body.style.overflow;
    const adsRoot = document.querySelector<HTMLElement>(".ads-root");
    lastFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    adsRoot?.setAttribute("inert", "");

    const focusDialog = requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>("[data-autofocus]")
        ?.focus();
    });
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setImportOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) => !element.hasAttribute("hidden") && element.tabIndex >= 0,
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      cancelAnimationFrame(focusDialog);
      document.body.style.overflow = previousOverflow;
      adsRoot?.removeAttribute("inert");
      document.removeEventListener("keydown", handleKey);
      requestAnimationFrame(() => lastFocusedRef.current?.focus());
    };
  }, [importOpen]);

  const readGenerationRef = useRef(0);

  const readFile = async (file: File) => {
    const generation = ++readGenerationRef.current;
    setFileError(null);
    setParsing(false);

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      setFileError("Formato inválido nesta etapa. Exporte e envie o relatório em CSV.");
      return;
    }
    if (file.size <= 0) {
      setFileError("O arquivo selecionado está vazio.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError("O relatório CSV deve ter no máximo 5 MB nesta etapa.");
      return;
    }

    setParsing(true);
    try {
      // CSV não possui conteúdo compactado oculto. Os tetos de bytes, linhas,
      // colunas e célula impedem que a prévia congele o navegador.
      const rawRows = parseCsvPreview(await file.text());
      if (generation !== readGenerationRef.current) return;
      if (rawRows.length < 2) {
        throw new Error("O CSV precisa ter cabeçalho e pelo menos uma linha de dados.");
      }

      const headers = rawRows[0].map((value, index) => {
        const text = value.trim();
        if (text.length > 200) {
          throw new Error(`O cabeçalho da coluna ${index + 1} é muito longo.`);
        }
        return text || `Coluna ${index + 1}`;
      });
      const normalizedHeaderList = headers.map(normalize).filter(Boolean);
      if (new Set(normalizedHeaderList).size !== normalizedHeaderList.length) {
        throw new Error("O CSV possui cabeçalhos duplicados.");
      }
      const normalizedHeaders = new Set(normalizedHeaderList);
      const dataRows = rawRows.slice(1);

      const recognized = REPORT_COLUMNS.filter((column) =>
        column.aliases.some((alias) => normalizedHeaders.has(normalize(alias))),
      ).map((column) => column.label);
      const missing = REPORT_COLUMNS.filter(
        (column) =>
          column.required &&
          !column.aliases.some((alias) => normalizedHeaders.has(normalize(alias))),
      ).map((column) => column.label);

      setPreview({
        fileName: file.name,
        size: file.size,
        sheetName: "CSV",
        headers,
        rowCount: dataRows.length,
        rows: dataRows.slice(0, 5).map((row) =>
          headers.map((_, index) => displayCell(row[index])),
        ),
        recognized,
        missing,
      });
    } catch (error) {
      if (generation !== readGenerationRef.current) return;
      setFileError(
        error instanceof Error
          ? error.message
          : "Não foi possível ler o relatório selecionado.",
      );
    } finally {
      if (generation === readGenerationRef.current) setParsing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void readFile(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void readFile(file);
  };

  return (
    <>
      <div className="min-h-full px-4 py-5 sm:px-6 sm:py-7 xl:px-8">
        <div className="mx-auto max-w-[1540px] space-y-5">
          <section
            id="visao-geral"
            className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#075ee8] via-[#0866ff] to-[#5b3ff2] p-5 text-white shadow-[0_20px_60px_-30px_rgba(8,73,190,.75)] sm:p-7"
          >
            <div className="pointer-events-none absolute -right-20 -top-28 size-[340px] rounded-full border-[52px] border-white/10" />
            <div className="pointer-events-none absolute -bottom-28 left-1/3 size-64 rounded-full bg-[#44d7ff]/20 blur-3xl" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.09em] backdrop-blur">
                  <Sparkles className="size-3.5" aria-hidden />
                  Pré-validação de relatórios Meta Ads
                </span>
                <h2 className="mt-4 max-w-2xl text-[30px] font-bold leading-[1.08] tracking-[-0.035em] sm:text-[39px]">
                  Decisões melhores para cada real investido.
                </h2>
                <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-blue-50/90 sm:text-[15px]">
                  Confira agora a estrutura, os cabeçalhos e as primeiras linhas
                  do CSV exportado do Meta Ads. A análise entra na próxima etapa.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 text-[14px] font-bold text-[#0757d7] shadow-[0_14px_35px_-18px_rgba(0,0,0,.55)] transition hover:-translate-y-0.5 hover:bg-[#f8fbff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto"
              >
                <UploadCloud className="size-[18px]" aria-hidden />
                Pré-validar relatório
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-2xl border border-[#d9e5f7] bg-white p-4 shadow-[0_8px_28px_-22px_rgba(25,64,129,.35)] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eaf2ff] text-[#0866ff]">
                <Info className="size-[18px]" aria-hidden />
              </span>
              <div>
                <p className="text-[13.5px] font-bold text-[#1e2d46]">
                  Fundação pronta · aguardando o relatório de referência
                </p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#748198]">
                  A prévia já roda no navegador. Nenhum arquivo ou dado é enviado ao servidor nesta etapa.
                </p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-[#eefbf4] px-3 py-1.5 text-[11px] font-bold text-[#08783f] sm:self-auto">
              <ShieldCheck className="size-3.5" aria-hidden />
              Pré-validação local
            </span>
          </section>

          <section id="performance" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              label="Investimento"
              value="—"
              hint="Valor usado no período"
              icon={<CircleDollarSign />}
              tone="blue"
            />
            <MetricCard
              label="Resultados"
              value="—"
              hint="Conversões informadas pela Meta"
              icon={<Target />}
              tone="violet"
            />
            <MetricCard
              label="Custo por resultado"
              value="—"
              hint="Investimento ÷ resultados"
              icon={<TrendingUp />}
              tone="cyan"
            />
            <MetricCard
              label="ROAS"
              value="—"
              hint="Exige valor de conversão"
              icon={<BarChart3 />}
              tone="indigo"
            />
          </section>

          <section className="flex flex-col gap-3 rounded-2xl border border-[var(--ads-line)] bg-white p-4 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-[#dce4f1] bg-[#f8faff] px-3 py-2.5 text-[#8290a4]">
              <Search className="size-4 shrink-0" aria-hidden />
              <span className="text-[13px]">Buscar campanha, conjunto ou anúncio</span>
            </div>
            <button
              type="button"
              disabled
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#dce4f1] px-3 text-[12.5px] font-semibold text-[#8290a4] disabled:cursor-not-allowed"
              title="Disponível quando houver dados importados"
            >
              <CalendarDays className="size-4" aria-hidden />
              Período
            </button>
            <button
              type="button"
              disabled
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#dce4f1] px-3 text-[12.5px] font-semibold text-[#8290a4] disabled:cursor-not-allowed"
              title="Disponível quando houver dados importados"
            >
              <Filter className="size-4" aria-hidden />
              Filtros
            </button>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
            <EmptyChart
              title="Investimento e resultados"
              description="Evolução diária para enxergar tendência, escala e eficiência."
              icon={<TrendingUp />}
              variant="line"
            />
            <EmptyChart
              title="Distribuição do investimento"
              description="Participação de cada campanha no orçamento total."
              icon={<CircleDollarSign />}
              variant="donut"
            />
          </section>

          <section id="campanhas" className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
            <div className="overflow-hidden rounded-2xl border border-[var(--ads-line)] bg-white shadow-[0_8px_30px_-24px_rgba(17,56,120,.35)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--ads-line)] px-4 py-4 sm:px-5">
                <div>
                  <h3 className="text-[15px] font-bold text-[#1d2c45]">Ranking de campanhas</h3>
                  <p className="mt-0.5 text-[12px] text-[#8290a5]">Investimento, resultados, custo e retorno</p>
                </div>
                <span className="rounded-full bg-[#f1f5fb] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-[#8090a8]">
                  Sem dados
                </span>
              </div>
              <div className="flex min-h-[260px] flex-col items-center justify-center px-5 py-10 text-center">
                <span className="grid size-14 place-items-center rounded-2xl bg-[#edf4ff] text-[#0866ff]">
                  <Megaphone className="size-6" aria-hidden />
                </span>
                <h4 className="mt-4 text-[14px] font-bold text-[#26354d]">Nenhuma campanha importada</h4>
                <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-[#7b899e]">
                  Após validar o primeiro relatório, esta área mostrará o ranking sem misturar níveis ou períodos.
                </p>
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0866ff] px-4 text-[12.5px] font-bold text-white transition hover:bg-[#0759df]"
                >
                  <Plus className="size-4" aria-hidden /> Selecionar relatório
                </button>
              </div>
            </div>

            <section id="estrutura" className="rounded-2xl border border-[var(--ads-line)] bg-white p-5 shadow-[0_8px_30px_-24px_rgba(17,56,120,.35)]">
              <span className="grid size-10 place-items-center rounded-xl bg-[#f1edff] text-[#6548df]">
                <Layers3 className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-[15px] font-bold text-[#1d2c45]">Estrutura da análise</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[#7b899e]">
                Um relatório diário no nível de anúncio permite subir a análise sem duplicar números.
              </p>
              <ol className="mt-5 space-y-3">
                {[
                  ["01", "Campanha", "Objetivo e orçamento"],
                  ["02", "Conjunto", "Público e posicionamento"],
                  ["03", "Anúncio", "Criativo e resultado"],
                ].map(([index, title, detail]) => (
                  <li key={index} className="flex items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#eef4ff] text-[10px] font-extrabold text-[#0866ff]">{index}</span>
                    <span className="min-w-0">
                      <strong className="block text-[12.5px] text-[#2a3951]">{title}</strong>
                      <span className="block text-[11.5px] text-[#8a97aa]">{detail}</span>
                    </span>
                    <ChevronRight className="ml-auto size-4 text-[#c2cad6]" aria-hidden />
                  </li>
                ))}
              </ol>
            </section>
          </section>

          <section id="importacoes" className="rounded-2xl border border-dashed border-[#b8d1ff] bg-[#f5f8ff] p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-[#0866ff] shadow-sm">
                  <FileSpreadsheet className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-[14px] font-bold text-[#1e2e48]">Histórico de importações</h3>
                  <p className="mt-0.5 text-[12.5px] text-[#74839a]">
                    Ficará disponível quando a persistência no banco for ativada.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#bcd2fb] bg-white px-4 text-[12.5px] font-bold text-[#1461d2] transition hover:bg-[#edf4ff]"
              >
                Testar um arquivo <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          </section>
        </div>
      </div>

      {importOpen && typeof document !== "undefined"
        ? createPortal(
            <ImportDialog
              dialogRef={dialogRef}
              inputRef={inputRef}
              dragActive={dragActive}
              parsing={parsing}
              preview={preview}
              fileError={fileError}
              onClose={() => setImportOpen(false)}
              onFileChange={onFileChange}
              onDrop={onDrop}
              onDragActive={setDragActive}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  tone: "blue" | "violet" | "cyan" | "indigo";
}) {
  const tones = {
    blue: "bg-[#eaf2ff] text-[#0866ff]",
    violet: "bg-[#f1edff] text-[#6548df]",
    cyan: "bg-[#e9faff] text-[#0d8fb0]",
    indigo: "bg-[#edf0ff] text-[#4158d8]",
  };
  return (
    <article className="rounded-2xl border border-[var(--ads-line)] bg-white p-4 shadow-[0_8px_30px_-24px_rgba(17,56,120,.38)] sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#8794a8]">{label}</span>
        <span className={`grid size-9 place-items-center rounded-xl [&>svg]:size-[17px] ${tones[tone]}`}>{icon}</span>
      </div>
      <strong className="mt-3 block text-[25px] font-bold tracking-[-0.035em] text-[#1c2b44] sm:text-[29px]">{value}</strong>
      <span className="mt-1 block text-[11.5px] leading-snug text-[#8b97a9]">{hint}</span>
    </article>
  );
}

function EmptyChart({
  title,
  description,
  icon,
  variant,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  variant: "line" | "donut";
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--ads-line)] bg-white shadow-[0_8px_30px_-24px_rgba(17,56,120,.35)]">
      <div className="flex items-start gap-3 border-b border-[var(--ads-line)] px-4 py-4 sm:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#edf4ff] text-[#0866ff] [&>svg]:size-[17px]">{icon}</span>
        <span>
          <strong className="block text-[14px] text-[#1d2c45]">{title}</strong>
          <span className="mt-0.5 block text-[11.5px] text-[#8995a7]">{description}</span>
        </span>
      </div>
      <div className="relative flex min-h-[230px] items-center justify-center overflow-hidden bg-[linear-gradient(to_bottom,#fff,#fbfcff)] p-6">
        <div className="pointer-events-none absolute inset-6 bg-[linear-gradient(to_right,#edf1f7_1px,transparent_1px),linear-gradient(to_bottom,#edf1f7_1px,transparent_1px)] bg-[size:48px_42px] opacity-70" />
        {variant === "line" ? (
          <svg viewBox="0 0 500 150" className="absolute inset-x-8 bottom-8 h-36 max-w-[calc(100%-4rem)] text-[#b9d1ff]" aria-hidden>
            <path d="M0 125 C65 112, 82 85, 145 96 S245 42, 300 67 S410 30, 500 12" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray="8 9" />
          </svg>
        ) : (
          <div className="absolute size-36 rounded-full border-[22px] border-[#e4edff] border-r-[#bfd3fb]" aria-hidden />
        )}
        <div className="relative z-10 rounded-xl border border-[#dce8fb] bg-white/95 px-4 py-3 text-center shadow-sm backdrop-blur">
          <p className="text-[12.5px] font-bold text-[#44536a]">Aguardando relatório</p>
          <p className="mt-0.5 text-[11px] text-[#929daf]">Nenhum número fictício será exibido</p>
        </div>
      </div>
    </article>
  );
}

function ImportDialog({
  dialogRef,
  inputRef,
  dragActive,
  parsing,
  preview,
  fileError,
  onClose,
  onFileChange,
  onDrop,
  onDragActive,
}: {
  dialogRef: React.RefObject<HTMLElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  dragActive: boolean;
  parsing: boolean;
  preview: Preview | null;
  fileError: string | null;
  onClose: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragActive: (active: boolean) => void;
}) {
  return (
    <div className="ads-portal fixed inset-0 z-50 flex items-end justify-center bg-[#071a3c]/45 p-0 backdrop-blur-[3px] sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="ads-import-title" className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[24px] bg-white shadow-[0_28px_90px_-24px_rgba(2,20,57,.65)] sm:rounded-[24px]">
        <header className="flex shrink-0 items-start gap-3 border-b border-[#e5eaf2] px-4 py-4 sm:px-6 sm:py-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#eaf2ff] text-[#0866ff]">
            <UploadCloud className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="ads-import-title" className="text-[17px] font-bold tracking-[-0.02em] text-[#172740]">Pré-validar relatório Meta Ads</h2>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#78869c]">Pré-validação local: o arquivo não sai deste navegador.</p>
          </div>
          <button data-autofocus type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-full text-[#8794a8] transition hover:bg-[#f2f5f9] hover:text-[#34445d]" aria-label="Fechar">
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <input ref={inputRef} type="file" accept=".csv,text/csv" tabIndex={-1} className="sr-only" onChange={onFileChange} />

          {!preview ? (
            <div
              onDragEnter={(event) => { event.preventDefault(); onDragActive(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => { event.preventDefault(); onDragActive(false); }}
              onDrop={onDrop}
              className={`flex min-h-[260px] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 py-9 text-center transition ${dragActive ? "border-[#0866ff] bg-[#edf4ff]" : "border-[#bfd2f3] bg-[#f8faff]"}`}
            >
              <span className="grid size-16 place-items-center rounded-[22px] bg-white text-[#0866ff] shadow-[0_10px_28px_-16px_rgba(8,102,255,.7)]">
                {parsing ? <span className="size-6 animate-spin rounded-full border-2 border-[#bed2f5] border-t-[#0866ff]" /> : <FileSpreadsheet className="size-7" aria-hidden />}
              </span>
              <h3 aria-live="polite" className="mt-5 text-[15px] font-bold text-[#20304a]">{parsing ? "Lendo estrutura do relatório..." : "Arraste o relatório para cá"}</h3>
              <p className="mt-1 max-w-md text-[12.5px] leading-relaxed text-[#7d8ba0]">CSV exportado do Meta Ads · até 5 MB · 5.000 linhas e 100 colunas</p>
              <button type="button" disabled={parsing} onClick={() => inputRef.current?.click()} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0866ff] px-5 text-[13px] font-bold text-white transition hover:bg-[#0759df] disabled:opacity-60">
                <UploadCloud className="size-4" aria-hidden /> Escolher arquivo
              </button>
            </div>
          ) : (
            <PreviewPanel preview={preview} onReplace={() => inputRef.current?.click()} />
          )}

          {fileError ? (
            <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] leading-relaxed text-red-700">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {fileError}
            </div>
          ) : null}
        </div>

        <footer className="flex shrink-0 flex-col gap-3 border-t border-[#e5eaf2] bg-[#fbfcfe] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-[11.5px] leading-relaxed text-[#7d8a9f]">
            A gravação será habilitada após confirmar os cabeçalhos do relatório real.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-[#d7dfeb] bg-white px-4 text-[12.5px] font-bold text-[#5c6a80] hover:bg-[#f5f7fa]">Fechar</button>
            <button type="button" disabled className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#b8c7dc] px-4 text-[12.5px] font-bold text-white disabled:cursor-not-allowed">
              Continuar importação <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function PreviewPanel({ preview, onReplace }: { preview: Preview; onReplace: () => void }) {
  const advancedMissing = [
    "Campanha",
    "Conjunto",
    "ID do anúncio",
    "Cliques no link",
    "Resultados",
    "Valor de conversão",
  ].filter((column) => !preview.recognized.includes(column));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-[#cfe0fa] bg-[#f5f8ff] p-4 sm:flex-row sm:items-center">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white text-[#0866ff] shadow-sm">
          <FileCheck2 className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-bold text-[#23334d]" title={preview.fileName}>{preview.fileName}</p>
          <p className="mt-0.5 text-[11.5px] text-[#7b899e]">{formatFileSize(preview.size)} · Aba “{preview.sheetName}”</p>
        </div>
        <button type="button" onClick={onReplace} className="min-h-9 rounded-xl border border-[#c8d9f4] bg-white px-3 text-[11.5px] font-bold text-[#1762ce] transition hover:bg-[#edf4ff]">Trocar arquivo</button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PreviewStat label="Linhas detectadas" value={preview.rowCount} />
        <PreviewStat label="Colunas" value={preview.headers.length} />
        <PreviewStat label="Colunas mapeadas" value={preview.recognized.length} success={preview.missing.length === 0} />
        <PreviewStat label="Essenciais ausentes" value={preview.missing.length} warning={preview.missing.length > 0} />
      </div>

      <div className="rounded-2xl border border-[#e1e7f0] bg-white p-4">
        <h3 className="text-[12.5px] font-bold text-[#2a3951]">Leitura inicial dos cabeçalhos</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {preview.headers.map((header, index) => (
            <span key={`${header}-${index}`} className="rounded-lg border border-[#dce4ef] bg-[#f8faff] px-2.5 py-1.5 text-[10.5px] font-semibold text-[#617087]">{header}</span>
          ))}
        </div>
        {preview.missing.length > 0 ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-800">Ainda não reconheci: <strong>{preview.missing.join(", ")}</strong>. Isso pode ser apenas diferença de idioma/nome; o arquivo não foi rejeitado.</p>
        ) : (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-[11.5px] font-semibold text-emerald-700"><CheckCircle2 className="size-4" aria-hidden /> Estrutura mínima reconhecida.</p>
        )}
      </div>

      <div className="rounded-2xl border border-[#cfe0fa] bg-[#f5f8ff] px-4 py-3 text-[11.5px] leading-relaxed text-[#446184]">
        <strong className="text-[#174f9e]">O que este arquivo permite agora:</strong>{" "}
        investimento, alcance, impressões, frequência, evolução diária e CPM.
        {advancedMissing.length > 0 ? (
          <span className="mt-1 block text-[#687a92]">
            Para CTR, CPC, CPA e ROAS, exporte também: {advancedMissing.join(", ")}.
          </span>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e1e7f0]">
        <div className="border-b border-[#e1e7f0] bg-[#f8faff] px-4 py-3">
          <h3 className="text-[12.5px] font-bold text-[#2a3951]">Prévia das primeiras linhas</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-max text-left">
            <thead className="bg-white">
              <tr>{preview.headers.map((header, index) => <th key={`${header}-${index}`} className="max-w-64 border-b border-[#e5eaf2] px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-[#8895a8]">{header}</th>)}</tr>
            </thead>
            <tbody>
              {preview.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-[#edf0f5] last:border-b-0">
                  {row.map((cell, cellIndex) => <td key={cellIndex} className="max-w-64 truncate px-3 py-2.5 text-[11px] text-[#526178]" title={cell}>{cell || "—"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PreviewStat({ label, value, success, warning }: { label: string; value: number; success?: boolean; warning?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${success ? "border-emerald-200 bg-emerald-50" : warning ? "border-amber-200 bg-amber-50" : "border-[#e1e7f0] bg-white"}`}>
      <span className="block text-[10.5px] font-semibold text-[#7f8ca0]">{label}</span>
      <strong className={`mt-1 block text-[20px] font-bold ${success ? "text-emerald-700" : warning ? "text-amber-700" : "text-[#24344d]"}`}>{value.toLocaleString("pt-BR")}</strong>
    </div>
  );
}
