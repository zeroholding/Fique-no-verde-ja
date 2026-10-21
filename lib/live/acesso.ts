// lib/live/acesso.ts
//
// Quem pode ver o painel ao vivo: só administrador ativo. A sessão é a mesma
// do sistema (cookie `token`, JWT assinado com JWT_SECRET); a permissão vem
// da tabela `users`, e não só do token, para valer na hora quando alguém deixa
// de ser administrador.
//
// O banco é lido pelo pool direto (e não pelo `query` de lib/db.ts), porque o
// `query` compartilha o cliente de transação entre requisições.

import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

import { pool } from "@/lib/db";

const SEGREDO = new TextEncoder().encode(process.env.JWT_SECRET || "your-secret-key-change-this");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SessaoDoPainel = {
  usuarioId: string;
  /** O que o token diz. Só é usado se o banco estiver fora do ar. */
  adminNoToken: boolean;
  /** Fim da sessão (epoch ms), quando o token informa. */
  expiraEm: number | null;
};

/** Valida o token. Assinatura errada, token vencido ou sem usuário: null. */
export async function lerSessao(token: string | null | undefined): Promise<SessaoDoPainel | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SEGREDO);
    const usuarioId = typeof payload.userId === "string" ? payload.userId : "";
    if (!UUID.test(usuarioId)) return null;
    return {
      usuarioId,
      adminNoToken: payload.isAdmin === true,
      expiraEm: typeof payload.exp === "number" ? payload.exp * 1000 : null,
    };
  } catch {
    return null;
  }
}

export type Permissao = "admin" | "negado" | "indisponivel";

/** Administrador ativo? `indisponivel` quando o banco não respondeu. */
export async function conferirAdmin(usuarioId: string): Promise<Permissao> {
  try {
    const resultado = await pool.query<{ is_admin: boolean | null; is_active: boolean | null }>(
      "SELECT is_admin, is_active FROM users WHERE id = $1",
      [usuarioId],
    );
    const usuario = resultado.rows[0];
    if (!usuario || usuario.is_active === false || usuario.is_admin !== true) return "negado";
    return "admin";
  } catch (erro) {
    console.error("[LIVE] Não foi possível conferir a permissão do usuário:", erro);
    return "indisponivel";
  }
}

/** Cookie da sessão; aceita também `Authorization: Bearer`, como o resto da API. */
export function tokenDaRequisicao(request: NextRequest): string | null {
  const cookie = request.cookies.get("token")?.value;
  if (cookie) return cookie;
  const cabecalho = request.headers.get("authorization");
  return cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : null;
}

export type Autorizacao =
  | { ok: true; sessao: SessaoDoPainel }
  | { ok: false; status: 401 | 403 | 503; codigo: string; mensagem: string };

/** Porta das rotas /api/live: 401 sem sessão, 403 sem permissão, 503 banco fora. */
export async function autorizarPainel(request: NextRequest): Promise<Autorizacao> {
  const sessao = await lerSessao(tokenDaRequisicao(request));
  if (!sessao) {
    return { ok: false, status: 401, codigo: "sem_sessao", mensagem: "Entre de novo para ver o painel ao vivo." };
  }

  const permissao = await conferirAdmin(sessao.usuarioId);
  if (permissao === "negado") {
    return { ok: false, status: 403, codigo: "sem_permissao", mensagem: "O painel ao vivo é só para administradores." };
  }
  if (permissao === "indisponivel") {
    return { ok: false, status: 503, codigo: "banco_indisponivel", mensagem: "O banco de dados não respondeu. Tentando de novo." };
  }
  return { ok: true, sessao };
}
