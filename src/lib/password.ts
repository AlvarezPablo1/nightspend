import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, length: number) => Promise<Buffer>;

export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;
const KEY_LENGTH = 64;

/** Formato "sal:hash" en base64url: el mismo que genera `npm run hash-password`. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}

// Si el email no existe se compara igual contra este hash: así la respuesta tarda lo mismo
// y no delata qué emails tienen cuenta.
const DUMMY_HASH = `${Buffer.alloc(16).toString("base64url")}:${Buffer.alloc(KEY_LENGTH).toString("base64url")}`;
export const verifyAgainstNothing = (password: string) => verifyPassword(password, DUMMY_HASH);

/** Devuelve el motivo si la contraseña no sirve. */
export function passwordProblem(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) return `La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres`;
  if (password.length > MAX_PASSWORD_LENGTH) return "La contraseña es demasiado larga";
  return null;
}

export function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}
