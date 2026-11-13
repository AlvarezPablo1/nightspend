import { cookies } from "next/headers";
import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Empty, MonthNav, PageTitle, Tabs, YearNav } from "@/components/ui";
import { SearchInput } from "@/components/search-input";
import { ViewToggle } from "@/components/view-toggle";
import { currentUserId } from "@/lib/auth";
import { VIEW_COOKIE } from "@/lib/expense-view";
import { currentMonth, dayLabel, isMonth, isYear, money, monthName, monthRange, yearsOf } from "@/lib/format";
import { activeCategories, availableMonths, expenseList, monthlyTotals, recurringStatus } from "@/lib/queries";

type Params = { mes?: string; anio?: string; cat?: string; q?: string };

function monthHref(month: string, params: Params) {
  const query = new URLSearchParams({ mes: month });
  if (params.cat) query.set("cat", params.cat);
  if (params.q) query.set("q", params.q);
  return `/gastos?${query}`;
}

function ExpenseTable({ rows }: { rows: Awaited<ReturnType<typeof expenseList>> }) {
  return (
    <div className="card overflow-hidden p-0">
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th scope="col" className="td w-16 font-medium">Fecha</th>
            <th scope="col" className="td font-medium">Descripción</th>
            <th scope="col" className="td hidden w-36 font-medium sm:table-cell">Categoría</th>
            <th scope="col" className="td hidden w-40 font-medium md:table-cell">Medio de pago</th>
            <th scope="col" className="td w-28 text-right font-medium md:w-32">Monto</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="relative border-t border-line first:border-t-0 hover:bg-surface-2">
              <td className="num td text-muted">
                {e.date.slice(8)}/{e.date.slice(5, 7)}
              </td>
              <td className="td wrap-break-word">
                {/* El link cubre toda la fila para abrir el gasto desde cualquier celda. */}
                <Link href={`/gastos/${e.id}`} prefetch={false} className="after:absolute after:inset-0">
                  {e.description}
                </Link>
                <span className="block text-xs text-muted sm:hidden">
                  {e.category}
                  {e.installments > 1 && ` · ${e.installments} cuotas`}
                </span>
                {e.installments > 1 && (
                  <span className="hidden text-xs text-muted sm:block">{e.installments} cuotas</span>
                )}
              </td>
              <td className="td hidden wrap-break-word text-muted sm:table-cell">{e.category}</td>
              <td className="td hidden wrap-break-word text-muted md:table-cell">{e.method ?? "—"}</td>
              <td className="num td text-right">{money(e.amount, e.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const userId = await currentUserId();
  const [params, months] = await Promise.all([searchParams, availableMonths(userId)]);
  const years = yearsOf(months);
  if (params.anio && !years.includes(params.anio)) redirect("/gastos");
  if (params.mes && !months.includes(params.mes)) redirect("/gastos");

  const tabs = (active: "mes" | "anio") => (
    <Tabs
      tabs={[
        { href: "/gastos", label: "Por mes", active: active === "mes" },
        { href: `/gastos?anio=${currentMonth().slice(0, 4)}`, label: "Por año", active: active === "anio" },
      ]}
    />
  );

  if (isYear(params.anio)) {
    const year = params.anio;
    const [totals, recurrings] = await Promise.all([
      monthlyTotals(userId, params.anio),
      recurringStatus(userId, currentMonth()),
    ]);
    const annual = recurrings.filter((r) => r.frequency === "anual");
    const yearTotal = totals.reduce((sum, m) => sum + m.total, 0);
    return (
      <>
        <PageTitle title="Gastos" />
        {tabs("anio")}
        <YearNav year={year} years={years} href={(y) => `/gastos?anio=${y}`} />
        <div className="card mt-2 py-1">
          {totals.length === 0 && <Empty>Sin gastos en {year}.</Empty>}
          {[...totals]
            .sort((a, b) => b.month.localeCompare(a.month))
            .map((m) => (
              <Link key={m.month} href={`/gastos?mes=${m.month}`} className="row">
                <span className="first-letter:uppercase">{monthName(m.month, false)}</span>
                <span className="num">{money(m.total)}</span>
              </Link>
            ))}
          {totals.length > 0 && (
            <div className="row font-semibold">
              <span>Total {year}</span>
              <span className="num">{money(yearTotal)}</span>
            </div>
          )}
        </div>

        <h2 className="mt-8 mb-3 text-sm font-medium text-muted">Pagos anuales</h2>
        <div className="card py-1">
          {annual.length === 0 && <Empty>Sin pagos anuales.</Empty>}
          {annual.map((r) => (
            <Link key={r.id} href="/fijos?tipo=anual" className="row">
              <span>{r.name}</span>
              <span className="num">{money(r.amount, r.currency)}</span>
            </Link>
          ))}
        </div>
      </>
    );
  }

  const month = isMonth(params.mes) ? params.mes : currentMonth();
  const { from, to } = monthRange(month);
  const categoryId = Number(params.cat) || undefined;
  const q = params.q?.trim() || undefined;
  const [categories, list, cookieStore] = await Promise.all([
    activeCategories(userId),
    expenseList(userId, { from, to, categoryId, q }),
    cookies(),
  ]);
  const view = cookieStore.get(VIEW_COOKIE)?.value === "lista" ? "lista" : "tabla";

  const days = new Map<string, typeof list>();
  for (const e of list) days.set(e.date, [...(days.get(e.date) ?? []), e]);
  const total = list.reduce((sum, e) => sum + e.amountArs, 0);

  const chipHref = (cat?: number, keepSearch = true) => {
    const query = new URLSearchParams({ mes: month });
    if (cat) query.set("cat", String(cat));
    if (q && keepSearch) query.set("q", q);
    return `/gastos?${query}`;
  };

  return (
    <>
      <PageTitle title="Gastos" />
      {tabs("mes")}
      <MonthNav month={month} months={months} href={(m) => monthHref(m, params)} />

      <p className="num mt-1 mb-4 text-center text-3xl font-semibold tracking-tight">{money(total)}</p>

      <div className="mb-3 flex items-center gap-2">
        <Form action="/gastos" className="relative min-w-0 flex-1">
          <input type="hidden" name="mes" value={month} />
          {categoryId && <input type="hidden" name="cat" value={categoryId} />}
          <SearchInput key={q ?? ""} defaultValue={q} clearHref={chipHref(categoryId, false)} />
        </Form>
        <ViewToggle view={view} />
      </div>

      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        <Link href={chipHref()} className={`chip ${!categoryId ? "chip-on" : ""}`}>
          Todas
        </Link>
        {categories.map((c) => (
          <Link key={c.id} href={chipHref(c.id)} className={`chip ${c.id === categoryId ? "chip-on" : ""}`}>
            {c.name}
          </Link>
        ))}
      </div>

      {list.length === 0 && <Empty>No hay gastos para mostrar.</Empty>}
      {list.length > 0 && view === "tabla" && <ExpenseTable rows={list} />}
      {list.length > 0 && view === "lista" && (
        <div className="space-y-4">
          {[...days].map(([date, items]) => (
            <section key={date}>
              <div className="mb-1.5 flex justify-between px-1 text-xs text-muted">
                <span className="first-letter:uppercase">{dayLabel(date)}</span>
                <span className="num">{money(items.reduce((sum, e) => sum + e.amountArs, 0))}</span>
              </div>
              <div className="card py-0.5">
                {items.map((e) => (
                  <Link key={e.id} href={`/gastos/${e.id}`} prefetch={false} className="row">
                    <div className="min-w-0">
                      <p className="truncate">{e.description}</p>
                      <p className="truncate text-xs text-muted">
                        {e.category}
                        {e.method && ` · ${e.method}`}
                        {e.installments > 1 && ` · ${e.installments} cuotas`}
                      </p>
                    </div>
                    <span className="num shrink-0">{money(e.amount, e.currency)}</span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
