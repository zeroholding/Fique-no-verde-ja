import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import * as XLSX from "xlsx";

type SaleRow = {
  cliente: string;
  servico: string;
  tipo_venda: string;
  quantidade: number;
  forma_pagamento: string;
  desconto_tipo?: string;
  desconto_valor?: number;
  observacoes?: string;
};

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Token de autenticacao ausente ou invalido" },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const decoded = await verifyToken(token);

    if (!decoded || typeof decoded === "string") {
      return NextResponse.json(
        { error: "Token invalido ou expirado" },
        { status: 401 }
      );
    }

    const userId = (decoded as any).userId;

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo foi enviado" },
        { status: 400 }
      );
    }

    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      return NextResponse.json(
        { error: "O arquivo deve estar no formato .xlsx ou .xls" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      return NextResponse.json(
        { error: "O arquivo Excel nao possui planilhas" },
        { status: 400 }
      );
    }

    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<SaleRow>(worksheet, {
      defval: null,
      raw: false,
    });

    if (data.length === 0) {
      return NextResponse.json(
        { error: "O arquivo Excel esta vazio" },
        { status: 400 }
      );
    }

    let importedCount = 0;
    const errors: string[] = [];

    const normalize = (value: unknown) =>
      value === undefined || value === null ? "" : value.toString().trim();

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2; // linha 1 cabecalho

      let saleId: string | null = null;
      try {
        const missingFields = [];
        if (!row.cliente) missingFields.push("cliente");
        if (!row.servico) missingFields.push("servico");
        if (!row.tipo_venda) missingFields.push("tipo_venda");
        if (row.quantidade === null || row.quantidade === undefined) missingFields.push("quantidade");
        if (!row.forma_pagamento) missingFields.push("forma_pagamento");

        if (missingFields.length > 0) {
          errors.push(
            `Linha ${rowNumber}: Campos obrigatorios ausentes: ${missingFields.join(", ")}`
          );
          continue;
        }

        const tipoRaw = normalize(row.tipo_venda);
        const tipoNumeric = parseInt(tipoRaw, 10);
        const tipoVenda = !Number.isNaN(tipoNumeric)
          ? tipoNumeric.toString().padStart(2, "0")
          : tipoRaw;

        if (!["01", "02"].includes(tipoVenda)) {
          errors.push(`Linha ${rowNumber}: Tipo de venda deve ser 1 ou 2`);
          continue;
        }

        const formasPagamento = ["dinheiro", "pix", "cartao_credito", "cartao_debito", "boleto"];
        const formaPagamento = normalize(row.forma_pagamento).toLowerCase();
        if (!formasPagamento.includes(formaPagamento)) {
          errors.push(
            `Linha ${rowNumber}: Forma de pagamento invalida. Use: ${formasPagamento.join(", ")}`
          );
          continue;
        }

        const quantidade = parseFloat(row.quantidade.toString());
        if (Number.isNaN(quantidade) || quantidade <= 0) {
          errors.push(`Linha ${rowNumber}: Quantidade invalida`);
          continue;
        }

        // Cliente
        const clientResult = await query(
          "SELECT id FROM clients WHERE LOWER(name) = LOWER($1) LIMIT 1",
          [normalize(row.cliente)]
        );

        if (clientResult.rows.length === 0) {
          errors.push(`Linha ${rowNumber}: Cliente "${row.cliente}" nao encontrado`);
          continue;
        }

        const clientId = clientResult.rows[0].id;

        // Servico
        const serviceResult = await query(
          "SELECT id, name, base_price FROM services WHERE LOWER(name) = LOWER($1) AND is_active = true LIMIT 1",
          [normalize(row.servico)]
        );

        if (serviceResult.rows.length === 0) {
          errors.push(`Linha ${rowNumber}: Servico "${row.servico}" nao encontrado ou inativo`);
          continue;
        }

        const service = serviceResult.rows[0];

        // Faixa de preco: se nao achar ou falhar, usa 0 para nao bloquear o import
        let unitPrice = Number(service.base_price ?? 0);
        try {
          const priceRangesResult = await query(
            `SELECT unit_price
             FROM service_price_ranges
             WHERE service_id = $1
               AND sale_type = $2
               AND $3 >= min_quantity
               AND ($3 <= max_quantity OR max_quantity IS NULL)
             ORDER BY effective_from DESC
             LIMIT 1`,
            [service.id, tipoVenda, quantidade]
          );

          if (priceRangesResult.rows.length > 0) {
            unitPrice = parseFloat(priceRangesResult.rows[0].unit_price);
          }
        } catch (err) {
          console.warn(
            `Falha ao buscar faixa de preco (linha ${rowNumber}); usando base_price`,
            err
          );
        }

        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          unitPrice = 0;
        }

        const subtotal = unitPrice * quantidade;

        let discountType = "percentage";
        let discountValue = 0;
        let discountAmount = 0;

        if (row.desconto_tipo && row.desconto_valor) {
          discountType = normalize(row.desconto_tipo).toLowerCase();
          discountValue = parseFloat(row.desconto_valor.toString());

          if (discountType === "percentage") {
            discountAmount = subtotal * (discountValue / 100);
          } else if (discountType === "fixed") {
            discountAmount = discountValue;
          } else {
            discountType = "percentage";
            discountValue = 0;
          }
        }

        const total = Math.max(0, subtotal - discountAmount);

        const saleResult = await query(
          `INSERT INTO sales (
            client_id, attendant_id, sale_date, observations, status,
            payment_method, general_discount_type, general_discount_value,
            subtotal, total_discount, total, commission_amount
          ) VALUES ($1, $2, NOW(), $3, 'aberta', $4, $5, $6, $7, $8, $9, 0)
          RETURNING id`,
          [
            clientId,
            userId,
            normalize(row.observacoes) || null,
            formaPagamento,
            discountType,
            discountValue,
            subtotal,
            discountAmount,
            total,
          ]
        );

        saleId = saleResult.rows[0].id;

        await query(
          `INSERT INTO sale_items (
            sale_id, product_id, product_name, quantity, unit_price,
            discount_type, discount_value, subtotal, discount_amount, total
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            saleId,
            null,
            service.name,
            quantidade,
            unitPrice,
            discountType,
            discountValue,
            subtotal,
            discountAmount,
            total,
          ]
        );

        importedCount++;
      } catch (error: any) {
        console.error(`Erro ao processar linha ${rowNumber}:`, error);
        // Se criou a venda mas falhou no item, tenta remover para evitar res��duos
        if (saleId) {
          try {
            await query("DELETE FROM sale_items WHERE sale_id = $1", [saleId]);
            await query("DELETE FROM sales WHERE id = $1", [saleId]);
          } catch (cleanupErr) {
            console.warn("Falha ao limpar venda com erro", cleanupErr);
          }
        }

        const message =
          error?.message ||
          (typeof error === "string" ? error : "Erro desconhecido");
        const code = error?.code ? ` (code ${error.code})` : "";
        errors.push(`Linha ${rowNumber}: Erro ao processar - ${message}${code}`);
      }
    }

    if (importedCount === 0 && errors.length > 0) {
      return NextResponse.json(
        {
          error: "Nenhuma venda foi importada. Verifique os erros abaixo:",
          details: errors.slice(0, 10),
          totalErrors: errors.length,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      imported: importedCount,
      total: data.length,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      totalErrors: errors.length,
    });
  } catch (error) {
    console.error("Erro ao importar vendas:", error);
    return NextResponse.json(
      {
        error: "Erro ao importar vendas",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}
