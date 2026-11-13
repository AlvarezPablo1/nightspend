import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { guestExists } from "./guest";
import { GUEST_USER_ID, readSession, SESSION_COOKIE, type Session } from "./session";

export async function currentSession() {
  const store = await cookies();
  return readSession(store.get(SESSION_COOKIE)?.value);
}

/** La cuenta sigue existiendo y la sesión es posterior al último cambio de contraseña. */
async function userSessionIsValid(session: Extract<Session, { role: "user" }>) {
  const [user] = await db
    .select({ changedAt: users.passwordChangedAt })
    .from(users)
    .where(eq(users.id, session.userId));
  return !!user && Math.floor(user.changedAt.getTime() / 1000) <= session.issuedAt;
}

/** Se calcula una vez por pedido, aunque la pidan el layout, la página y varias consultas. */
export const requireSession = cache(async () => {
  const session = await currentSession();
  if (!session) redirect("/login");
  // El espacio del invitado pudo haber vencido, o la sesión del usuario quedó vieja:
  // se borra la cookie y vuelve al login.
  if (session.role === "guest" && !(await guestExists(session.guestId))) redirect("/api/salir");
  if (session.role === "user" && !(await userSessionIsValid(session))) redirect("/api/salir");
  return session;
});

/** Dueño de los datos de este pedido. Todas las consultas filtran por este id. */
export async function currentUserId() {
  const session = await requireSession();
  return session.role === "guest" ? GUEST_USER_ID : session.userId;
}
