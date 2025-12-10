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
        nome: "Joao da Silva",
        telefone: "(11) 98765-4321",
        email: "joao.silva@example.com",
        cpf_cnpj: "123.456.789-00",
        data_nascimento: "15/03/1985",
        origem: "Indicacao",
      },
      {
        nome: "Maria Oliveira",
        telefone: "(21) 91234-5678",
        email: "maria.oliveira@example.com",
        cpf_cnpj: "987.654.321-00",
        data_nascimento: "22/07/1990",
        origem: "Instagram",
      },
      {
        nome: "Empresa XYZ Ltda",
        telefone: "(11) 3456-7890",
        email: "contato@empresaxyz.com",
        cpf_cnpj: "12.345.678/0001-99",
        data_nascimento: "",
        origem: "Google",
      },
      {
        nome: "Cliente Minimo",
        telefone: "",
        email: "",
        cpf_cnpj: "",
        data_nascimento: "",
        origem: "",
      },
    ];

    // Criar instruções em uma segunda aba
    const instructions = [
      {
        Campo: "nome",
        Descricao: "Nome completo do cliente ou razao social da empresa",
        Obrigatorio: "Sim",
        Exemplo: "Joao da Silva ou Empresa XYZ Ltda",
      },
      {
        Campo: "telefone",
        Descricao: "Telefone de contato (com ou sem formatacao)",
        Obrigatorio: "Nao",
        Exemplo: "(11) 98765-4321 ou 11987654321",
      },
      {
        Campo: "email",
        Descricao: "Email do cliente (deve ser unico)",
        Obrigatorio: "Nao",
        Exemplo: "cliente@example.com",
      },
      {
        Campo: "cpf_cnpj",
        Descricao: "CPF ou CNPJ (com ou sem formatacao, deve ser unico)",
        Obrigatorio: "Nao",
        Exemplo: "123.456.789-00 ou 12.345.678/0001-99",
      },
      {
        Campo: "data_nascimento",
        Descricao: "Data de nascimento no formato DD/MM/AAAA",
        Obrigatorio: "Nao",
        Exemplo: "15/03/1985",
      },
      {
        Campo: "origem",
        Descricao: "Origem do cliente (sera criada se nao existir)",
        Obrigatorio: "Nao",
        Exemplo: "Instagram, Google, Indicacao",
      },
    ];

    // Criar workbook
    const workbook = XLSX.utils.book_new();

    // Adicionar aba com os dados de exemplo
    const worksheet = XLSX.utils.json_to_sheet(templateData);

    // Definir larguras das colunas
    worksheet["!cols"] = [
      { wch: 25 }, // nome
      { wch: 18 }, // telefone
      { wch: 30 }, // email
      { wch: 20 }, // cpf_cnpj
      { wch: 18 }, // data_nascimento
      { wch: 20 }, // origem
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes");

    // Adicionar aba com instruções
    const instructionsSheet = XLSX.utils.json_to_sheet(instructions);
    instructionsSheet["!cols"] = [
      { wch: 20 }, // Campo
      { wch: 50 }, // Descricao
      { wch: 12 }, // Obrigatorio
      { wch: 35 }, // Exemplo
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
        "Content-Disposition":
          'attachment; filename="modelo_importacao_clientes.xlsx"',
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
