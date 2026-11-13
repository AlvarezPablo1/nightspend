import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { addDays, today } from "./format";

export const DOLLAR_TYPES = {
  blue: "Blue",
  oficial: "Oficial",
  bolsa: "MEP (bolsa)",
  cripto: "Cripto",
  tarjeta: "Tarjeta",
} as const;

export type DollarType = keyof typeof DOLLAR_TYPES;
export const DEFAULT_DOLLAR_TYPE: DollarType = "blue";

/** Un gasto compra dólares (venta) y un ingreso los vende (compra). */
export type RateSide = "compra" | "venta";

export type RateResult = { rate: number; date: string; type: DollarType; label: string };

const TODAY_URL = "https://dolarapi.com/v1/dolares";
const HISTORY_URL = "https://api.argentinadatos.com/v1/cotizaciones/dolares";
// Tiempo máximo de toda la búsqueda, no de cada pedido: si se pasa, se ofrece cargarla a mano.
const TIMEOUT_MS = 5000;
// Fines de semana y feriados pueden no tener cotización: se usa la última anterior.
const MAX_DAYS_BACK = 6;

const quote = z.object({ compra: z.number().positive(), venta: z.number().positive() });

async function getJson(url: string, signal: AbortSignal) {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) return null;
  return response.json();
}

/** Que el servicio no responda es esperable: se avisa en la pantalla, no es un error de la app. */
function warnUnavailable(error: unknown) {
  console.warn("Cotización del dólar no disponible:", error instanceof Error ? error.message : error);
}

export function isDollarType(value: unknown): value is DollarType {
  return typeof value === "string" && value in DOLLAR_TYPES;
}

export async function getDollarType(): Promise<DollarType> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "dollar_type"));
  return isDollarType(row?.value) ? row.value : DEFAULT_DOLLAR_TYPE;
}

/** Cotización de la fecha pedida. Devuelve null si el servicio no responde. */
export async function lookupRate(date: string, side: RateSide): Promise<RateResult | null> {
  const type = await getDollarType();
  const result = (rate: number, usedDate: string) => ({
    rate,
    date: usedDate,
    type,
    label: DOLLAR_TYPES[type],
  });

  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    if (date >= today()) {
      const parsed = quote.safeParse(await getJson(`${TODAY_URL}/${type}`, signal));
      return parsed.success ? result(parsed.data[side], today()) : null;
    }
    for (let back = 0; back <= MAX_DAYS_BACK; back++) {
      const candidate = addDays(date, -back);
      const parsed = quote.safeParse(await getJson(`${HISTORY_URL}/${type}/${candidate.replaceAll("-", "/")}`, signal));
      if (parsed.success) return result(parsed.data[side], candidate);
    }
    return null;
  } catch (error) {
    warnUnavailable(error);
    return null;
  }
}

/** Cotizaciones de hoy para mostrar en Ajustes. Si el servicio no responde, devuelve vacío. */
export async function todayRates(): Promise<Partial<Record<DollarType, number>>> {
  try {
    const parsed = z
      .array(quote.extend({ casa: z.string() }))
      .safeParse(await getJson(TODAY_URL, AbortSignal.timeout(TIMEOUT_MS)));
    if (!parsed.success) return {};
    return Object.fromEntries(parsed.data.map((q) => [q.casa, q.venta]));
  } catch (error) {
    warnUnavailable(error);
    return {};
  }
}
