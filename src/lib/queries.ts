import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { lookupRate } from "./dollar";
import { addMonths, currentMonth, daysBetween, daysInMonth, monthRange, today } from "./format";
import { ensureRecurringIncomes } from "./recurring-incomes";

export const activeCategories = (userId: number) =>
  db
    .select()
    .from(s.categories)
    .where(and(eq(s.categories.userId, userId), eq(s.categories.archived, false)))
    .orderBy(asc(s.categories.sortOrder), asc(s.categories.name));

export const activeMethods = (userId: number) =>
  db
    .select()
    .from(s.paymentMethods)
    .where(and(eq(s.paymentMethods.userId, userId), eq(s.paymentMethods.archived, false)))
    .orderBy(asc(s.paymentMethods.id));

/** Últimas descripciones usadas, para autocompletar la carga rápida. */
export async function expenseSuggestions(userId: number) {
  const result = await db.execute<{
    description: string;
    category_id: number;
    payment_method_id: number | null;
  }>(sql`
    select distinct on (lower(description)) description, category_id, payment_method_id
    from expenses
    where user_id = ${userId}
    order by lower(description), date desc, id desc
    limit 500
  `);
  return result.rows.map((r) => ({
    description: r.description,
    categoryId: r.category_id,
    paymentMethodId: r.payment_method_id,
  }));
}

/**
 * Meses que se pueden ver: los que tienen gastos o ingresos, más el mes actual
 * (si no, el primer día de cada mes no habría dónde ver lo que recién se carga).
 */
export async function availableMonths(userId: number) {
  await ensureRecurringIncomes(userId);
  const result = await db.execute<{ month: string }>(sql`
    select to_char(date, 'YYYY-MM') as month from expenses where user_id = ${userId}
    union
    select to_char(date, 'YYYY-MM') as month from incomes where user_id = ${userId}
  `);
  return [...new Set([...result.rows.map((r) => r.month), currentMonth()])].sort();
}

export async function totalForRange(
  userId: number,
  table: typeof s.expenses | typeof s.incomes,
  from: string,
  to: string,
) {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${table.amountArs}), 0)::float8` })
    .from(table)
    .where(and(eq(table.userId, userId), gte(table.date, from), lt(table.date, to)));
  return row.total;
}

export async function byCategory(userId: number, from: string, to: string) {
  return db
    .select({
      id: s.categories.id,
      name: s.categories.name,
      total: sql<number>`coalesce(sum(${s.expenses.amountArs}), 0)::float8`,
    })
    .from(s.expenses)
    .innerJoin(s.categories, eq(s.expenses.categoryId, s.categories.id))
    .where(and(eq(s.expenses.userId, userId), gte(s.expenses.date, from), lt(s.expenses.date, to)))
    .groupBy(s.categories.id)
    .orderBy(desc(sql`sum(${s.expenses.amountArs})`));
}

export async function dailyTotals(userId: number, month: string) {
  const { from, to } = monthRange(month);
  return db
    .select({
      date: s.expenses.date,
      total: sql<number>`sum(${s.expenses.amountArs})::float8`,
    })
    .from(s.expenses)
    .where(and(eq(s.expenses.userId, userId), gte(s.expenses.date, from), lt(s.expenses.date, to)))
    .groupBy(s.expenses.date);
}

export async function monthlyTotals(userId: number, year: string) {
  return db
    .select({
      month: sql<string>`to_char(${s.expenses.date}, 'YYYY-MM')`,
      total: sql<number>`sum(${s.expenses.amountArs})::float8`,
    })
    .from(s.expenses)
    .where(
      and(
        eq(s.expenses.userId, userId),
        gte(s.expenses.date, `${year}-01-01`),
        lt(s.expenses.date, `${Number(year) + 1}-01-01`),
      ),
    )
    .groupBy(sql`1`);
}

export async function expenseList(userId: number, filter: {
  from: string;
  to: string;
  categoryId?: number;
  q?: string;
  limit?: number;
}) {
  const conditions = [eq(s.expenses.userId, userId), gte(s.expenses.date, filter.from), lt(s.expenses.date, filter.to)];
  if (filter.categoryId) conditions.push(eq(s.expenses.categoryId, filter.categoryId));
  if (filter.q) conditions.push(sql`${s.expenses.description} ilike ${`%${filter.q}%`}`);
  return db
    .select({
      id: s.expenses.id,
      date: s.expenses.date,
      description: s.expenses.description,
      amount: s.expenses.amount,
      amountArs: s.expenses.amountArs,
      currency: s.expenses.currency,
      installments: s.expenses.installments,
      note: s.expenses.note,
      category: s.categories.name,
      method: s.paymentMethods.name,
    })
    .from(s.expenses)
    .innerJoin(s.categories, eq(s.expenses.categoryId, s.categories.id))
    .leftJoin(s.paymentMethods, eq(s.expenses.paymentMethodId, s.paymentMethods.id))
    .where(and(...conditions))
    .orderBy(desc(s.expenses.date), desc(s.expenses.id))
    .limit(filter.limit ?? 1000);
}

export const topExpenses = (userId: number, from: string, to: string, limit = 5) =>
  db
    .select({
      id: s.expenses.id,
      date: s.expenses.date,
      description: s.expenses.description,
      amountArs: s.expenses.amountArs,
      category: s.categories.name,
    })
    .from(s.expenses)
    .innerJoin(s.categories, eq(s.expenses.categoryId, s.categories.id))
    .where(and(eq(s.expenses.userId, userId), gte(s.expenses.date, from), lt(s.expenses.date, to)))
    .orderBy(desc(s.expenses.amountArs))
    .limit(limit);

export const periodFor = (frequency: "mensual" | "anual", month: string) =>
  frequency === "anual" ? month.slice(0, 4) : month;

/** Fijos activos con su estado de pago en el período que contiene a `month`. */
export async function recurringStatus(userId: number, month: string) {
  const [rows, payments] = await Promise.all([
    db
      .select({
        recurring: s.recurrings,
        category: s.categories.name,
        method: s.paymentMethods.name,
      })
      .from(s.recurrings)
      .innerJoin(s.categories, eq(s.recurrings.categoryId, s.categories.id))
      .leftJoin(s.paymentMethods, eq(s.recurrings.paymentMethodId, s.paymentMethods.id))
      .where(and(eq(s.recurrings.userId, userId), eq(s.recurrings.active, true)))
      .orderBy(asc(s.recurrings.name)),
    db.select().from(s.recurringPayments).where(eq(s.recurringPayments.userId, userId)),
  ]);
  return rows.map(({ recurring, category, method }) => ({
    ...recurring,
    category,
    method,
    period: periodFor(recurring.frequency, month),
    payment:
      payments.find(
        (p) => p.recurringId === recurring.id && p.period === periodFor(recurring.frequency, month),
      ) ?? null,
  }));
}

export type Plan = Awaited<ReturnType<typeof installmentStatus>>["plans"][number];

/** Calcula cuotas pendientes de cada plan y lo comprometido en los próximos meses. */
export async function installmentStatus(userId: number, monthsAhead = 12) {
  const rows = await db
    .select({ plan: s.installmentPlans, method: s.paymentMethods.name, debtAmount: s.debts.amount })
    .from(s.installmentPlans)
    .leftJoin(s.paymentMethods, eq(s.installmentPlans.paymentMethodId, s.paymentMethods.id))
    .leftJoin(s.debts, eq(s.installmentPlans.debtId, s.debts.id))
    .where(eq(s.installmentPlans.userId, userId));

  const now = currentMonth();
  const schedule = new Map<string, number>();
  for (let i = 0; i < monthsAhead; i++) schedule.set(addMonths(now, i), 0);

  const plans = rows
    .map(({ plan, method, debtAmount }) => {
      const months = Array.from({ length: plan.installments }, (_, i) => addMonths(plan.firstMonth, i));
      const pending = months.filter((m) => m >= now);
      const perInstallment = plan.totalAmount == null ? null : Math.round(plan.totalAmount / plan.installments);
      if (perInstallment != null && plan.currency === "ARS") {
        for (const m of pending) if (schedule.has(m)) schedule.set(m, schedule.get(m)! + perInstallment);
      }
      return {
        ...plan,
        method,
        debtAmount,
        pending: pending.length,
        paid: plan.installments - pending.length,
        perInstallment,
        remaining: perInstallment == null ? null : perInstallment * pending.length,
        lastMonth: months[months.length - 1],
      };
    })
    .sort((a, b) => a.lastMonth.localeCompare(b.lastMonth));

  return {
    plans,
    schedule: [...schedule].map(([month, total]) => ({ month, total })),
  };
}

/** Personas que ya aparecen en Deudas, para sugerirlas al cargar una compra de otro. */
export async function debtPeople(userId: number) {
  const rows = await db
    .selectDistinct({ person: s.debts.person })
    .from(s.debts)
    .where(eq(s.debts.userId, userId))
    .orderBy(asc(s.debts.person));
  return rows.map((r) => r.person);
}

/**
 * Lo que queda del mes: ingresos, menos lo gastado, menos los fijos que faltan pagar,
 * menos las cuotas del mes. El resumen de tarjeta no se resta porque es un recordatorio,
 * y las cuotas de una compra de este mes tampoco, porque ya sumó completa como gasto.
 */
export async function monthAvailability(userId: number) {
  const month = currentMonth();
  const { from, to } = monthRange(month);
  const [spent, earned, recurrings, { plans }, purchases] = await Promise.all([
    totalForRange(userId, s.expenses, from, to),
    totalForRange(userId, s.incomes, from, to),
    recurringStatus(userId, month),
    installmentStatus(userId, 1),
    db
      .select({ id: s.expenses.id })
      .from(s.expenses)
      .where(and(eq(s.expenses.userId, userId), gte(s.expenses.date, from), lt(s.expenses.date, to))),
  ]);
  const purchasedNow = new Set(purchases.map((p) => p.id));

  const pendingFixed = recurrings.filter((r) => r.frequency === "mensual" && !r.payment && r.createsExpense);
  const dueInstallments = plans.filter(
    (p) =>
      p.firstMonth <= month &&
      p.lastMonth >= month &&
      p.perInstallment != null &&
      !(p.expenseId && purchasedNow.has(p.expenseId)),
  );

  const usesDollars = [...pendingFixed, ...dueInstallments].some((item) => item.currency === "USD");
  const rate = usesDollars ? ((await lookupRate(userId, today(), "venta"))?.rate ?? null) : null;
  // Sin cotización esos montos quedan afuera, y la pantalla lo aclara.
  const toPesos = (cents: number, currency: s.Currency) =>
    currency === "ARS" ? cents : rate ? Math.round(cents * rate) : 0;

  const fixed = pendingFixed.reduce((sum, r) => sum + toPesos(r.amount, r.currency), 0);
  const installments = dueInstallments.reduce((sum, p) => sum + toPesos(p.perInstallment!, p.currency), 0);
  return {
    available: earned - spent - fixed - installments,
    spent,
    earned,
    fixed,
    installments,
    incomplete: usesDollars && rate == null,
  };
}

const DUE_WINDOW_DAYS = 5;
const OVERDUE_ANNUAL_DAYS = 30;

/** Pagos sin marcar que vencen en los próximos días, o que ya vencieron en este período. */
export async function dueAlerts(userId: number) {
  const [rows, payments] = await Promise.all([
    db
      .select()
      .from(s.recurrings)
      .where(and(eq(s.recurrings.userId, userId), eq(s.recurrings.active, true))),
    db.select().from(s.recurringPayments).where(eq(s.recurringPayments.userId, userId)),
  ]);
  const now = today();
  const month = now.slice(0, 7);
  const year = Number(now.slice(0, 4));
  const isPaid = (id: number, period: string) => payments.some((p) => p.recurringId === id && p.period === period);
  const dueIn = (m: string, day: number) => `${m}-${String(Math.min(day, daysInMonth(m))).padStart(2, "0")}`;

  const alerts = rows.flatMap((r) => {
    if (!r.dueDay) return [];
    const candidates =
      r.frequency === "mensual"
        ? [
            { period: month, date: dueIn(month, r.dueDay), minDays: -31 },
            { period: addMonths(month, 1), date: dueIn(addMonths(month, 1), r.dueDay), minDays: 0 },
          ]
        : r.dueMonth
          ? [year, year + 1].map((y) => {
              const m = `${y}-${String(r.dueMonth).padStart(2, "0")}`;
              return { period: String(y), date: dueIn(m, r.dueDay!), minDays: -OVERDUE_ANNUAL_DAYS };
            })
          : [];
    return candidates.flatMap((c) => {
      const days = daysBetween(now, c.date);
      if (days > DUE_WINDOW_DAYS || days < c.minDays || isPaid(r.id, c.period)) return [];
      return [{ id: r.id, name: r.name, amount: r.amount, currency: r.currency, frequency: r.frequency, days, period: c.period }];
    });
  });
  return alerts.sort((a, b) => a.days - b.days);
}

export async function debtStatus(userId: number) {
  const [debts, payments] = await Promise.all([
    db.select().from(s.debts).where(eq(s.debts.userId, userId)).orderBy(asc(s.debts.person)),
    db
      .select()
      .from(s.debtPayments)
      .where(eq(s.debtPayments.userId, userId))
      .orderBy(desc(s.debtPayments.date)),
  ]);
  return debts.map((debt) => {
    const list = payments.filter((p) => p.debtId === debt.id);
    const paid = list.reduce((sum, p) => sum + p.amount, 0);
    return { ...debt, payments: list, paid, remaining: Math.max(debt.amount - paid, 0) };
  });
}

export async function incomesFor(userId: number, month: string) {
  const { from, to } = monthRange(month);
  return db
    .select()
    .from(s.incomes)
    .where(and(eq(s.incomes.userId, userId), gte(s.incomes.date, from), lt(s.incomes.date, to)))
    .orderBy(desc(s.incomes.date), desc(s.incomes.id));
}
