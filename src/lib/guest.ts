import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { closeGuestPool, demoUrl, guestSchema } from "@/db/guest-pools";
import { seedGuest } from "./demo-seed";
import { GUEST_SESSION_HOURS } from "./session";

const MAX_ACTIVE_GUESTS = 30;
const MAX_NEW_GUESTS_PER_WINDOW = 30;
const WINDOW_MINUTES = 10;

export class GuestLimitError extends Error {}

export const guestModeEnabled = () => !!demoUrl();

// Conexión de administración: crea y borra espacios. Solo ve la base de demostración.
let admin: Pool | undefined;
function adminPool() {
  const url = demoUrl();
  if (!url) throw new Error("El modo invitado no está configurado");
  if (!admin) {
    admin = new Pool({ connectionString: url, max: 2, idleTimeoutMillis: 10_000 });
    admin.on("error", (error) => console.error("Error en la conexión de demostración", error));
  }
  return admin;
}

/** Las mismas migraciones de la app, aplicadas dentro del schema del invitado. */
function migrationStatements(schema: string) {
  const dir = path.join(process.cwd(), "drizzle");
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .flatMap((file) => readFileSync(path.join(dir, file), "utf8").split("--> statement-breakpoint"))
    .map((statement) => statement.replaceAll('"public".', `"${schema}".`).trim())
    .filter(Boolean);
}

async function dropGuest(pool: Pool, id: string) {
  await closeGuestPool(id);
  await pool.query(`drop schema if exists "${guestSchema(id)}" cascade`);
  await pool.query("delete from guest_sessions where id = $1", [id]);
}

/** Crea un espacio nuevo con datos ficticios y devuelve su identificador. */
export async function createGuest() {
  const pool = adminPool();
  await pool.query(
    "create table if not exists guest_sessions (id text primary key, created_at timestamptz not null default now())",
  );

  const expired = await pool.query<{ id: string }>(
    `select id from guest_sessions where created_at < now() - make_interval(hours => $1)`,
    [GUEST_SESSION_HOURS],
  );
  for (const { id } of expired.rows) await dropGuest(pool, id);

  const recent = await pool.query<{ count: number }>(
    `select count(*)::int as count from guest_sessions where created_at > now() - make_interval(mins => $1)`,
    [WINDOW_MINUTES],
  );
  if (recent.rows[0].count >= MAX_NEW_GUESTS_PER_WINDOW) {
    throw new GuestLimitError("Hay muchos invitados en este momento. Probá de nuevo en unos minutos.");
  }

  const active = await pool.query<{ id: string }>("select id from guest_sessions order by created_at");
  const excess = active.rows.length - MAX_ACTIVE_GUESTS + 1;
  for (const { id } of active.rows.slice(0, Math.max(excess, 0))) await dropGuest(pool, id);

  const id = randomBytes(16).toString("hex");
  const schema = guestSchema(id);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`create schema "${schema}"`);
    await client.query(`set local search_path to "${schema}"`);
    for (const statement of migrationStatements(schema)) await client.query(statement);
    await client.query("insert into public.guest_sessions (id) values ($1)", [id]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  try {
    await seedGuest(id);
  } catch (error) {
    await dropGuest(pool, id);
    throw error;
  }
  return id;
}

export async function destroyGuest(id: string) {
  await dropGuest(adminPool(), id);
}

export async function guestExists(id: string) {
  const { rows } = await adminPool().query("select 1 from guest_sessions where id = $1", [id]);
  return rows.length > 0;
}
