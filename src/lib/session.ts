import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "gastos_session";
export const SESSION_DAYS = 30;
export const GUEST_SESSION_HOURS = 24;

export type Session = { role: "owner" } | { role: "guest"; guestId: string };

const GUEST_ID = /^[a-f0-9]{32}$/;
export const isGuestId = (id: unknown): id is string => typeof id === "string" && GUEST_ID.test(id);

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Falta la variable AUTH_SECRET");
  return new TextEncoder().encode(secret);
}

export function signOwnerSession() {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key());
}

export function signGuestSession(guestId: string) {
  return new SignJWT({ guest: guestId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${GUEST_SESSION_HOURS}h`)
    .sign(key());
}

export async function readSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (payload.guest === undefined) return { role: "owner" };
    return isGuestId(payload.guest) ? { role: "guest", guestId: payload.guest } : null;
  } catch {
    return null;
  }
}
