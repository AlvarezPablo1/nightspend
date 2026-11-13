import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/session";

/** Pantallas que se usan sin sesión. Con sesión, mandan al inicio. */
const AUTH_PAGES = new Set(["/login", "/registro", "/recuperar", "/restablecer"]);

export async function proxy(request: NextRequest) {
  // El backup mensual no tiene sesión: se autentica con su propio secreto.
  if (request.nextUrl.pathname === "/api/cron/backup") return NextResponse.next();

  const valid = !!(await readSession(request.cookies.get(SESSION_COOKIE)?.value));
  const isAuthPage = AUTH_PAGES.has(request.nextUrl.pathname);

  if (!valid && !isAuthPage) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (valid && isAuthPage) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|manifest.webmanifest|icon|apple-icon|favicon.ico).*)"],
};
