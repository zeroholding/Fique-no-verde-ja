import { NextRequest, NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json(
    { success: true, message: "Logout realizado" },
    { status: 200 }
  );

  response.cookies.set("token", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}

export async function GET(request: NextRequest) {
  const url = new URL("/login", request.url);
  const requested = request.nextUrl.searchParams.get("redirect");
  // Preserva apenas destinos internos. Isso permite limpar um JWT inválido sem
  // transformar o logout em redirecionamento aberto.
  if (
    requested &&
    requested.startsWith("/") &&
    !requested.startsWith("//") &&
    !requested.includes("\\")
  ) {
    url.searchParams.set("redirect", requested);
  }
  const response = NextResponse.redirect(url);
  
  response.cookies.set("token", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
