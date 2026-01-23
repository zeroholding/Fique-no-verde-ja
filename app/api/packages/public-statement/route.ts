import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type StatementToken = {
  clientId: string;
  scope?: string;
};

const formatError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro ao carregar extrato";
  const status =
    message.toLowerCase().includes("token") || message.toLowerCase().includes("autenticacao") ? 401 : 400;

  return NextResponse.json({ error: message }, { status });
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    
    // Filtros opcionais
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const opType = searchParams.get("type"); // compra | consumo

    if (!token) {
      return NextResponse.json({ error: "Token do extrato nao informado" }, { status: 400 });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as StatementToken;

    if (!decoded?.clientId) {
      throw new Error("Token invalido para o extrato");
    }

    if (decoded.scope && decoded.scope !== "package-statement") {
      throw new Error("Escopo do token invalido");
    }

    const clientId = decoded.clientId;

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const hasStart = !!(startDate && dateRegex.test(startDate));
    const hasEnd = !!(endDate && dateRegex.test(endDate));

    const purchasesResult = await query(
      `
        -- 1. Criação do Pacote (Legado)
        SELECT
          cp.sale_id::text AS id,
          cp.client_id,
          c.name AS client_name,
          cp.sale_id,
          s.observations AS sale_observations,
          u.first_name || ' ' || u.last_name AS attendant_name,
          COALESCE(s.sale_date, cp.created_at) AS op_date,
          cp.total_paid AS value,
          cp.initial_quantity AS quantity,
          cp.unit_price AS unit_price,
          serv.name AS service_name
        FROM client_packages cp
        JOIN clients c ON cp.client_id = c.id
        JOIN sales s ON cp.sale_id = s.id
        JOIN users u ON s.attendant_id = u.id
        LEFT JOIN services serv ON cp.service_id = serv.id
        WHERE cp.client_id = $1
        AND s.status != 'cancelada'

        UNION ALL

        SELECT
          s.id::text AS id,
          s.client_id,
          c.name AS client_name,
          s.id AS sale_id,
          s.observations AS sale_observations,
          u.first_name || ' ' || u.last_name AS attendant_name,
          s.sale_date AS op_date,
          s.total AS value,
          si.quantity AS quantity,
          si.unit_price AS unit_price,
          si.product_name AS service_name
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        JOIN clients c ON s.client_id = c.id
        JOIN users u ON s.attendant_id = u.id
        WHERE s.client_id = $1
        AND s.status != 'cancelada'
        AND si.sale_type = '02'
        AND s.id NOT IN (SELECT sale_id FROM client_packages)
      `,
      [clientId]
    );

    const consumptionsResult = await query(
      `
        SELECT
          pc.id,
          cp.client_id,
          c.name AS client_name,
          pc.sale_id,
          s.observations AS sale_observations,
          u.first_name || ' ' || u.last_name AS attendant_name,
          COALESCE(s.sale_date, pc.consumed_at) AS op_date,
          -pc.total_value AS value,
          pc.quantity AS quantity,
          pc.unit_price AS unit_price,
          serv.name AS service_name,
          ec.name AS end_client_name
        FROM package_consumptions pc
        JOIN client_packages cp ON pc.package_id = cp.id
        JOIN clients c ON cp.client_id = c.id
        JOIN sales s ON pc.sale_id = s.id
        JOIN clients ec ON s.client_id = ec.id
        JOIN users u ON s.attendant_id = u.id
        LEFT JOIN services serv ON cp.service_id = serv.id
        WHERE cp.client_id = $1
        AND s.status != 'cancelada'
      `,
      [clientId]
    );

    const operationsRaw: any[] = [
      ...purchasesResult.rows.map((r: any) => ({ ...r, operation_type: "compra" })),
      ...consumptionsResult.rows.map((r: any) => ({ ...r, operation_type: "consumo" })),
    ];

    // 1. Ordena TUDO por data ascendente para calculo de saldo
    const opsSortedAll = [...operationsRaw].sort(
      (a, b) => new Date(a.op_date).getTime() - new Date(b.op_date).getTime()
    );

    // 2. Calcula saldo linha a linha (histórico completo)
    const balances: Record<string, number> = {};
    const qtyBalances: Record<string, number> = {};

    const opsWithBalance = opsSortedAll.map((op) => {
      const current = balances[op.client_id] ?? 0;
      const nextBalance = current + Number(op.value);
      balances[op.client_id] = nextBalance;

      const currentQty = qtyBalances[op.client_id] ?? 0;
      const deltaQty = op.operation_type === "compra" ? Number(op.quantity) : -Number(op.quantity);
      const nextQty = currentQty + deltaQty;
      qtyBalances[op.client_id] = nextQty;

      return {
        id: op.id,
        clientId: op.client_id,
        clientName: op.client_name,
        serviceName: op.service_name,
        saleId: op.sale_id,
        attendantName: op.attendant_name,
        operationType: op.operation_type as "compra" | "consumo",
        date: op.op_date,
        value: Number(op.value),
        quantity: Number(op.quantity),
        unitPrice: Number(op.unit_price),
        balanceAfter: nextBalance,
        balanceQuantityAfter: nextQty,
        observations: op.sale_observations || null,
        endClientName: op.end_client_name || null, // [NEW] Nome do cliente final
      };
    });

    // 3. Aplica filtros no resultado calculado
    const filteredOps = opsWithBalance.filter((op) => {
      if (opType === "compra" && op.operationType !== "compra") return false;
      if (opType === "consumo" && op.operationType !== "consumo") return false;
      if (hasStart && new Date(op.date).getTime() < new Date(startDate!).setHours(0, 0, 0, 0)) return false;
      if (hasEnd && new Date(op.date).getTime() > new Date(endDate!).setHours(23, 59, 59, 999)) return false;
      return true;
    });

    // 4. Ordena para exibir (descendente por data)
    const operations = filteredOps.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // 5. Gera resumo baseado nos itens filtrados
    const summaryMap: Record<string, any> = {};
    for (const op of filteredOps) {
      const s = (summaryMap[op.clientId] ??= {
        clientId: op.clientId,
        clientName: op.clientName,
        totalAcquired: 0,
        totalConsumed: 0,
        balanceCurrent: 0,
        totalQuantityAcquired: 0,
        totalQuantityConsumed: 0,
        balanceQuantityCurrent: 0,
        lastOperation: op.date,
      });

      if (op.operationType === "compra") s.totalAcquired += Number(op.value);
      if (op.operationType === "consumo") s.totalConsumed += Number(-op.value);
      s.balanceCurrent += Number(op.value);

      if (op.operationType === "compra") s.totalQuantityAcquired += Number(op.quantity);
      if (op.operationType === "consumo") s.totalQuantityConsumed += Number(op.quantity);
      s.balanceQuantityCurrent += op.operationType === "compra" ? Number(op.quantity) : -Number(op.quantity);

      if (!s.lastOperation || new Date(op.date).getTime() > new Date(s.lastOperation).getTime()) {
        s.lastOperation = op.date;
      }
    }

    return NextResponse.json(
      {
        operations,
        summary: Object.values(summaryMap),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao carregar extrato publico:", error);
    return formatError(error);
  }
}
