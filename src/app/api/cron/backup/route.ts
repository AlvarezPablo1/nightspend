import { timingSafeEqual } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { settings, users } from "@/db/schema";
import { buildWorkbook } from "@/lib/export";
import { addMonths, currentMonth } from "@/lib/format";
import { sendMail } from "@/lib/mail";
import { PLACEHOLDER_OWNER_EMAIL } from "@/lib/owner-claim";
import { ensureRecurringIncomes } from "@/lib/recurring-incomes";
import { getSummary, summaryText } from "@/lib/reports";

const MONTHLY_KEY = "last_monthly_report";
const YEARLY_KEY = "last_yearly_report";

type Result = "enviado" | "ya enviado" | "sin datos" | "error";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * A quién le llega el resumen. Mientras el dueño de los datos de antes no entró por
 * primera vez, su cuenta tiene un email provisorio: el resumen sigue yendo a BACKUP_EMAIL.
 */
function recipient(email: string) {
  if (email === PLACEHOLDER_OWNER_EMAIL) return process.env.BACKUP_EMAIL || null;
  return email.endsWith(".invalid") ? null : email;
}

async function sendReport(userId: number, to: string, period: string, key: string): Promise<Result> {
  const [sent] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, key)));
  if (sent?.value === period) return "ya enviado";

  const summary = await getSummary(userId, period);
  // Una cuenta sin movimientos en ese período no recibe un resumen vacío.
  if (summary.spent === 0 && summary.earned === 0) return "sin datos";

  const isYear = period.length === 4;
  const workbook = await buildWorkbook(userId, period);
  const mail = await sendMail({
    to,
    subject: isYear ? `Resumen anual ${period} · Nightspend` : `Resumen de ${summary.label} · Nightspend`,
    text: summaryText(summary),
    attachments: [
      {
        filename: isYear ? `nightspend-anual-${period}.xlsx` : `nightspend-${period}.xlsx`,
        content: Buffer.from(workbook).toString("base64"),
      },
    ],
  });
  if (!mail.ok) return "error";
  await db
    .insert(settings)
    .values({ userId, key, value: period })
    .onConflictDoUpdate({ target: [settings.userId, settings.key], set: { value: period } });
  return "enviado";
}

/**
 * Resumen por mail para cada usuario. Vercel lo llama los días 1, 2 y 3 de cada mes:
 * manda el mes que terminó y, en enero, también el año que terminó. Cada resumen sale
 * una sola vez por usuario, y si uno falla se reintenta al día siguiente sin repetir los demás.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "No autorizado" }, { status: 401 });
  if (!process.env.RESEND_API_KEY) return Response.json({ error: "Falta configurar el envío" }, { status: 500 });

  const previous = addMonths(currentMonth(), -1);
  const periods: [string, string][] = [[previous, MONTHLY_KEY]];
  if (currentMonth().endsWith("-01")) periods.push([previous.slice(0, 4), YEARLY_KEY]);

  const accounts = await db.select({ id: users.id, email: users.email }).from(users).orderBy(asc(users.id));
  const counts: Record<Result, number> = { enviado: 0, "ya enviado": 0, "sin datos": 0, error: 0 };
  for (const account of accounts) {
    const to = recipient(account.email);
    if (!to) continue;
    try {
      await ensureRecurringIncomes(account.id);
      for (const [period, key] of periods) counts[await sendReport(account.id, to, period, key)]++;
    } catch (error) {
      // Un usuario con problemas no frena el resumen de los demás.
      console.error("No se pudo preparar el resumen del usuario", account.id, error);
      counts.error++;
    }
  }

  const status = counts.error > 0 ? "error" : counts.enviado > 0 ? "enviado" : "ya enviado";
  return Response.json({ status, counts }, { status: status === "error" ? 502 : 200 });
}
