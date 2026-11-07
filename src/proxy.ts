import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/session";

export async function proxy(request: NextRequest) {
  // El backup mensual no tiene sesión: se autentica con su propio secreto.
  if (request.nextUrl.pathname === "/api/cron/backup") return NextResponse.next();

  const valid = !!(await readSession(request.cookies.get(SESSION_COOKIE)?.value));
  const isLogin = request.nextUrl.pathname === "/login";

  if (!valid && !isLogin) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (valid && isLogin) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|manifest.webmanifest|icon|apple-icon|favicon.ico).*)"],
};
