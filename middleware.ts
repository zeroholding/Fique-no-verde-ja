import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rotas públicas que não precisam de autenticação
  const publicPaths = ['/', '/login', '/api/auth/signin', '/api/auth/signup'];
  const isPublicPath = publicPaths.some(path => pathname === path || pathname.startsWith('/api/auth'));

  // Rotas que precisam de autenticação
  const protectedPaths = ['/dashboard'];
  const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path));

  // Pega o token do cookie
  const token = request.cookies.get('token')?.value;

  // Se for rota protegida e não tiver token, redireciona para login
  if (isProtectedPath && !token) {
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Se estiver logado e tentar acessar login/cadastro, redireciona para dashboard
  if ((pathname === '/login' || pathname === '/') && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  const response = NextResponse.next();

  // Adicionar header para pular tela de aviso do ngrok
  response.headers.set('ngrok-skip-browser-warning', 'true');

  return response;
}

// Aplicar middleware a rotas específicas
export const config = {
  matcher: ['/', '/login', '/dashboard/:path*', '/api/:path*'],
};
