import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const formatError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro ao carregar extrato";
  return NextResponse.json({ error: message }, { status: 400 });
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");
    
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const opType = searchParams.get("type"); 

    if (!slug) {
      return NextResponse.json({ error: "Slug do extrato não informado" }, { status: 400 });
    }

    // Lookup clientId by slug
    const clientLookup = await query("SELECT id FROM clients WHERE statement_slug = $1 AND client_type = 'package'", [slug]);
    
    if (clientLookup.rows.length === 0) {
      return NextResponse.json({ error: "Link invalido ou cliente nao encontrado" }, { status: 404 });
    }
    
    const clientId = clientLookup.rows[0].id;

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const hasStart = !!(startDate && dateRegex.test(startDate));
    const hasEnd = !!(endDate && dateRegex.test(endDate));

    const purchasesResult = await query(
      `
        WITH invisible_reloads_sum AS (
            SELECT 
                s.client_id, 
                SUM(si.quantity) as total_qty
            FROM sales s
            JOIN sale_items si ON s.id = si.sale_id
            WHERE si.sale_type = '02' 
            AND s.status != 'cancelada'
            AND s.id NOT IN (SELECT sale_id FROM client_packages WHERE sale_id IS NOT NULL)
            GROUP BY s.client_id
        )
        SELECT
          cp.sale_id::text AS id,
          cp.client_id,
          c.name AS client_name,
          cp.sale_id,
          s.attendant_id,
          u.first_name || ' ' || u.last_name AS attendant_name,
          COALESCE(s.sale_date, cp.created_at) AS op_date,
          
          (cp.total_paid - COALESCE(
              (SELECT SUM(s2.total) 
               FROM sales s2 
               JOIN sale_items si2 ON s2.id = si2.sale_id
               WHERE s2.client_id = cp.client_id 
               AND si2.sale_type = '02'
               AND s2.status != 'cancelada'
               AND s2.id NOT IN (SELECT sale_id FROM client_packages)
              ), 0)
          ) AS value,

          (cp.initial_quantity - COALESCE(irs.total_qty, 0)) AS quantity,
          
          cp.unit_price AS unit_price,
          serv.name AS service_name
        FROM client_packages cp
        JOIN clients c ON cp.client_id = c.id
        LEFT JOIN sales s ON cp.sale_id = s.id
        LEFT JOIN users u ON s.attendant_id = u.id
        LEFT JOIN services serv ON cp.service_id = serv.id
        LEFT JOIN invisible_reloads_sum irs ON cp.client_id = irs.client_id
        WHERE cp.client_id = $1
        AND cp.initial_quantity > COALESCE(irs.total_qty, 0)
        
        UNION ALL

        SELECT
          s.id::text AS id,
          s.client_id,
          c.name AS client_name,
          s.id AS sale_id,
          s.attendant_id,
          u.first_name || ' ' || u.last_name AS attendant_name,
          s.sale_date AS op_date,
          s.total AS value,
          si.quantity AS quantity,
          si.unit_price AS unit_price,
          si.product_name AS service_name
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        JOIN clients c ON s.client_id = c.id
        LEFT JOIN users u ON s.attendant_id = u.id
        WHERE s.client_id = $1
        AND s.status != 'cancelada'
        AND si.sale_type = '02'
        AND s.id NOT IN (SELECT sale_id FROM client_packages WHERE sale_id IS NOT NULL)
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

    const livePackageRes = await query(`
        SELECT available_quantity, unit_price FROM client_packages 
        WHERE client_id = $1
        ORDER BY created_at DESC LIMIT 1
    `, [clientId]);
    const livePkg = livePackageRes.rows[0];

    const operationsRaw: any[] = [
      ...purchasesResult.rows.map((r: any) => ({ ...r, operation_type: "compra" })),
      ...consumptionsResult.rows.map((r: any) => ({ ...r, operation_type: "consumo" })),
    ];

    let opsSortedAll = [...operationsRaw].sort(
      (a, b) => new Date(a.op_date).getTime() - new Date(b.op_date).getTime()
    );

    if (livePkg && opsSortedAll.length > 0) {
      const targetQty = Number(livePkg.available_quantity);
      const targetFinance = targetQty * Number(livePkg.unit_price);
      
      const calcQty = opsSortedAll.reduce((acc, op) => 
        acc + (op.operation_type === "compra" ? Number(op.quantity) : -Number(op.quantity)), 0);
      const calcFinance = opsSortedAll.reduce((acc, op) => acc + Number(op.value), 0);
      
      const diffQty = targetQty - calcQty;
      const diffFinance = targetFinance - calcFinance;

      if (Math.abs(diffQty) > 0.01 || Math.abs(diffFinance) > 0.01) {
        const firstDate = opsSortedAll[0].op_date;
        opsSortedAll.unshift({
          id: 'initial_adjustment',
          client_id: clientId,
          client_name: opsSortedAll[0].client_name,
          service_name: 'Ajuste de Saldo / Saldo Inicial',
          sale_id: null,
          attendant_name: 'Sistema',
          op_date: firstDate,
          value: diffFinance,
          quantity: Math.abs(diffQty),
          unit_price: diffQty !== 0 ? Math.abs(diffFinance / diffQty) : 0,
          operation_type: diffQty >= 0 ? "compra" : "consumo",
          is_adjustment: true
        });
      }
    }

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
        endClientName: op.end_client_name || null,
      };
    });

    const filteredOps = opsWithBalance.filter((op) => {
      if (opType === "compra" && op.operationType !== "compra") return false;
      if (opType === "consumo" && op.operationType !== "consumo") return false;
      if (hasStart && new Date(op.date).getTime() < new Date(startDate!).setHours(0, 0, 0, 0)) return false;
      if (hasEnd && new Date(op.date).getTime() > new Date(endDate!).setHours(23, 59, 59, 999)) return false;
      return true;
    });

    const operations = filteredOps.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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

    if (livePkg) {
      Object.values(summaryMap).forEach((s: any) => {
        if (s.clientId === clientId) {
           s.balanceQuantityCurrent = Number(livePkg.available_quantity);
           s.balanceCurrent = Number(livePkg.available_quantity) * Number(livePkg.unit_price);
        }
      });
    }

    return NextResponse.json(
      {
        operations,
        summary: Object.values(summaryMap),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao carregar extrato publico por slug:", error);
    return formatError(error);
  }
}
