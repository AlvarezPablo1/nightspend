import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/** Cierra una sesión de invitado que ya no tiene espacio: evita un bucle entre login e inicio. */
export async function GET(request: Request) {
  (await cookies()).delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL("/login", request.url));
}
