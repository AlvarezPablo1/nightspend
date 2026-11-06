import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readSession, SESSION_COOKIE } from "@/lib/session";
import { guestPool } from "./guest-pools";
import * as schema from "./schema";

function createRealPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta la variable DATABASE_URL");
  const pool = new Pool({ connectionString: url, max: 5 });
  pool.on("error", (error) => console.error("Error en la conexión a la base", error));
  return pool;
}

/**
 * Elige la base en cada consulta según la sesión: un invitado siempre va a su propio
 * espacio. Si no se puede leer la sesión dentro de la app, la consulta falla en lugar
 * de ir a la base real. Fuera de la app (scripts) no hay sesión y se usa la base real.
 */
class RoutingPool extends Pool {
  private real?: Pool;

  private realPool() {
    this.real ??= createRealPool();
    return this.real;
  }

  private async target(): Promise<Pool> {
    if (!process.env.NEXT_RUNTIME) return this.realPool();
    const { cookies } = await import("next/headers");
    const store = await cookies();
    const session = await readSession(store.get(SESSION_COOKIE)?.value);
    return session?.role === "guest" ? guestPool(session.guestId) : this.realPool();
  }

  // Drizzle solo usa estas dos operaciones: consultas sueltas y conexiones de transacción.
  override query(...args: unknown[]) {
    return this.target().then((pool) => (pool.query as (...a: unknown[]) => unknown)(...args)) as never;
  }

  override connect(...args: unknown[]) {
    if (args.length > 0) throw new Error("connect con callback no está soportado");
    return this.target().then((pool) => pool.connect()) as never;
  }
}

const globalForDb = globalThis as unknown as { db?: NodePgDatabase<typeof schema> };

export const db = globalForDb.db ?? drizzle(new RoutingPool({ max: 1 }), { schema });
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
