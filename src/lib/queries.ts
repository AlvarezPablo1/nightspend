import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { addMonths, currentMonth, monthRange } from "./format";
import { ensureRecurringIncomes } from "./recurring-incomes";

export const activeCategories = () =>
  db
    .select()
    .from(s.categories)
    .where(eq(s.categories.archived, false))
    .orderBy(asc(s.categories.sortOrder), asc(s.categories.name));

export const activeMethods = () =>
  db
    .select()
    .from(s.paymentMethods)
    .where(eq(s.paymentMethods.archived, false))
    .orderBy(asc(s.paymentMethods.id));

/** Últimas descripciones usadas, para autocompletar la carga rápida. */
export async function expenseSuggestions() {
  const result = await db.execute<{
    description: string;
    category_id: number;
    payment_method_id: number | null;
  }>(sql`
    select distinct on (lower(description)) description, category_id, payment_method_id
    from expenses
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
export async function availableMonths() {
  await ensureRecurringIncomes();
  const result = await db.execute<{ month: string }>(sql`
    select to_char(date, 'YYYY-MM') as month from expenses
    union
    select to_char(date, 'YYYY-MM') as month from incomes
  `);
  return [...new Set([...result.rows.map((r) => r.month), currentMonth()])].sort();
}

export async function totalForRange(table: typeof s.expenses | typeof s.incomes, from: string, to: string) {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${table.amountArs}), 0)::float8` })
    .from(table)
    .where(and(gte(table.date, from), lt(table.date, to)));
  return row.total;
}

export async function byCategory(from: string, to: string) {
  return db
    .select({
      id: s.categories.id,
      name: s.categories.name,
      total: sql<number>`coalesce(sum(${s.expenses.amountArs}), 0)::float8`,
    })
    .from(s.expenses)
    .innerJoin(s.categories, eq(s.expenses.categoryId, s.categories.id))
    .where(and(gte(s.expenses.date, from), lt(s.expenses.date, to)))
    .groupBy(s.categories.id)
    .orderBy(desc(sql`sum(${s.expenses.amountArs})`));
}

export async function dailyTotals(month: string) {
  const { from, to } = monthRange(month);
  return db
    .select({
      date: s.expenses.date,
      total: sql<number>`sum(${s.expenses.amountArs})::float8`,
    })
    .from(s.expenses)
    .where(and(gte(s.expenses.date, from), lt(s.expenses.date, to)))
    .groupBy(s.expenses.date);
}

export async function monthlyTotals(year: string) {
  return db
    .select({
      month: sql<string>`to_char(${s.expenses.date}, 'YYYY-MM')`,
      total: sql<number>`sum(${s.expenses.amountArs})::float8`,
    })
    .from(s.expenses)
    .where(and(gte(s.expenses.date, `${year}-01-01`), lt(s.expenses.date, `${Number(year) + 1}-01-01`)))
    .groupBy(sql`1`);
}

export async function expenseList(filter: {
  from: string;
  to: string;
  categoryId?: number;
  q?: string;
  limit?: number;
}) {
  const conditions = [gte(s.expenses.date, filter.from), lt(s.expenses.date, filter.to)];
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

export const topExpenses = (from: string, to: string, limit = 5) =>
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
    .where(and(gte(s.expenses.date, from), lt(s.expenses.date, to)))
    .orderBy(desc(s.expenses.amountArs))
    .limit(limit);

export const periodFor = (frequency: "mensual" | "anual", month: string) =>
  frequency === "anual" ? month.slice(0, 4) : month;

/** Fijos activos con su estado de pago en el período que contiene a `month`. */
export async function recurringStatus(month: string) {
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
      .where(eq(s.recurrings.active, true))
      .orderBy(asc(s.recurrings.name)),
    db.select().from(s.recurringPayments),
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
export async function installmentStatus(monthsAhead = 12) {
  const rows = await db
    .select({ plan: s.installmentPlans, method: s.paymentMethods.name, debtAmount: s.debts.amount })
    .from(s.installmentPlans)
    .leftJoin(s.paymentMethods, eq(s.installmentPlans.paymentMethodId, s.paymentMethods.id))
    .leftJoin(s.debts, eq(s.installmentPlans.debtId, s.debts.id));

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
export async function debtPeople() {
  const rows = await db.selectDistinct({ person: s.debts.person }).from(s.debts).orderBy(asc(s.debts.person));
  return rows.map((r) => r.person);
}

export async function debtStatus() {
  const [debts, payments] = await Promise.all([
    db.select().from(s.debts).orderBy(asc(s.debts.person)),
    db.select().from(s.debtPayments).orderBy(desc(s.debtPayments.date)),
  ]);
  return debts.map((debt) => {
    const list = payments.filter((p) => p.debtId === debt.id);
    const paid = list.reduce((sum, p) => sum + p.amount, 0);
    return { ...debt, payments: list, paid, remaining: Math.max(debt.amount - paid, 0) };
  });
}

export async function incomesFor(month: string) {
  const { from, to } = monthRange(month);
  return db
    .select()
    .from(s.incomes)
    .where(and(gte(s.incomes.date, from), lt(s.incomes.date, to)))
    .orderBy(desc(s.incomes.date), desc(s.incomes.id));
}
