import { Pool } from "pg";
import { isGuestId } from "@/lib/session";

/**
 * Los invitados nunca se conectan a la base real: usan otra base (DEMO_DATABASE_URL)
 * y cada uno tiene su propio schema. Tiene que ser una conexión directa, porque los
 * poolers en modo transacción ignoran el search_path de inicio.
 */
const MAX_OPEN_POOLS = 20;
const pools = new Map<string, Promise<Pool>>();

export function demoUrl() {
  // Neon entrega dos direcciones: el modo invitado necesita la directa.
  const demo = process.env.DEMO_DATABASE_URL_UNPOOLED ?? process.env.DEMO_DATABASE_URL;
  if (!demo) return null;
  const target = new URL(demo);
  const sameAsReal = [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED].some((candidate) => {
    if (!candidate) return false;
    const real = new URL(candidate);
    return real.hostname === target.hostname && real.pathname === target.pathname;
  });
  if (sameAsReal) {
    console.error("DEMO_DATABASE_URL apunta a la base real: el modo invitado queda desactivado.");
    return null;
  }
  return demo;
}

export const guestSchema = (guestId: string) => {
  if (!isGuestId(guestId)) throw new Error("Invitado inválido");
  return `guest_${guestId}`;
};

async function open(guestId: string) {
  const url = demoUrl();
  if (!url) throw new Error("El modo invitado no está configurado");
  const schema = guestSchema(guestId);
  const pool = new Pool({
    connectionString: url,
    max: 2,
    idleTimeoutMillis: 10_000,
    options: `-c search_path=${schema}`,
  });
  pool.on("error", (error) => console.error("Error en la conexión de invitado", error));
  // Si el schema no quedó activo se corta acá: es preferible un error a mezclar datos.
  const { rows } = await pool.query<{ schema: string | null }>("select current_schema() as schema");
  if (rows[0]?.schema !== schema) {
    await pool.end();
    throw new Error("El espacio del invitado no está disponible");
  }
  return pool;
}

export function guestPool(guestId: string) {
  const existing = pools.get(guestId);
  if (existing) {
    // Queda como el más reciente para que se cierren primero los que no se usan.
    pools.delete(guestId);
    pools.set(guestId, existing);
    return existing;
  }
  if (pools.size >= MAX_OPEN_POOLS) {
    const oldest = pools.keys().next().value;
    if (oldest) closeGuestPool(oldest);
  }
  const created = open(guestId);
  pools.set(guestId, created);
  created.catch(() => pools.delete(guestId));
  return created;
}

export function closeGuestPool(guestId: string) {
  const pool = pools.get(guestId);
  pools.delete(guestId);
  return pool?.then((p) => p.end()).catch(() => undefined);
}
