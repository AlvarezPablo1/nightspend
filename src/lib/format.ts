import type { Currency } from "@/db/schema";

export const TZ = "America/Argentina/Buenos_Aires";

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Muestra centavos como "$ 12.500" o "US$ 20,50". */
export function money(cents: number, currency: Currency = "ARS") {
  const value = Math.abs(cents) / 100;
  const text = value.toLocaleString("es-AR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${cents < 0 ? "−" : ""}${currency === "USD" ? "US$" : "$"} ${text}`;
}

/** Versión corta para ejes: "$ 1,2 M", "$ 450 mil". */
export function moneyShort(cents: number) {
  const value = cents / 100;
  if (value >= 1_000_000) {
    return `$ ${(value / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M`;
  }
  if (value >= 1_000) return `$ ${Math.round(value / 1_000)} mil`;
  return `$ ${Math.round(value)}`;
}

/** Interpreta "12.500", "12500", "1.500,50" o "1500.50". Devuelve centavos o null. */
export function parseMoney(input: unknown): number | null {
  if (typeof input !== "string") return null;
  let text = input.replace(/[^\d.,]/g, "");
  if (!text) return null;
  if (text.includes(",")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (/\.\d{3}(\.|$)/.test(text)) {
    text = text.replace(/\./g, "");
  }
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Centavos a texto editable en un input: "12500" o "12500,50". */
export function moneyInput(cents: number | null | undefined) {
  if (cents == null) return "";
  return (cents / 100).toLocaleString("es-AR", { useGrouping: false, maximumFractionDigits: 2 });
}

export function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

export const currentMonth = () => today().slice(0, 7);

export function addMonths(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function addDays(date: string, delta: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

export function monthRange(month: string) {
  return { from: `${month}-01`, to: `${addMonths(month, 1)}-01` };
}

export function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthName(month: string, withYear = true) {
  const [y, m] = month.split("-").map(Number);
  return withYear ? `${MONTHS[m - 1]} ${y}` : MONTHS[m - 1];
}

export const monthShort = (m: number) => MONTHS[m - 1].slice(0, 3);

export function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-AR", {
    weekday: "long",
    timeZone: "UTC",
  });
  return `${weekday} ${d}`;
}

export function shortDate(date: string) {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${monthShort(m)}`;
}

export const yearsOf = (months: string[]) => [...new Set(months.map((m) => m.slice(0, 4)))];

export const isMonth = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export const isYear = (v: unknown): v is string => typeof v === "string" && /^\d{4}$/.test(v);

export function isDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
}
