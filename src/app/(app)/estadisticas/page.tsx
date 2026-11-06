import { redirect } from "next/navigation";
import { BarChart, type Bar } from "@/components/bar-chart";
import { Empty, MonthNav, PageTitle, Progress, SectionTitle, Stat, Tabs, YearNav } from "@/components/ui";
import { expenses } from "@/db/schema";
import {
  addMonths,
  currentMonth,
  daysInMonth,
  isMonth,
  isYear,
  money,
  monthName,
  monthRange,
  monthShort,
  shortDate,
  today,
  yearsOf,
} from "@/lib/format";
import { availableMonths, byCategory, dailyTotals, monthlyTotals, topExpenses, totalForRange } from "@/lib/queries";

const wholePesos = (cents: number) => Math.round(cents / 100) * 100;

function CategoryBars({ rows, total }: { rows: { id: number; name: string; total: number }[]; total: number }) {
  if (rows.length === 0) return <Empty>Sin datos.</Empty>;
  const max = rows[0].total;
  return (
    <div className="space-y-3.5">
      {rows.map((c) => (
        <div key={c.id}>
          <div className="mb-1.5 flex justify-between gap-3 text-sm">
            <span>{c.name}</span>
            <span className="num text-muted">
              {money(c.total)} · {c.total / total < 0.01 ? "<1" : Math.round((c.total / total) * 100)}%
            </span>
          </div>
          <Progress value={c.total / max} />
        </div>
      ))}
    </div>
  );
}

function TopList({ rows }: { rows: Awaited<ReturnType<typeof topExpenses>> }) {
  if (rows.length === 0) return <Empty>Sin datos.</Empty>;
  return (
    <>
      {rows.map((e) => (
        <div key={e.id} className="row">
          <div className="min-w-0">
            <p className="truncate">{e.description}</p>
            <p className="text-xs text-muted">
              {shortDate(e.date)} · {e.category}
            </p>
          </div>
          <span className="num shrink-0">{money(e.amountArs)}</span>
        </div>
      ))}
    </>
  );
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; anio?: string }>;
}) {
  const [params, months] = await Promise.all([searchParams, availableMonths()]);
  const years = yearsOf(months);
  if (params.anio && !years.includes(params.anio)) redirect("/estadisticas");
  if (params.mes && !months.includes(params.mes)) redirect("/estadisticas");

  const tabs = (active: "mes" | "anio") => (
    <Tabs
      tabs={[
        { href: "/estadisticas", label: "Mes", active: active === "mes" },
        { href: `/estadisticas?anio=${currentMonth().slice(0, 4)}`, label: "Año", active: active === "anio" },
      ]}
    />
  );

  if (isYear(params.anio)) {
    const year = params.anio;
    const from = `${year}-01-01`;
    const to = `${Number(year) + 1}-01-01`;
    const [totals, categories, top] = await Promise.all([
      monthlyTotals(year),
      byCategory(from, to),
      topExpenses(from, to),
    ]);
    const total = totals.reduce((sum, m) => sum + m.total, 0);
    const average = totals.length ? total / totals.length : 0;
    const highest = [...totals].sort((a, b) => b.total - a.total)[0];
    // Solo los meses disponibles: nada de meses futuros ni anteriores al primer registro.
    const bars: Bar[] = months
      .filter((month) => month.startsWith(year))
      .map((month) => ({
        key: month,
        label: monthName(month, false),
        tooltip: monthName(month),
        value: totals.find((m) => m.month === month)?.total ?? 0,
        axisLabel: monthShort(Number(month.slice(5))).replace(/^./, (c) => c.toUpperCase()),
      }));

    return (
      <>
        <PageTitle title="Estadísticas" />
        {tabs("anio")}
        <YearNav year={year} years={years} href={(y) => `/estadisticas?anio=${y}`} />
        <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="col-span-2 md:col-span-1">
            <Stat label="Total del año" value={money(total)} />
          </div>
          <Stat label="Promedio mensual" value={money(wholePesos(average))} hint={`${totals.length} meses con datos`} />
          <Stat
            label="Mes más alto"
            value={highest ? money(highest.total) : "—"}
            hint={highest ? monthName(highest.month, false) : undefined}
          />
        </div>
        <SectionTitle>Gasto por mes</SectionTitle>
        <div className="card">
          <BarChart bars={bars} summary="Tocá una barra para ver el monto" />
        </div>
        <SectionTitle>Por categoría</SectionTitle>
        <div className="card">
          <CategoryBars rows={categories} total={total} />
        </div>
        <SectionTitle>Gastos más grandes</SectionTitle>
        <div className="card py-1">
          <TopList rows={top} />
        </div>
      </>
    );
  }

  const month = isMonth(params.mes) ? params.mes : currentMonth();
  const { from, to } = monthRange(month);
  const previous = addMonths(month, -1);
  const prevRange = monthRange(previous);
  const [daily, categories, top, prevTotal] = await Promise.all([
    dailyTotals(month),
    byCategory(from, to),
    topExpenses(from, to),
    totalForRange(expenses, prevRange.from, prevRange.to),
  ]);
  const total = daily.reduce((sum, d) => sum + d.total, 0);

  // En el mes actual el promedio se calcula sobre los días transcurridos.
  const days = daysInMonth(month);
  const elapsed = month === currentMonth() ? Number(today().slice(8)) : days;
  const change = prevTotal > 0 ? (total - prevTotal) / prevTotal : null;
  const highestDay = [...daily].sort((a, b) => b.total - a.total)[0];

  // En el mes actual el gráfico llega hasta hoy, salvo que haya algo cargado con fecha posterior.
  const lastDataDay = Math.max(0, ...daily.map((d) => Number(d.date.slice(8))));
  const shownDays = month === currentMonth() ? Math.max(elapsed, lastDataDay) : days;
  const bars: Bar[] = Array.from({ length: shownDays }, (_, i) => {
    const day = i + 1;
    const date = `${month}-${String(day).padStart(2, "0")}`;
    return {
      key: date,
      label: shortDate(date),
      tooltip: shortDate(date),
      value: daily.find((d) => d.date === date)?.total ?? 0,
      axisLabel: day === 1 || day % 5 === 0 ? String(day) : "",
    };
  });

  return (
    <>
      <PageTitle title="Estadísticas" />
      {tabs("mes")}
      <MonthNav month={month} months={months} href={(m) => `/estadisticas?mes=${m}`} />
      <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="col-span-2 md:col-span-1">
          <Stat
            label="Total del mes"
            value={money(total)}
            hint={
              change == null
                ? "Sin datos del mes anterior"
                : `${change > 0 ? "+" : "−"}${Math.abs(Math.round(change * 100))}% vs. ${monthName(previous, false)}`
            }
          />
        </div>
        <Stat label="Promedio por día" value={money(wholePesos(total / elapsed))} />
        <Stat
          label="Día más alto"
          value={highestDay ? money(highestDay.total) : "—"}
          hint={highestDay ? shortDate(highestDay.date) : undefined}
        />
      </div>
      <SectionTitle>Gasto por día</SectionTitle>
      <div className="card">
        <BarChart bars={bars} summary="Tocá una barra para ver el monto" />
      </div>
      <SectionTitle>Por categoría</SectionTitle>
      <div className="card">
        <CategoryBars rows={categories} total={total} />
      </div>
      <SectionTitle>Gastos más grandes</SectionTitle>
      <div className="card py-1">
        <TopList rows={top} />
      </div>
    </>
  );
}
