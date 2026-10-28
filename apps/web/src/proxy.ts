import { NextResponse, type NextRequest } from "next/server";
// o cookie é um token opaco: aqui só se confere a presença; a API valida a sessão e o perfil em cada página
const SESSION_COOKIE = "docdo_session";

const isProd = process.env.NODE_ENV === "production";

/**
 * CSP com nonce por requisição: só roda script com o nonce desta resposta ('strict-dynamic' libera os que ele carregar).
 * O Next lê o nonce deste cabeçalho e o aplica aos próprios scripts. Em dev fica desligado (o HMR usa eval).
 */
function contentSecurityPolicy(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' blob:",
    "worker-src 'self' blob:",
    "frame-src https://www.youtube-nocookie.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if ((pathname.startsWith("/painel") || pathname.startsWith("/admin")) && !req.cookies.get(SESSION_COOKIE)) {
    const url = new URL("/entrar", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (!isProd) return NextResponse.next();
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  // páginas apenas: arquivos estáticos e rotas de API não precisam de CSP de documento
  matcher: [{ source: "/((?!api|_next/static|_next/image|brand|favicon.ico).*)", missing: [{ type: "header", key: "next-router-prefetch" }] }],
};
