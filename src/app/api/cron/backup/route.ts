import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { buildWorkbook } from "@/lib/export";
import { addMonths, currentMonth } from "@/lib/format";
import { ensureRecurringIncomes } from "@/lib/recurring-incomes";
import { getSummary, summaryText } from "@/lib/reports";

const MONTHLY_KEY = "last_monthly_report";
const YEARLY_KEY = "last_yearly_report";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function sendReport(period: string, key: string, apiKey: string, to: string) {
  const [sent] = await db.select().from(settings).where(eq(settings.key, key));
  if (sent?.value === period) return "ya enviado";

  const isYear = period.length === 4;
  const summary = await getSummary(period);
  const workbook = await buildWorkbook(period);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      from: process.env.BACKUP_FROM ?? "Nightspend <onboarding@resend.dev>",
      to: [to],
      subject: isYear ? `Resumen anual ${period} · Nightspend` : `Resumen de ${summary.label} · Nightspend`,
      text: summaryText(summary),
      attachments: [
        {
          filename: isYear ? `nightspend-anual-${period}.xlsx` : `nightspend-${period}.xlsx`,
          content: Buffer.from(workbook).toString("base64"),
        },
      ],
    }),
  });
  if (!response.ok) {
    console.error("No se pudo enviar el resumen", period, response.status, await response.text());
    return "error";
  }
  await db
    .insert(settings)
    .values({ key, value: period })
    .onConflictDoUpdate({ target: settings.key, set: { value: period } });
  return "enviado";
}

/**
 * Resumen por mail. Vercel lo llama los días 1, 2 y 3 de cada mes: manda el mes que
 * terminó y, en enero, también el año que terminó. Cada uno sale una sola vez, y si
 * uno falla se reintenta solo al día siguiente sin repetir el otro.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "No autorizado" }, { status: 401 });

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.BACKUP_EMAIL;
  if (!apiKey || !to) return Response.json({ error: "Falta configurar el envío" }, { status: 500 });

  await ensureRecurringIncomes();
  const previous = addMonths(currentMonth(), -1);
  const results: Record<string, string> = {
    [previous]: await sendReport(previous, MONTHLY_KEY, apiKey, to),
  };
  if (currentMonth().endsWith("-01")) {
    const year = previous.slice(0, 4);
    results[year] = await sendReport(year, YEARLY_KEY, apiKey, to);
  }

  const values = Object.values(results);
  const status = values.includes("error") ? "error" : values.includes("enviado") ? "enviado" : "ya enviado";
  return Response.json({ status, results }, { status: status === "error" ? 502 : 200 });
}
