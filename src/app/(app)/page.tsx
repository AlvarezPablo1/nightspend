import Link from "next/link";
import { Empty, PageTitle, SectionTitle, Stat } from "@/components/ui";
import { currentMonth, money, monthName, monthRange, shortDate } from "@/lib/format";
import {
  expenseList,
  installmentStatus,
  recurringStatus,
  totalForRange,
} from "@/lib/queries";
import { expenses, incomes } from "@/db/schema";
import { ensureRecurringIncomes } from "@/lib/recurring-incomes";

export default async function HomePage() {
  const month = currentMonth();
  const { from, to } = monthRange(month);
  await ensureRecurringIncomes();
  const [spent, earned, recents, recurrings, installments] = await Promise.all([
    totalForRange(expenses, from, to),
    totalForRange(incomes, from, to),
    expenseList({ from, to, limit: 5 }),
    recurringStatus(month),
    installmentStatus(1),
  ]);
  const pending = recurrings.filter((r) => r.frequency === "mensual" && !r.payment);
  const pendingTotal = pending.filter((r) => r.currency === "ARS").reduce((sum, r) => sum + r.amount, 0);
  const installmentsThisMonth = installments.schedule[0]?.total ?? 0;

  return (
    <>
      <PageTitle title={monthName(month).replace(/^./, (c) => c.toUpperCase())} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="col-span-2 md:col-span-1">
          <Stat label="Gastado" value={money(spent)} />
        </div>
        <Stat label="Ingresos" value={money(earned)} />
        <Stat label="Balance" value={money(earned - spent)} />
      </div>

      <SectionTitle
        action={
          <Link href="/fijos" className="text-sm text-muted">
            Ver todos
          </Link>
        }
      >
        Fijos pendientes{pendingTotal > 0 && ` · ${money(pendingTotal)}`}
      </SectionTitle>
      <div className="card py-1">
        {pending.length === 0 && <Empty>Pagaste todos los fijos de este mes.</Empty>}
        {pending.map((r) => (
          <Link key={r.id} href="/fijos" className="row">
            <div className="min-w-0">
              <p className="truncate">{r.name}</p>
              <p className="text-xs text-muted">{r.dueDay ? `Día ${r.dueDay}` : (r.dueNote ?? "Sin fecha fija")}</p>
            </div>
            <span className="num shrink-0">{money(r.amount, r.currency)}</span>
          </Link>
        ))}
      </div>

      {installmentsThisMonth > 0 && (
        <p className="mt-3 text-sm text-muted">
          Cuotas de este mes: <span className="num text-ink">{money(installmentsThisMonth)}</span>
        </p>
      )}

      <SectionTitle
        action={
          <Link href="/gastos" className="text-sm text-muted">
            Ver todos
          </Link>
        }
      >
        Últimos gastos
      </SectionTitle>
      <div className="card py-1">
        {recents.length === 0 && <Empty>Todavía no cargaste gastos este mes.</Empty>}
        {recents.map((e) => (
          <Link key={e.id} href={`/gastos/${e.id}`} className="row">
            <div className="min-w-0">
              <p className="truncate">{e.description}</p>
              <p className="text-xs text-muted">
                {shortDate(e.date)} · {e.category}
              </p>
            </div>
            <span className="num shrink-0">{money(e.amount, e.currency)}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
