import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import * as XLSX from "xlsx";

export async function GET(request: NextRequest) {
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

    // Criar dados de exemplo para o modelo
    const templateData = [
      {
        cliente: "Exemplo - Nome do Cliente Exato",
        servico: "Exemplo - Nome do Servico Exato",
        tipo_venda: "01",
        quantidade: 10,
        forma_pagamento: "pix",
        desconto_tipo: "percentage",
        desconto_valor: 5,
        observacoes: "Venda com 5% de desconto",
      },
      {
        cliente: "Exemplo - Outro Cliente",
        servico: "Exemplo - Outro Servico",
        tipo_venda: "02",
        quantidade: 50,
        forma_pagamento: "dinheiro",
        desconto_tipo: "fixed",
        desconto_valor: 100,
        observacoes: "Pacote com desconto de R$ 100,00",
      },
      {
        cliente: "Exemplo - Cliente 3",
        servico: "Exemplo - Servico 3",
        tipo_venda: "01",
        quantidade: 1,
        forma_pagamento: "cartao_credito",
        desconto_tipo: "",
        desconto_valor: 0,
        observacoes: "",
      },
    ];

    // Criar instruções em uma segunda aba
    const instructions = [
      {
        Campo: "cliente",
        Descricao: "Nome exato do cliente cadastrado no sistema",
        Obrigatorio: "Sim",
        Exemplo: "Joao Silva",
      },
      {
        Campo: "servico",
        Descricao: "Nome exato do servico cadastrado no sistema",
        Obrigatorio: "Sim",
        Exemplo: "Reclamacao",
      },
      {
        Campo: "tipo_venda",
        Descricao: "Tipo de venda: 01 (Comum) ou 02 (Pacote)",
        Obrigatorio: "Sim",
        Exemplo: "01",
      },
      {
        Campo: "quantidade",
        Descricao: "Quantidade de itens vendidos",
        Obrigatorio: "Sim",
        Exemplo: "10",
      },
      {
        Campo: "forma_pagamento",
        Descricao: "Forma de pagamento: dinheiro, pix, cartao_credito, cartao_debito, boleto",
        Obrigatorio: "Sim",
        Exemplo: "pix",
      },
      {
        Campo: "desconto_tipo",
        Descricao: "Tipo de desconto: percentage (%) ou fixed (R$)",
        Obrigatorio: "Nao",
        Exemplo: "percentage",
      },
      {
        Campo: "desconto_valor",
        Descricao: "Valor do desconto (numero)",
        Obrigatorio: "Nao",
        Exemplo: "10",
      },
      {
        Campo: "observacoes",
        Descricao: "Observacoes sobre a venda (opcional)",
        Obrigatorio: "Nao",
        Exemplo: "Cliente preferencial",
      },
    ];

    // Criar workbook
    const workbook = XLSX.utils.book_new();

    // Adicionar aba com os dados de exemplo
    const worksheet = XLSX.utils.json_to_sheet(templateData);

    // Definir larguras das colunas
    worksheet["!cols"] = [
      { wch: 20 }, // cliente
      { wch: 20 }, // servico
      { wch: 12 }, // tipo_venda
      { wch: 12 }, // quantidade
      { wch: 18 }, // forma_pagamento
      { wch: 15 }, // desconto_tipo
      { wch: 15 }, // desconto_valor
      { wch: 30 }, // observacoes
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, "Vendas");

    // Adicionar aba com instruções
    const instructionsSheet = XLSX.utils.json_to_sheet(instructions);
    instructionsSheet["!cols"] = [
      { wch: 20 }, // Campo
      { wch: 50 }, // Descricao
      { wch: 12 }, // Obrigatorio
      { wch: 20 }, // Exemplo
    ];

    XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instrucoes");

    // Gerar o arquivo Excel
    const excelBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    // Retornar o arquivo como resposta
    return new NextResponse(excelBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="modelo_importacao_vendas.xlsx"',
      },
    });
  } catch (error) {
    console.error("Erro ao gerar modelo:", error);
    return NextResponse.json(
      {
        error: "Erro ao gerar modelo",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}
