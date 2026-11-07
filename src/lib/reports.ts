import { byCategory, monthlyTotals, totalForRange } from "./queries";
import * as s from "@/db/schema";
import { money, monthName, periodRange } from "./format";

/** Resumen de un mes (YYYY-MM) o de un año (YYYY), en pesos. */
export async function getSummary(period: string) {
  const { from, to } = periodRange(period);
  const isYear = period.length === 4;
  const [spent, earned, categories, months] = await Promise.all([
    totalForRange(s.expenses, from, to),
    totalForRange(s.incomes, from, to),
    byCategory(from, to),
    isYear ? monthlyTotals(period) : Promise.resolve([]),
  ]);
  const sortedMonths = [...months].sort((a, b) => a.month.localeCompare(b.month));
  return {
    label: isYear ? period : monthName(period),
    spent,
    earned,
    balance: earned - spent,
    categories,
    months: sortedMonths,
    average: sortedMonths.length ? Math.round(spent / sortedMonths.length / 100) * 100 : 0,
    highest: [...sortedMonths].sort((a, b) => b.total - a.total)[0] ?? null,
  };
}

export type Summary = Awaited<ReturnType<typeof getSummary>>;

/** El resumen como texto, para el cuerpo del mail. */
export function summaryText(summary: Summary) {
  const lines = [
    `Resumen de ${summary.label}`,
    "",
    `Gastaste: ${money(summary.spent)}`,
    `Ingresos: ${money(summary.earned)}`,
    `Balance: ${money(summary.balance)}`,
  ];
  if (summary.months.length > 0) {
    lines.push(`Promedio mensual: ${money(summary.average)}`);
    if (summary.highest) lines.push(`Mes más alto: ${monthName(summary.highest.month, false)} (${money(summary.highest.total)})`);
    lines.push("", "Por mes:", ...summary.months.map((m) => `- ${monthName(m.month, false)}: ${money(m.total)}`));
  }
  if (summary.categories.length > 0) {
    lines.push("", "Por categoría:", ...summary.categories.map((c) => `- ${c.name}: ${money(c.total)}`));
  }
  lines.push("", "El detalle está en el Excel adjunto.");
  return lines.join("\n");
}
