import { and, eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { incomes, recurringIncomes } from "@/db/schema";
import { lookupRate } from "./dollar";
import { addMonths, currentMonth, daysInMonth, today } from "./format";

/** Fecha de cobro de un mes: si el mes no tiene ese día, usa el último (31 → 30 de septiembre). */
export function payDate(month: string, payDay: number) {
  return `${month}-${String(Math.min(payDay, daysInMonth(month))).padStart(2, "0")}`;
}

/**
 * Registra los cobros de los trabajos fijos que ya llegaron a su fecha, incluidos los
 * de meses en los que no se abrió la app. El puntero `nextMonth` avanza una sola vez
 * por mes: dos cargas simultáneas no duplican, y un ingreso borrado a mano no vuelve.
 * Se ejecuta como máximo una vez por pedido. Devuelve los trabajos que quedaron pendientes.
 */
export const ensureRecurringIncomes = cache(async (userId: number) => {
  const jobs = await db
    .select()
    .from(recurringIncomes)
    .where(and(eq(recurringIncomes.userId, userId), eq(recurringIncomes.active, true)));
  const now = currentMonth();
  const todayDate = today();
  const failed: string[] = [];

  for (const job of jobs) {
    let month = job.nextMonth;
    while (month <= now) {
      const date = payDate(month, job.payDay);
      if (date > todayDate) break;

      let rate: string | null = null;
      let amountArs = job.amount;
      if (job.currency === "USD") {
        const quote = await lookupRate(userId, date, "compra");
        // Sin cotización no se inventa un monto: se reintenta en la próxima visita.
        if (!quote) {
          failed.push(job.name);
          break;
        }
        rate = String(quote.rate);
        amountArs = Math.round(job.amount * quote.rate);
      }

      const next = addMonths(month, 1);
      await db.transaction(async (tx) => {
        const advanced = await tx
          .update(recurringIncomes)
          .set({ nextMonth: next })
          .where(and(eq(recurringIncomes.id, job.id), eq(recurringIncomes.nextMonth, month)))
          .returning({ id: recurringIncomes.id });
        if (advanced.length === 0) return;
        await tx
          .insert(incomes)
          .values({
            userId,
            date,
            description: job.name,
            type: "fijo",
            amount: job.amount,
            currency: job.currency,
            rate,
            amountArs,
            recurringIncomeId: job.id,
            period: month,
          })
          .onConflictDoNothing();
      });
      month = next;
    }
  }
  return { failed };
});
