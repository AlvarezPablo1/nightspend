import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { buildWorkbook } from "@/lib/export";
import { currentMonth, monthName, today } from "@/lib/format";
import { ensureRecurringIncomes } from "@/lib/recurring-incomes";

const SENT_KEY = "last_backup_month";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * Backup mensual por mail. Vercel lo llama los días 1, 2 y 3: si el envío ya salió ese
 * mes no hace nada, y si falló se reintenta solo al día siguiente.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "No autorizado" }, { status: 401 });

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.BACKUP_EMAIL;
  if (!apiKey || !to) return Response.json({ error: "Falta configurar el envío" }, { status: 500 });

  const month = currentMonth();
  const [sent] = await db.select().from(settings).where(eq(settings.key, SENT_KEY));
  if (sent?.value === month) return Response.json({ status: "ya enviado", month });

  await ensureRecurringIncomes();
  const workbook = await buildWorkbook(null);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      from: process.env.BACKUP_FROM ?? "Nightspend <onboarding@resend.dev>",
      to: [to],
      subject: `Backup de Nightspend · ${monthName(month)}`,
      text: `Adjunto está el backup completo de Nightspend al ${today()}: gastos, ingresos, fijos, cuotas, deudas y wishlist.`,
      attachments: [
        {
          filename: `nightspend-backup-${today()}.xlsx`,
          content: Buffer.from(workbook).toString("base64"),
        },
      ],
    }),
  });
  if (!response.ok) {
    console.error("No se pudo enviar el backup", response.status, await response.text());
    return Response.json({ error: "No se pudo enviar" }, { status: 502 });
  }

  await db
    .insert(settings)
    .values({ key: SENT_KEY, value: month })
    .onConflictDoUpdate({ target: settings.key, set: { value: month } });
  return Response.json({ status: "enviado", month });
}
