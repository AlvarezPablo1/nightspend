import { and, count, eq, gte, lt } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { authAttempts } from "@/db/schema";

export type AttemptKind = "login-email" | "login-ip" | "register-ip" | "reset-email" | "reset-ip";

/** Límites por tipo: cuántos intentos se permiten dentro de la ventana. */
const LIMITS: Record<AttemptKind, { max: number; minutes: number }> = {
  "login-email": { max: 5, minutes: 15 },
  "login-ip": { max: 20, minutes: 15 },
  "register-ip": { max: 5, minutes: 60 },
  "reset-email": { max: 3, minutes: 60 },
  "reset-ip": { max: 10, minutes: 60 },
};

const windowStart = (kind: AttemptKind) => new Date(Date.now() - LIMITS[kind].minutes * 60_000);

/** En Vercel la IP real llega primera en x-forwarded-for. */
export async function clientIp() {
  const list = (await headers()).get("x-forwarded-for");
  return list?.split(",")[0]?.trim() || "local";
}

export async function isLimited(kind: AttemptKind, key: string) {
  const [row] = await db
    .select({ n: count() })
    .from(authAttempts)
    .where(and(eq(authAttempts.kind, kind), eq(authAttempts.key, key), gte(authAttempts.at, windowStart(kind))));
  return (row?.n ?? 0) >= LIMITS[kind].max;
}

export async function recordAttempt(kind: AttemptKind, key: string) {
  await db.insert(authAttempts).values({ kind, key });
  // Limpieza de paso: lo de más de un día ya no cuenta para ningún límite.
  await db.delete(authAttempts).where(lt(authAttempts.at, new Date(Date.now() - 86_400_000)));
}

export async function clearAttempts(kind: AttemptKind, key: string) {
  await db.delete(authAttempts).where(and(eq(authAttempts.kind, kind), eq(authAttempts.key, key)));
}
