import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Roteamento de acesso.
 *
 * Sao duas areas autenticadas com portas de entrada diferentes, mas a MESMA
 * sessao: o cookie `token` vale nas duas.
 *   /dashboard  -> login em /login          (sistema completo, tema escuro)
 *   /tracken    -> login em /tracken/login  (painel TRACKen, tema claro)
 *
 * Aqui so se confere a EXISTENCIA do cookie. A validacao da assinatura fica
 * nos layouts server-side e em cada route handler, porque middleware nao e
 * lugar de decisao final de autorizacao.
 */

const TRACKEN_LOGIN = '/tracken/login';
const FNVJ_LOGIN = '/login';

/**
 * Rotas de /tracken que NAO exigem sessao.
 *
 * A documentacao da API e publica de proposito: o dev da TRACKen precisa ler o
 * contrato antes de ter qualquer credencial, e criar login para ele so para ver
 * a documentacao seria atrito sem ganho. A pagina nao expoe token, chave nem
 * dado de atendimento -- so o formato das chamadas.
 */
const TRACKEN_PUBLIC_PATHS = new Set([TRACKEN_LOGIN, '/tracken/docapi']);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('token')?.value;

  const isTrackenLogin = pathname === TRACKEN_LOGIN;
  const isTrackenPublic = TRACKEN_PUBLIC_PATHS.has(pathname);
  const isTrackenArea =
    !isTrackenPublic && (pathname === '/tracken' || pathname.startsWith('/tracken/'));
  const isDashboardArea = pathname.startsWith('/dashboard');

  // Ja autenticado nao precisa ver tela de login.
  if (isTrackenLogin && token) {
    return NextResponse.redirect(new URL('/tracken', request.url));
  }

  // Cada area manda para a sua propria porta, preservando o destino.
  if (isTrackenArea && !token) {
    const url = new URL(TRACKEN_LOGIN, request.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  if (isDashboardArea && !token) {
    const url = new URL(FNVJ_LOGIN, request.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  if ((pathname === FNVJ_LOGIN || pathname === '/') && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('ngrok-skip-browser-warning', 'true');
  // Os layouts server-side leem este header para devolver o usuario ao destino
  // original depois do login (o Next nao expoe o pathname a um layout).
  requestHeaders.set('x-pathname', pathname);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Adicionar header para pular tela de aviso do ngrok
  response.headers.set('ngrok-skip-browser-warning', 'true');

  return response;
}

// Aplicar middleware a rotas específicas
export const config = {
  matcher: [
    '/',
    '/login',
    '/dashboard/:path*',
    '/tracken/:path*',
    '/api/((?!evidences).)*',
  ],
};
