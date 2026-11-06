import { lookupRate } from "@/lib/dollar";
import { isDate } from "@/lib/format";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("fecha");
  const side = searchParams.get("lado");
  if (!isDate(date) || (side !== "compra" && side !== "venta")) {
    return Response.json({ error: "Parámetros inválidos" }, { status: 400 });
  }
  const result = await lookupRate(date, side);
  if (!result) return Response.json({ error: "Cotización no disponible" }, { status: 503 });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
