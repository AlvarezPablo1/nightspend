import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { normalizeEmail, verifyPassword } from "./password";

/** Dueño provisorio que crea la migración 0004 con los datos de antes de los usuarios. */
export const PLACEHOLDER_OWNER_EMAIL = "dueno@nightspend.invalid";

/**
 * Antes de los usuarios había una sola contraseña (APP_PASSWORD_HASH) y el resumen iba a
 * BACKUP_EMAIL. La primera vez que el dueño entra con ese email y esa contraseña, se queda
 * con los datos del dueño provisorio. Las dos variables son secretas en Vercel y no se
 * pueden leer desde afuera: por eso esto pasa dentro de la app y no en un script.
 * Devuelve el id del usuario si lo reclamó.
 */
export async function claimOwnerData(email: string, password: string) {
  const ownerEmail = normalizeEmail(process.env.BACKUP_EMAIL ?? "");
  const hash = process.env.APP_PASSWORD_HASH;
  if (!ownerEmail || !hash || email !== ownerEmail) return null;
  if (!(await verifyPassword(password, hash))) return null;

  const [claimed] = await db
    .update(users)
    .set({ email, passwordHash: hash, passwordChangedAt: new Date() })
    .where(eq(users.email, PLACEHOLDER_OWNER_EMAIL))
    .returning({ id: users.id });
  return claimed?.id ?? null;
}

/** Mientras el dueño no reclamó sus datos, nadie más puede registrarse con su email. */
export async function isUnclaimedOwnerEmail(email: string) {
  if (email !== normalizeEmail(process.env.BACKUP_EMAIL ?? "")) return false;
  const [placeholder] = await db.select({ id: users.id }).from(users).where(eq(users.email, PLACEHOLDER_OWNER_EMAIL));
  return !!placeholder;
}
