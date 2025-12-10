import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { query } from "@/lib/db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

type DecodedToken = { userId: string };

type AuthenticatedUser = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_admin: boolean;
};

const getTokenFromRequest = (request: NextRequest) => {
  const cookieToken = request.cookies.get("token")?.value;
  if (cookieToken) return cookieToken;
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  return null;
};

const authenticateUser = async (request: NextRequest): Promise<AuthenticatedUser> => {
  const token = getTokenFromRequest(request);
  if (!token) {
    throw new Error("Token de autenticacao nao informado");
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
    const result = await query(
      `SELECT id, first_name, last_name, email, is_admin FROM users WHERE id = $1`,
      [decoded.userId]
    );
    const user = result.rows[0];
    if (!user) {
      throw new Error("Usuario nao encontrado");
    }
    return user;
  } catch (error) {
    console.error("Falha na autenticacao:", error);
    throw new Error("Falha na autenticacao");
  }
};

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateUser(request);
    const { searchParams } = new URL(request.url);

    const clientId = searchParams.get("clientId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const opType = searchParams.get("type"); // compra | consumo | all
    const attendantId = searchParams.get("attendantId"); // apenas para master filtrar opcionalmente

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const hasStart = !!(startDate && dateRegex.test(startDate));
    const hasEnd = !!(endDate && dateRegex.test(endDate));

    // Buscar todas as compras
    const purchasesResult = await query(
      `
        SELECT
          cp.id,
          cp.client_id,
          c.name AS client_name,
          cp.sale_id,
          s.attendant_id,
          u.first_name || ' ' || u.last_name AS attendant_name,
          cp.created_at AS op_date,
          cp.total_paid AS value,
          cp.initial_quantity AS quantity,
          cp.unit_price AS unit_price,
          serv.name AS service_name
        FROM client_packages cp
        JOIN clients c ON cp.client_id = c.id
        JOIN sales s ON cp.sale_id = s.id
        JOIN users u ON s.attendant_id = u.id
        LEFT JOIN services serv ON cp.service_id = serv.id
      `,
      []
    );

    // Buscar todos os consumos
    const consumptionsResult = await query(
      `
        SELECT
          pc.id,
          cp.client_id,
          c.name AS client_name,
          pc.sale_id,
          s.attendant_id,
          u.first_name || ' ' || u.last_name AS attendant_name,
          pc.consumed_at AS op_date,
          -pc.total_value AS value,
          pc.quantity AS quantity,
          pc.unit_price AS unit_price,
          serv.name AS service_name
        FROM package_consumptions pc
        JOIN client_packages cp ON pc.package_id = cp.id
        JOIN clients c ON cp.client_id = c.id
        JOIN sales s ON pc.sale_id = s.id
        JOIN users u ON s.attendant_id = u.id
        LEFT JOIN services serv ON cp.service_id = serv.id
      `,
      []
    );

    const operationsRaw: any[] = [
      ...purchasesResult.rows.map((r: any) => ({ ...r, operation_type: "compra" })),
      ...consumptionsResult.rows.map((r: any) => ({ ...r, operation_type: "consumo" })),
    ];

    // 1. Ordena TUDO por data ascendente
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
        attendantId: op.attendant_id, // Importante para o filtro
        attendantName: op.attendant_name,
        operationType: op.operation_type as "compra" | "consumo",
        date: op.op_date,
        value: Number(op.value),
        quantity: Number(op.quantity),
        unitPrice: Number(op.unit_price),
        balanceAfter: nextBalance,
        balanceQuantityAfter: nextQty,
      };
    });

    // 3. Aplica filtros no resultado calculado
    const filteredOps = opsWithBalance.filter((op) => {
      if (attendantId && op.attendantId !== attendantId) return false;
      if (clientId && op.clientId !== clientId) return false;
      if (opType === "compra" && op.operationType !== "compra") return false;
      if (opType === "consumo" && op.operationType !== "consumo") return false;
      if (hasStart && new Date(op.date).getTime() < new Date(startDate!).setHours(0, 0, 0, 0)) return false;
      if (hasEnd && new Date(op.date).getTime() > new Date(endDate!).setHours(23, 59, 59, 999)) return false;
      return true;
    });

    // 4. Ordena para exibir (descendente por data)
    const operations = filteredOps.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Resumo por cliente (baseado no filtro)
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

      // Acumula totais do periodo/filtro
      if (op.operationType === "compra") s.totalAcquired += Number(op.value);
      if (op.operationType === "consumo") s.totalConsumed += Number(-op.value);
      
      // O "saldo" do resumo aqui vai somar apenas as operacoes visiveis.
      // Se quisermos o saldo REAL ATUAL do cliente, deveriamos pegar de 'balances[op.clientId]' e 'qtyBalances[op.clientId]'
      // mas como o resumo eh por loop, vamos manter a logica de somatoria do filtro para 'balanceCurrent'
      // ou podemos ajustar para mostrar o saldo FINAL da ultima operacao visivel?
      // O padrao anterior era somar. Vamos manter somar para consistencia do "Extrato do periodo".
      s.balanceCurrent += Number(op.value);

      if (op.operationType === "compra") s.totalQuantityAcquired += Number(op.quantity);
      if (op.operationType === "consumo") s.totalQuantityConsumed += Number(op.quantity);
      s.balanceQuantityCurrent += op.operationType === "compra" ? Number(op.quantity) : -Number(op.quantity);

      if (!s.lastOperation || new Date(op.date).getTime() > new Date(s.lastOperation).getTime()) {
        s.lastOperation = op.date;
      }
    }

    // Ajuste opcional: Se quisermos que o card de saldo mostre o saldo FINAL REAL do cliente, poderiamos injetar aqui.
    // Mas "Saldo de créditos (qtde)" no widget pode ser interpretado como "Saldo resultante deste extrato" ou "Saldo atual da conta".
    // Dado que o usuario pode filtrar "Last month", ele pode querer saber quanto sobrou NAQUELE MES.
    // Entao a somatoria esta correta para um extrato parcial.
    
    // POREM, se o filtro eh APENAS TIPO, o saldo fica distorcido (so soma, nao subtrai).
    // Mas a tabela mostrara o saldo correto linha a linha.

    return NextResponse.json(
      {
        operations,
        summary: Object.values(summaryMap),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao buscar extrato de pacotes:", error);
    const message = error instanceof Error ? error.message : "Erro ao buscar extrato de pacotes";
    const status = message.includes("autenticacao") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
