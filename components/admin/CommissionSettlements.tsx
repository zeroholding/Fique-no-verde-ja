"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { useToast } from "@/components/Toast";

type Adjustment = {
  id: string;
  sale_id: string;
  sale_number: number | null;
  attendant_name: string;
  client_name: string | null;
  origin_competence: string;
  adjustment_type: string;
  refund_date: string;
  refund_amount: number;
  amount: number;
  remaining_amount: number;
  status: string;
  applied_payments: Array<{
    paymentId: string;
    competenceMonth: string;
    paymentDate: string;
    amountApplied: number;
  }>;
};

type Payment = {
  id: string;
  attendant_name: string;
  competence_month: string;
  scheduled_payment_date: string;
  payment_date: string;
  gross_commission_amount: number;
  adjustment_amount: number;
  net_paid_amount: number;
  commission_count: number;
};

type PaymentPreview = {
  scheduledPaymentDate: string;
  commissionCount: number;
  grossAmount: number;
  pendingAdjustmentAmount: number;
  adjustmentAmount: number;
  netAmount: number;
  alreadyPaid: boolean;
  canPay: boolean;
  error: string | null;
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function previousMonth(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function CommissionSettlements() {
  const { error, success } = useToast();
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [attendants, setAttendants] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [summary, setSummary] = useState({
    totalAmount: 0,
    totalApplied: 0,
    totalPending: 0,
  });
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<PaymentPreview | null>(null);
  const [form, setForm] = useState({
    userId: "",
    competenceMonth: previousMonth(),
    paymentDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const fetchData = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    setLoading(true);
    try {
      const [adjustmentsResponse, paymentsResponse, usersResponse] =
        await Promise.all([
          fetch("/api/admin/commission-adjustments", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("/api/admin/commission-payments", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("/api/admin/users?active=true", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

      const [adjustmentsData, paymentsData, usersData] = await Promise.all([
        adjustmentsResponse.json(),
        paymentsResponse.json(),
        usersResponse.json(),
      ]);

      if (!adjustmentsResponse.ok) {
        throw new Error(adjustmentsData.error || "Erro ao carregar ajustes");
      }
      if (!paymentsResponse.ok) {
        throw new Error(paymentsData.error || "Erro ao carregar pagamentos");
      }
      if (!usersResponse.ok) {
        throw new Error(usersData.error || "Erro ao carregar atendentes");
      }

      setAdjustments(adjustmentsData.adjustments || []);
      setSummary(adjustmentsData.summary);
      setPayments(paymentsData.payments || []);
      setAttendants(
        (usersData.users || []).map(
          (user: {
            id: string;
            first_name: string;
            last_name: string;
            email: string;
          }) => ({
            value: user.id,
            label:
              `${user.first_name} ${user.last_name}`.trim() || user.email,
          }),
        ),
      );
    } catch (caught) {
      error(caught instanceof Error ? caught.message : "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchPreview = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token || !form.userId) {
      setPreview(null);
      return;
    }

    setPreviewLoading(true);
    try {
      const params = new URLSearchParams({
        preview: "true",
        userId: form.userId,
        competenceMonth: form.competenceMonth,
        paymentDate: form.paymentDate,
      });
      const response = await fetch(`/api/admin/commission-payments?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        setPreview({
          scheduledPaymentDate: "",
          commissionCount: 0,
          grossAmount: 0,
          pendingAdjustmentAmount: 0,
          adjustmentAmount: 0,
          netAmount: 0,
          alreadyPaid: false,
          canPay: false,
          error: data.error || "Nao foi possivel calcular a previa",
        });
        return;
      }
      setPreview(data.preview);
    } catch {
      setPreview({
        scheduledPaymentDate: "",
        commissionCount: 0,
        grossAmount: 0,
        pendingAdjustmentAmount: 0,
        adjustmentAmount: 0,
        netAmount: 0,
        alreadyPaid: false,
        canPay: false,
        error: "Nao foi possivel calcular a previa",
      });
    } finally {
      setPreviewLoading(false);
    }
  }, [form.competenceMonth, form.paymentDate, form.userId]);

  useEffect(() => {
    const timer = window.setTimeout(fetchPreview, 250);
    return () => window.clearTimeout(timer);
  }, [fetchPreview]);

  const pendingCount = useMemo(
    () =>
      adjustments.filter(
        (item) =>
          item.status === "pending" || item.status === "partially_applied",
      ).length,
    [adjustments],
  );

  const registerPayment = async (event: FormEvent) => {
    event.preventDefault();
    const token = localStorage.getItem("token");
    if (!token) return;

    if (!preview?.canPay) {
      error(preview?.error || "Calcule uma previa valida antes de pagar");
      return;
    }

    if (
      !confirm(
        `Confirmar pagamento bruto de ${currency.format(
          preview.grossAmount,
        )}, com ${currency.format(
          preview.adjustmentAmount,
        )} em ajustes e liquido de ${currency.format(preview.netAmount)}?`,
      )
    ) {
      return;
    }

    setPaying(true);
    try {
      const response = await fetch("/api/admin/commission-payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao registrar pagamento");
      }

      success(
        `Pagamento registrado. Liquido: ${currency.format(
          data.payment.netAmount,
        )}`,
      );
      setForm({ ...form, notes: "" });
      await fetchData();
      await fetchPreview();
    } catch (caught) {
      error(
        caught instanceof Error ? caught.message : "Erro ao registrar pagamento",
      );
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryCard
          label="Debito pendente"
          value={summary.totalPending}
          color="red"
        />
        <SummaryCard
          label="Total de ajustes"
          value={summary.totalAmount}
          color="amber"
        />
        <SummaryCard
          label="Ja abatido"
          value={summary.totalApplied}
          color="emerald"
        />
      </div>

      <form
        onSubmit={registerPayment}
        className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6"
      >
        <h2 className="text-lg font-semibold">Registrar pagamento</h2>
        <p className="mb-4 text-sm text-gray-400">
          Os ajustes pendentes mais antigos sao abatidos automaticamente.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Select
            required
            value={form.userId}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              setForm({ ...form, userId: event.target.value })
            }
            options={[{ value: "", label: "Selecione o atendente" }, ...attendants]}
          />
          <input
            required
            type="month"
            value={form.competenceMonth}
            onChange={(event) =>
              setForm({ ...form, competenceMonth: event.target.value })
            }
            className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white"
          />
          <input
            required
            type="date"
            value={form.paymentDate}
            onChange={(event) =>
              setForm({ ...form, paymentDate: event.target.value })
            }
            className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white"
          />
          <Button
            type="submit"
            disabled={
              paying || previewLoading || !form.userId || !preview?.canPay
            }
          >
            {paying
              ? "Registrando..."
              : previewLoading
                ? "Calculando..."
                : "Registrar pagamento"}
          </Button>
        </div>
        <input
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
          placeholder="Observacao opcional"
          className="mt-3 w-full rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white"
        />
        {preview && (
          <div className="mt-4">
            {preview.error ? (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {preview.error}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <PreviewValue label="Comissao bruta" value={preview.grossAmount} />
                  <PreviewValue
                    label="Ajustes a abater"
                    value={preview.adjustmentAmount}
                    negative
                  />
                  <PreviewValue label="Liquido a pagar" value={preview.netAmount} />
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  {preview.commissionCount} comissoes. Pagamento previsto a
                  partir de {formatDate(preview.scheduledPaymentDate)}. Debito
                  pendente total: {currency.format(preview.pendingAdjustmentAmount)}.
                </p>
              </>
            )}
          </div>
        )}
      </form>

      <div className="rounded-2xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-6">
          <div>
            <h2 className="font-semibold">Ajustes pos-pagamento</h2>
            <p className="text-sm text-gray-400">
              {pendingCount} ajustes ainda possuem saldo pendente.
            </p>
          </div>
          <Button variant="secondary" onClick={fetchData} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="bg-white/5 text-left text-gray-300">
              <tr>
                <th className="px-6 py-3">Data estorno</th>
                <th className="px-6 py-3">Atendente</th>
                <th className="px-6 py-3">Venda/Cliente</th>
                <th className="px-6 py-3">Competencia origem</th>
                <th className="px-6 py-3">Tipo</th>
                <th className="px-6 py-3 text-right">Valor evento</th>
                <th className="px-6 py-3 text-right">Debito</th>
                <th className="px-6 py-3 text-right">Saldo</th>
                <th className="px-6 py-3">Abatido em</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {adjustments.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-3">
                    {item.refund_date
                      ? new Date(item.refund_date).toLocaleString("pt-BR")
                      : "-"}
                  </td>
                  <td className="px-6 py-3 font-medium">{item.attendant_name}</td>
                  <td className="px-6 py-3">
                    <a
                      href={`/dashboard/sales?saleId=${item.sale_id}`}
                      className="text-blue-300 hover:underline"
                    >
                      {item.sale_number
                        ? `#${item.sale_number}`
                        : item.sale_id.slice(0, 8)}
                    </a>
                    <p className="text-xs text-gray-400">
                      {item.client_name || "-"}
                    </p>
                  </td>
                  <td className="px-6 py-3">
                    {formatCompetence(item.origin_competence)}
                  </td>
                  <td className="px-6 py-3">
                    {item.adjustment_type === "cancellation"
                      ? "Cancelamento"
                      : item.adjustment_type === "manual"
                        ? "Manual"
                        : "Estorno"}
                  </td>
                  <td className="px-6 py-3 text-right text-amber-200">
                    {currency.format(item.refund_amount)}
                  </td>
                  <td className="px-6 py-3 text-right text-red-300">
                    {currency.format(item.amount)}
                  </td>
                  <td className="px-6 py-3 text-right font-semibold text-red-200">
                    {currency.format(item.remaining_amount)}
                  </td>
                  <td className="px-6 py-3 text-xs text-gray-300">
                    {item.applied_payments.length
                      ? item.applied_payments.map((payment) => (
                          <div key={payment.paymentId}>
                            {formatCompetence(payment.competenceMonth)}:{" "}
                            {currency.format(payment.amountApplied)}
                          </div>
                        ))
                      : "-"}
                  </td>
                  <td className="px-6 py-3">{formatAdjustmentStatus(item.status)}</td>
                </tr>
              ))}
              {!loading && adjustments.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-6 py-10 text-center text-gray-400">
                    Nenhum ajuste de comissao registrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5">
        <div className="border-b border-white/10 px-4 py-4 sm:px-6">
          <h2 className="font-semibold">Historico de pagamentos</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="bg-white/5 text-left text-gray-300">
              <tr>
                <th className="px-6 py-3">Competencia</th>
                <th className="px-6 py-3">Atendente</th>
                <th className="px-6 py-3">Pagamento</th>
                <th className="px-6 py-3 text-right">Registros</th>
                <th className="px-6 py-3 text-right">Bruto</th>
                <th className="px-6 py-3 text-right">Ajustes</th>
                <th className="px-6 py-3 text-right">Liquido pago</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {payments.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-3">
                    {formatCompetence(item.competence_month)}
                  </td>
                  <td className="px-6 py-3">{item.attendant_name}</td>
                  <td className="px-6 py-3">
                    {formatDate(item.payment_date)}
                    <p className="text-xs text-gray-500">
                      Previsto: {formatDate(item.scheduled_payment_date)}
                    </p>
                  </td>
                  <td className="px-6 py-3 text-right">{item.commission_count}</td>
                  <td className="px-6 py-3 text-right">
                    {currency.format(item.gross_commission_amount)}
                  </td>
                  <td className="px-6 py-3 text-right text-red-300">
                    -{currency.format(item.adjustment_amount)}
                  </td>
                  <td className="px-6 py-3 text-right font-bold text-emerald-300">
                    {currency.format(item.net_paid_amount)}
                  </td>
                </tr>
              ))}
              {!loading && payments.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-gray-400">
                    Nenhum pagamento de competencia registrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "red" | "amber" | "emerald";
}) {
  const colors = {
    red: "border-red-500/20 bg-red-500/10 text-red-300",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  };

  return (
    <div className={`rounded-2xl border p-4 ${colors[color]}`}>
      <p className="text-xs uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold">{currency.format(value)}</p>
    </div>
  );
}

function PreviewValue({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: number;
  negative?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold ${
          negative ? "text-red-300" : "text-white"
        }`}
      >
        {negative && value > 0 ? "-" : ""}
        {currency.format(value)}
      </p>
    </div>
  );
}

function formatCompetence(value: string): string {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR", {
    month: "2-digit",
    year: "numeric",
  });
}

function formatDate(value: string): string {
  if (!value) return "-";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatAdjustmentStatus(status: string): string {
  if (status === "applied") return "Abatido";
  if (status === "partially_applied") return "Parcial";
  if (status === "cancelled") return "Cancelado";
  return "Pendente";
}
