import { byCategory, monthlyTotals, totalForRange } from "./queries";
import * as s from "@/db/schema";
import { changeFrom, comparisonRange, money, monthName, periodRange } from "./format";

/** Resumen de un mes (YYYY-MM) o de un año (YYYY), en pesos. */
export async function getSummary(userId: number, period: string) {
  const { from, to } = periodRange(period);
  const isYear = period.length === 4;
  const comparison = isYear ? null : comparisonRange(period);
  const [spent, earned, categories, months, previousCategories] = await Promise.all([
    totalForRange(userId, s.expenses, from, to),
    totalForRange(userId, s.incomes, from, to),
    byCategory(userId, from, to),
    isYear ? monthlyTotals(userId, period) : Promise.resolve([]),
    comparison ? byCategory(userId, comparison.from, comparison.to) : Promise.resolve([]),
  ]);
  const sortedMonths = [...months].sort((a, b) => a.month.localeCompare(b.month));
  return {
    label: isYear ? period : monthName(period),
    spent,
    earned,
    balance: earned - spent,
    categories,
    previousCategories,
    previousLabel: comparison ? monthName(comparison.previous, false) : null,
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
    const hasPrevious = summary.previousCategories.length > 0;
    const describe = (c: { id: number; total: number }) => {
      if (!hasPrevious) return "";
      const change = changeFrom(c.total, summary.previousCategories.find((p) => p.id === c.id)?.total ?? 0);
      if (!change || change.direction === "new") return ` (sin gastos en ${summary.previousLabel})`;
      if (change.direction === "same") return " (igual)";
      return ` (${change.direction === "up" ? "subió" : "bajó"} ${change.percent}%)`;
    };
    lines.push(
      "",
      hasPrevious ? `Por categoría, comparado con ${summary.previousLabel}:` : "Por categoría:",
      ...summary.categories.map((c) => `- ${c.name}: ${money(c.total)}${describe(c)}`),
    );
  }
  lines.push("", "El detalle está en el Excel adjunto.");
  return lines.join("\n");
}
