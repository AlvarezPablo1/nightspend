import { BellRing, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Empty, PageTitle, SectionTitle, Stat } from "@/components/ui";
import { currentUserId } from "@/lib/auth";
import { currentMonth, dueText, money, monthName, monthRange, shortDate } from "@/lib/format";
import {
  dueAlerts,
  expenseList,
  installmentStatus,
  monthAvailability,
  recurringStatus,
} from "@/lib/queries";
import { ensureRecurringIncomes } from "@/lib/recurring-incomes";

export default async function HomePage() {
  const month = currentMonth();
  const { from, to } = monthRange(month);
  const userId = await currentUserId();
  await ensureRecurringIncomes(userId);
  const [{ available, spent, earned, fixed, installments: dueInstallments, incomplete }, alerts, recents, recurrings, installments] = await Promise.all([
    monthAvailability(userId),
    dueAlerts(userId),
    expenseList(userId, { from, to, limit: 5 }),
    recurringStatus(userId, month),
    installmentStatus(userId, 1),
  ]);
  const pending = recurrings.filter((r) => r.frequency === "mensual" && !r.payment);
  const pendingTotal = pending.filter((r) => r.currency === "ARS").reduce((sum, r) => sum + r.amount, 0);
  const installmentsThisMonth = installments.schedule[0]?.total ?? 0;
  // Vienen ordenadas: primero lo vencido, después lo que vence antes.
  const nextDue = alerts[0];
  const overdue = nextDue && nextDue.days < 0;

  return (
    <>
      <PageTitle title={monthName(month).replace(/^./, (c) => c.toUpperCase())} />

      {nextDue && (
        <Link
          href={nextDue.frequency === "anual" ? "/fijos?tipo=anual" : "/fijos"}
          aria-label={`Próximo vencimiento: ${nextDue.name}, ${dueText(nextDue.days).toLowerCase()}`}
          className={`mb-3 flex items-center gap-3 rounded-xl border px-4 py-3 ${
            overdue ? "border-bad/40 bg-bad/10" : "border-warn/40 bg-warn/10"
          }`}
        >
          <BellRing size={18} className={`shrink-0 ${overdue ? "text-bad" : "text-warn"}`} />
          <div className="min-w-0 flex-1">
            <p className="truncate">{nextDue.name}</p>
            <p className={`text-xs ${overdue ? "text-bad" : "text-warn"}`}>{dueText(nextDue.days)}</p>
          </div>
          <span className="num shrink-0">{money(nextDue.amount, nextDue.currency)}</span>
          <ChevronRight size={16} className="shrink-0 text-muted" />
        </Link>
      )}

      <section className="card mb-3">
        <p className="text-[13px] text-muted">{available < 0 ? "Te pasaste este mes" : "Te queda disponible"}</p>
        <p className={`num mt-1 text-3xl font-semibold tracking-tight ${available < 0 ? "text-bad" : ""}`}>
          {money(Math.abs(available))}
        </p>
        <p className="mt-1 text-xs text-muted">
          Ya descuenta <span className="num">{money(fixed)}</span> de fijos pendientes y{" "}
          <span className="num">{money(dueInstallments)}</span> de cuotas.
          {incomplete && " Sin contar lo que está en dólares: no pude obtener la cotización."}
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Gastado" value={money(spent)} />
        <Stat label="Ingresos" value={money(earned)} />
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
          <Link key={e.id} href="/gastos" className="row">
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
