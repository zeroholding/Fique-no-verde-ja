import type { PoolClient } from "pg";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateCommissionAfterRefund(
  currentCommissionAmount: number,
  currentSaleTotal: number,
  newSaleTotal: number,
): number {
  const ratio =
    currentSaleTotal > 0
      ? Math.max(0, newSaleTotal) / currentSaleTotal
      : 0;
  return roundMoney(Math.max(0, currentCommissionAmount * ratio));
}

export function calculateAdjustmentIncrement(
  paidCommissionAmount: number,
  commissionDueAfterEvent: number,
  adjustmentsAlreadyRegistered: number,
): number {
  const cumulativeAdjustment = Math.max(
    0,
    paidCommissionAmount - commissionDueAfterEvent,
  );
  return roundMoney(
    Math.max(0, cumulativeAdjustment - adjustmentsAlreadyRegistered),
  );
}

export function calculatePaymentAmounts(
  grossCommissionAmount: number,
  pendingAdjustmentAmount: number,
): { adjustmentAmount: number; netAmount: number } {
  const grossAmount = roundMoney(Math.max(0, grossCommissionAmount));
  const adjustmentAmount = roundMoney(
    Math.min(grossAmount, Math.max(0, pendingAdjustmentAmount)),
  );
  return {
    adjustmentAmount,
    netAmount: roundMoney(grossAmount - adjustmentAmount),
  };
}

export function isValidMonth(value: string): boolean {
  return monthPattern.test(value);
}

export function isValidDate(value: string): boolean {
  if (!datePattern.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function getNextMonth(competenceMonth: string): string {
  const [year, month] = competenceMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

export function getScheduledPaymentDate(competenceMonth: string): string {
  const [year, month] = competenceMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month, 15)).toISOString().slice(0, 10);
}

export function getTodayInSaoPaulo(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function isCompetenceClosed(
  client: PoolClient,
  userId: string,
  referenceDate: string | Date,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1
     FROM commission_payments
     WHERE user_id = $1
       AND competence_month = DATE_TRUNC(
         'month',
         $2::timestamptz AT TIME ZONE 'America/Sao_Paulo'
       )::date
       AND status = 'paid'
     LIMIT 1`,
    [userId, referenceDate],
  );
  return Boolean(result.rowCount);
}

export function isAccountingIntegrityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return (
    message.includes("COMMISSION_COMPETENCE_CLOSED") ||
    message.includes("COMMISSION_PAID_IMMUTABLE")
  );
}
