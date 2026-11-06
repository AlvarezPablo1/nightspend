import { and, desc, eq, gte, lt, type SQL } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { addMonths, isMonth, monthRange, today } from "@/lib/format";
import { availableMonths } from "@/lib/queries";
import { ensureRecurringIncomes } from "@/lib/recurring-incomes";

const pesos = (cents: number | null) => (cents == null ? null : cents / 100);

/** Evita que Excel interprete como fórmula un texto que empieza con = + - @. */
const safe = (value: string | null) => (value && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

async function expenseRows(where?: SQL) {
  const rows = await db
    .select({
      date: s.expenses.date,
      description: s.expenses.description,
      category: s.categories.name,
      method: s.paymentMethods.name,
      amount: s.expenses.amount,
      currency: s.expenses.currency,
      rate: s.expenses.rate,
      amountArs: s.expenses.amountArs,
      installments: s.expenses.installments,
      note: s.expenses.note,
    })
    .from(s.expenses)
    .innerJoin(s.categories, eq(s.expenses.categoryId, s.categories.id))
    .leftJoin(s.paymentMethods, eq(s.expenses.paymentMethodId, s.paymentMethods.id))
    .where(where)
    .orderBy(desc(s.expenses.date), desc(s.expenses.id));
  return rows.map((r) => [
    r.date,
    safe(r.description),
    r.category,
    r.method,
    pesos(r.amount),
    r.currency,
    r.rate ? Number(r.rate) : null,
    pesos(r.amountArs),
    r.installments,
    safe(r.note),
  ]);
}

const EXPENSE_HEADER = [
  "Fecha", "Descripción", "Categoría", "Medio de pago", "Monto", "Moneda",
  "Cotización", "Monto en pesos", "Cuotas", "Nota",
];

function addSheet(wb: ExcelJS.Workbook, name: string, header: string[], rows: unknown[][]) {
  const ws = wb.addWorksheet(name);
  ws.addRow(header).font = { bold: true };
  ws.addRows(rows);
  ws.columns.forEach((c) => (c.width = 20));
}

export async function GET(request: Request, { params }: { params: Promise<{ format: string }> }) {
  await requireSession();
  const { format } = await params;
  if (format !== "csv" && format !== "excel") return new Response("No encontrado", { status: 404 });

  // Hay que indicar qué descargar: un mes con datos o "todos".
  const mes = new URL(request.url).searchParams.get("mes");
  const all = mes === "todos";
  if (!all && !isMonth(mes)) return new Response("Indicá el mes a descargar", { status: 400 });
  await ensureRecurringIncomes();
  if (!all && !(await availableMonths()).includes(mes!)) return new Response("Ese mes no tiene datos", { status: 404 });

  const range = all ? null : monthRange(mes!);
  const expenseFilter = range ? and(gte(s.expenses.date, range.from), lt(s.expenses.date, range.to)) : undefined;
  const incomeFilter = range ? and(gte(s.incomes.date, range.from), lt(s.incomes.date, range.to)) : undefined;
  const stamp = all ? `todos-${today()}` : mes;

  if (format === "csv") {
    const rows = await expenseRows(expenseFilter);
    const csv = [EXPENSE_HEADER, ...rows]
      .map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    return new Response("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gastos-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const [incomes, plans] = await Promise.all([
    db.select().from(s.incomes).where(incomeFilter).orderBy(desc(s.incomes.date)),
    db
      .select({ plan: s.installmentPlans, method: s.paymentMethods.name })
      .from(s.installmentPlans)
      .leftJoin(s.paymentMethods, eq(s.installmentPlans.paymentMethodId, s.paymentMethods.id)),
  ]);

  const wb = new ExcelJS.Workbook();
  addSheet(wb, "Gastos", EXPENSE_HEADER, await expenseRows(expenseFilter));
  addSheet(wb, "Ingresos", ["Fecha", "De dónde viene", "Tipo", "Monto", "Moneda", "Monto en pesos", "Nota"],
    incomes.map((i) => [i.date, safe(i.description), i.type, pesos(i.amount), i.currency, pesos(i.amountArs), safe(i.note)]));

  if (!all) {
    // Solo las cuotas que caen en este mes.
    const rows = plans.flatMap(({ plan, method }) => {
      const number = Array.from({ length: plan.installments }, (_, i) => addMonths(plan.firstMonth, i)).indexOf(mes!) + 1;
      if (number === 0) return [];
      const perInstallment = plan.totalAmount == null ? null : Math.round(plan.totalAmount / plan.installments);
      return [[safe(plan.description), method, `${number} de ${plan.installments}`, pesos(perInstallment) ?? "Sin monto", plan.currency, safe(plan.otherPerson) ?? "Yo"]];
    });
    addSheet(wb, "Cuotas", ["Descripción", "Medio de pago", "Cuota", "Monto de la cuota", "Moneda", "La paga"], rows);
  } else {
    const [jobs, recurrings, debts, debtPayments, wish, steps] = await Promise.all([
      db.select().from(s.recurringIncomes),
      db.select().from(s.recurrings),
      db.select().from(s.debts),
      db.select().from(s.debtPayments),
      db.select().from(s.wishItems),
      db.select().from(s.wishSteps),
    ]);
    addSheet(wb, "Trabajos fijos", ["De dónde viene", "Monto", "Moneda", "Día de cobro", "Próximo mes", "Activo"],
      jobs.map((j) => [safe(j.name), pesos(j.amount), j.currency, j.payDay, j.nextMonth, j.active ? "sí" : "no"]));
    addSheet(wb, "Fijos", ["Nombre", "Frecuencia", "Monto", "Moneda", "Día", "Mes", "Aclaración", "Suma como gasto", "Activo"],
      recurrings.map((r) => [safe(r.name), r.frequency, pesos(r.amount), r.currency, r.dueDay, r.dueMonth, safe(r.dueNote), r.createsExpense ? "sí" : "no", r.active ? "sí" : "no"]));
    addSheet(wb, "Cuotas", ["Descripción", "Medio de pago", "Monto total", "Moneda", "Cuotas", "Primera cuota", "La paga", "Nota"],
      plans.map(({ plan: p, method }) => [safe(p.description), method, pesos(p.totalAmount), p.currency, p.installments, p.firstMonth, safe(p.otherPerson) ?? "Yo", safe(p.note)]));
    addSheet(wb, "Deudas", ["Tipo", "Persona", "Concepto", "Monto", "Moneda", "Pagado"],
      debts.map((d) => [
        d.direction === "debo" ? "Debo" : "Me deben",
        safe(d.person),
        safe(d.concept),
        pesos(d.amount),
        d.currency,
        pesos(debtPayments.filter((p) => p.debtId === d.id).reduce((sum, p) => sum + p.amount, 0)),
      ]));
    addSheet(wb, "Wishlist", ["Nombre", "Precio estimado", "Moneda", "Ahorrado", "Prioridad", "Link", "Comprado", "Pasos"],
      wish.map((w) => [
        safe(w.name),
        pesos(w.estimatedPrice),
        w.currency,
        pesos(w.saved),
        w.priority,
        w.link,
        w.purchasedOn,
        steps.filter((st) => st.itemId === w.id).map((st) => `${st.done ? "[x]" : "[ ]"} ${st.text}`).join("\n"),
      ]));
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="gastos-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
