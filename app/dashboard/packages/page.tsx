"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/Button";

type PackageSummary = {
  clientId: string;
  clientName: string;
  balanceQuantityCurrent: number;
  totalQuantityAcquired: number;
  totalQuantityConsumed: number;
  balanceCurrent: number;
  lastOperation: string | null;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatDateTime = (value: string) => {
  const d = new Date(value);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

export default function PackagesIndexPage() {
  const { error, success } = useToast();
  const [summaries, setSummaries] = useState<PackageSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingLinkFor, setGeneratingLinkFor] = useState<string | null>(null);
  const [generatedLinks, setGeneratedLinks] = useState<Record<string, string>>({});

  const fetchSummaries = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setLoading(true);
    try {
      // Reaproveita o endpoint de extrato, sem filtros, pegando apenas summary
      const res = await fetch("/api/packages/statement", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao carregar pacotes");
      }
      setSummaries((data.summary as PackageSummary[]) || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar pacotes";
      error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummaries();
  }, []);

  const totalSaldoQtde = useMemo(
    () => summaries.reduce((acc, s) => acc + (s.balanceQuantityCurrent ?? 0), 0),
    [summaries]
  );

  const handleGenerateShareLink = async (clientId: string) => {
    const token = localStorage.getItem("token");
    if (!token) {
      error("Sessao expirada. Faca login novamente.");
      return;
    }

    setGeneratingLinkFor(clientId);
    try {
      const res = await fetch("/api/packages/public-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ clientId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao gerar link do extrato");
      }

      const link = data.url as string;
      setGeneratedLinks((prev) => ({ ...prev, [clientId]: link }));

      const canCopy = typeof navigator !== "undefined" && !!navigator.clipboard;
      if (canCopy && link) {
        await navigator.clipboard.writeText(link);
        success("Link copiado para a area de transferencia");
      } else {
        success("Link gerado. Copie e envie para o responsavel.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao gerar link do extrato";
      error(msg);
    } finally {
      setGeneratingLinkFor(null);
    }
  };

  return (
    <div className="p-8 space-y-6 text-white">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-widest text-gray-400">Pacotes</p>
        <h1 className="text-3xl font-semibold">Contas de Pacotes</h1>
        <p className="text-gray-300">
          Visão geral por cliente parceiro: saldo de créditos, adquiridos/consumidos e acesso rápido ao extrato.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">Saldo total (qtde) nos parceiros</p>
          <p className="text-2xl font-bold text-emerald-300">{totalSaldoQtde}</p>
        </div>
        <Button size="sm" variant="secondary" className="rounded-xl" onClick={fetchSummaries} disabled={loading}>
          {loading ? "Atualizando..." : "Atualizar"}
        </Button>
      </div>

      {loading ? (
        <div className="px-6 py-10 text-center text-gray-300">Carregando...</div>
      ) : summaries.length === 0 ? (
        <div className="px-6 py-10 text-center text-gray-400">Nenhum cliente parceiro com pacotes.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {summaries.map((s) => (
            <div
              key={s.clientId}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-2 hover:border-white/20 transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Cliente parceiro</p>
                  <p className="text-lg font-semibold text-white">{s.clientName}</p>
                </div>
                <span className="text-xs text-gray-400">
                  {s.lastOperation ? formatDateTime(s.lastOperation) : "Sem movimento"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                  <p className="text-xs text-gray-300">Saldo (qtde)</p>
                  <p className="text-xl font-bold text-emerald-200">{s.balanceQuantityCurrent ?? 0}</p>
                </div>
                <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                  <p className="text-xs text-gray-300">Saldo financeiro</p>
                  <p className="text-lg font-semibold text-white">{formatCurrency(s.balanceCurrent ?? 0)}</p>
                </div>
                <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                  <p className="text-xs text-gray-300">Adquiridos (qtde)</p>
                  <p className="text-lg font-semibold text-white">{s.totalQuantityAcquired ?? 0}</p>
                </div>
                <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                  <p className="text-xs text-gray-300">Consumidos (qtde)</p>
                  <p className="text-lg font-semibold text-white">{s.totalQuantityConsumed ?? 0}</p>
                </div>
              </div>
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Link
                    href={`/dashboard/packages/statement?clientId=${s.clientId}`}
                    className="inline-flex items-center justify-center rounded-xl bg-blue-500/20 border border-blue-500/30 px-4 py-2 text-sm font-medium text-blue-100 hover:bg-blue-500/30 transition"
                  >
                    Ver extrato
                  </Link>
                  <Button
                    size="sm"
                    className="w-full rounded-xl"
                    onClick={() => handleGenerateShareLink(s.clientId)}
                    disabled={generatingLinkFor === s.clientId}
                  >
                    {generatingLinkFor === s.clientId ? "Gerando link..." : "Gerar link compartilhavel"}
                  </Button>
                </div>
                {generatedLinks[s.clientId] && (
                  <div className="text-xs text-blue-100 bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 break-all">
                    {generatedLinks[s.clientId]}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
