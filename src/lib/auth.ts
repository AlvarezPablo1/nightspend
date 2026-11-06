import { scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { guestExists } from "./guest";
import { readSession, SESSION_COOKIE } from "./session";

export function checkPassword(password: string) {
  const stored = process.env.APP_PASSWORD_HASH;
  if (!stored) throw new Error("Falta la variable APP_PASSWORD_HASH");
  const [salt, hash] = stored.split(":");
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}

export async function currentSession() {
  const store = await cookies();
  return readSession(store.get(SESSION_COOKIE)?.value);
}

export async function requireSession() {
  const session = await currentSession();
  if (!session) redirect("/login");
  // El espacio del invitado pudo haber vencido: se borra la cookie y vuelve al inicio.
  if (session.role === "guest" && !(await guestExists(session.guestId))) redirect("/api/salir");
  return session;
}
