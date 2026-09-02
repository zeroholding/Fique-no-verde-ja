import type { LucideIcon } from "lucide-react";

/**
 * Pecas da documentacao publica da API.
 *
 * A tipografia aqui e maior que a do painel de propósito: painel e tela de
 * trabalho, com densidade alta e leitura de relance; documentacao e texto
 * corrido, lido uma vez com atencao. Densidade de painel em texto corrido
 * cansa.
 */

/** Cabecalho de secao, com ancora para o menu lateral. */
export function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-slate-200 pt-12">
      {eyebrow && (
        <p className="text-[13px] font-bold uppercase tracking-[0.09em] text-[var(--tk-brand-strong)]">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-1.5 text-[28px] font-bold leading-tight tracking-[-0.02em] text-slate-900 sm:text-[32px]">
        {title}
      </h2>
      <div className="mt-5 text-[17px] leading-relaxed text-slate-700">
        {children}
      </div>
    </section>
  );
}

export function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-10 text-[21px] font-bold leading-snug text-slate-900">
      {children}
    </h3>
  );
}

/** Rota da API, destacada. */
export function Endpoint({
  method,
  path,
}: {
  method: "POST" | "GET" | "PATCH";
  path: string;
}) {
  const tone =
    method === "POST"
      ? "bg-green-100 text-green-800"
      : method === "PATCH"
        ? "bg-amber-100 text-amber-800"
        : "bg-blue-100 text-blue-800";

  return (
    <p className="mt-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span
        className={`shrink-0 rounded-md px-2.5 py-1 text-[14px] font-bold ${tone}`}
      >
        {method}
      </span>
      <code className="min-w-0 break-all font-mono text-[16px] font-semibold text-slate-900">
        {path}
      </code>
    </p>
  );
}

/** Aviso destacado. `tone` muda a intencao: informar, cuidar ou barrar. */
export function Callout({
  icon: Icon,
  title,
  tone = "info",
  children,
}: {
  icon: LucideIcon;
  title: string;
  tone?: "info" | "warn" | "danger";
  children: React.ReactNode;
}) {
  const styles = {
    info: "border-blue-200 bg-blue-50 text-blue-950",
    warn: "border-amber-200 bg-amber-50 text-amber-950",
    danger: "border-red-200 bg-red-50 text-red-950",
  }[tone];

  const iconTone = {
    info: "text-blue-600",
    warn: "text-amber-600",
    danger: "text-red-600",
  }[tone];

  return (
    <div className={`mt-5 rounded-xl border px-5 py-4 ${styles}`}>
      <p className="flex items-center gap-2 text-[16px] font-bold">
        <Icon
          className={`h-[19px] w-[19px] shrink-0 ${iconTone}`}
          strokeWidth={1.9}
          aria-hidden="true"
        />
        {title}
      </p>
      <div className="mt-1.5 text-[16px] leading-relaxed">{children}</div>
    </div>
  );
}

export type FieldRow = {
  name: string;
  type: string;
  required: boolean;
  description: string;
};

/**
 * Tabela de campos.
 *
 * No telefone vira lista de cartoes em vez de rolar na horizontal: uma tabela
 * de quatro colunas em 360px seria ilegivel de qualquer forma.
 */
export function FieldTable({ rows }: { rows: FieldRow[] }) {
  return (
    <div className="mt-5">
      {/* Telefone: cartoes */}
      <ul className="space-y-3 lg:hidden">
        {rows.map((row) => (
          <li
            key={row.name}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3"
          >
            <p className="flex flex-wrap items-center gap-2">
              <code className="font-mono text-[15.5px] font-bold text-slate-900">
                {row.name}
              </code>
              <RequiredTag required={row.required} />
            </p>
            <p className="mt-1 font-mono text-[14px] text-slate-500">
              {row.type}
            </p>
            <p className="mt-2 text-[16px] leading-relaxed text-slate-700">
              {row.description}
            </p>
          </li>
        ))}
      </ul>

      {/* Tela larga: tabela */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 lg:block">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th
                scope="col"
                className="px-4 py-3 text-[13px] font-bold uppercase tracking-wide text-slate-500"
              >
                Campo
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-[13px] font-bold uppercase tracking-wide text-slate-500"
              >
                Tipo
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-[13px] font-bold uppercase tracking-wide text-slate-500"
              >
                Obrigatório
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-[13px] font-bold uppercase tracking-wide text-slate-500"
              >
                Descrição
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.name}
                className="border-b border-slate-100 last:border-0 align-top"
              >
                <td className="px-4 py-3.5">
                  <code className="font-mono text-[15.5px] font-bold text-slate-900">
                    {row.name}
                  </code>
                </td>
                <td className="px-4 py-3.5 font-mono text-[14.5px] text-slate-500">
                  {row.type}
                </td>
                <td className="px-4 py-3.5">
                  <RequiredTag required={row.required} />
                </td>
                <td className="px-4 py-3.5 text-[16px] leading-relaxed text-slate-700">
                  {row.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RequiredTag({ required }: { required: boolean }) {
  return required ? (
    <span className="inline-block shrink-0 rounded-md bg-red-100 px-2 py-0.5 text-[13px] font-bold text-red-800">
      Sim
    </span>
  ) : (
    <span className="inline-block shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[13px] font-semibold text-slate-500">
      Opcional
    </span>
  );
}
