import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { deletePlan, savePlan } from "@/app/actions";
import { BarChart } from "@/components/bar-chart";
import { ActionButton, ActionForm, EditSheet, Field, MethodSelect, OwnerFields, Sheet } from "@/components/forms";
import { Empty, PageTitle, Progress, SectionTitle, Stat } from "@/components/ui";
import { addMonths, currentMonth, money, moneyInput, monthName, monthShort } from "@/lib/format";
import { activeMethods, debtPeople, installmentStatus, type Plan } from "@/lib/queries";

function PlanFields({
  plan,
  methods,
  people,
}: {
  plan?: Plan;
  methods: { id: number; name: string }[];
  people: string[];
}) {
  return (
    <>
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <Field label="Descripción">
        <input name="description" required defaultValue={plan?.description} autoComplete="off" className="input" />
      </Field>
      <Field label="Monto total de la compra">
        <input name="totalAmount" inputMode="decimal" defaultValue={moneyInput(plan?.totalAmount)} className="input num" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cuotas">
          <input name="installments" type="number" min={1} max={60} required defaultValue={plan?.installments ?? 1} className="input num" />
        </Field>
        <Field label="Primera cuota">
          <input name="firstMonth" type="month" required defaultValue={plan?.firstMonth ?? addMonths(currentMonth(), 1)} className="input" />
        </Field>
      </div>
      <MethodSelect methods={methods} defaultValue={plan?.paymentMethodId} />
      <OwnerFields people={people} defaultPerson={plan?.otherPerson} defaultOwed={moneyInput(plan?.debtAmount)} />
    </>
  );
}

function OtherPersonBadge({ person }: { person: string }) {
  return (
    <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent-hover">
      Paga {person}
    </span>
  );
}

function PlanDelete({ plan }: { plan: Plan }) {
  if (!plan.debtId) {
    return (
      <ActionButton action={deletePlan} fields={{ id: plan.id }} confirm="Tocá de nuevo para borrar" className="btn mt-2 w-full text-bad">
        <Trash2 size={16} /> Borrar
      </ActionButton>
    );
  }
  return (
    <div className="mt-2 grid gap-2">
      <ActionButton action={deletePlan} fields={{ id: plan.id, alsoDebt: 1 }} confirm="Tocá de nuevo para borrar las dos" className="btn w-full text-bad">
        <Trash2 size={16} /> Borrar compra y deuda
      </ActionButton>
      <ActionButton action={deletePlan} fields={{ id: plan.id }} confirm="Tocá de nuevo: la deuda queda" className="btn w-full text-bad">
        <Trash2 size={16} /> Borrar solo la compra
      </ActionButton>
    </div>
  );
}

export default async function InstallmentsPage() {
  const [{ plans, schedule }, methods, people] = await Promise.all([installmentStatus(12), activeMethods(), debtPeople()]);
  const active = plans.filter((p) => p.pending > 0);
  const finished = plans.filter((p) => p.pending === 0);
  const totalPending = active.reduce((sum, p) => (p.currency === "ARS" ? sum + (p.remaining ?? 0) : sum), 0);
  const fromOthers = active.reduce((sum, p) => (p.otherPerson && p.currency === "ARS" ? sum + (p.remaining ?? 0) : sum), 0);
  const missing = active.filter((p) => p.totalAmount == null).length;

  const bars = schedule.map((s) => {
    const m = Number(s.month.slice(5));
    return {
      key: s.month,
      label: monthName(s.month),
      tooltip: monthName(s.month),
      value: s.total,
      axisLabel: monthShort(m).slice(0, 1).toUpperCase(),
    };
  });

  return (
    <>
      <PageTitle
        title="Cuotas"
        action={
          <Sheet title="Agregar compra en cuotas" triggerLabel="Agregar compra en cuotas" trigger={<Plus size={18} />}>
            <p className="mb-4 text-sm text-muted">
              Suma a lo comprometido, pero no a tus gastos. Si es una compra nueva y tuya, cargala con el botón + para que cuente como gasto.
            </p>
            <ActionForm action={savePlan} resetOnSuccess>
              <PlanFields methods={methods} people={people} />
            </ActionForm>
          </Sheet>
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Comprometido"
          value={money(totalPending)}
          hint={fromOthers > 0 ? `${money(fromOthers)} son de otras personas` : "Cuotas por pagar"}
        />
        <Stat label="Este mes" value={money(schedule[0]?.total ?? 0)} hint={`${active.length} compras activas`} />
      </div>

      {missing > 0 && (
        <p className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm">
          <span className="text-warn">{missing} compras sin monto.</span>{" "}
          <span className="text-muted">Completalas para que el total sea correcto.</span>
        </p>
      )}

      <SectionTitle>Próximos 12 meses</SectionTitle>
      <div className="card">
        <BarChart bars={bars} summary="Tocá una barra para ver el monto" height={120} />
      </div>

      <SectionTitle>En curso</SectionTitle>
      <div className="card py-1">
        {active.length === 0 && <Empty>No tenés cuotas pendientes.</Empty>}
        {active.map((p) => (
          <div key={p.id} className="relative py-3 not-first:border-t not-first:border-line">
            {p.expenseId ? (
              <Link href={`/gastos/${p.expenseId}`} aria-label={`Editar ${p.description}`} className="absolute inset-0 rounded-lg hover:bg-white/[0.03]" />
            ) : (
              <EditSheet title={`Editar ${p.description}`}>
                <ActionForm action={savePlan}>
                  <PlanFields plan={p} methods={methods} people={people} />
                </ActionForm>
                <PlanDelete plan={p} />
              </EditSheet>
            )}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 break-words">{p.description}</span>
                  {p.otherPerson && <OtherPersonBadge person={p.otherPerson} />}
                </p>
                <p className="text-xs text-muted">
                  {p.method ?? "Sin tarjeta"} · termina en {monthName(p.lastMonth)}
                </p>
              </div>
              <div className="shrink-0">
                <div className="text-right">
                  {p.perInstallment == null ? (
                    <p className="text-sm text-warn">Sin monto</p>
                  ) : (
                    <p className="num">{money(p.perInstallment, p.currency)}</p>
                  )}
                  <p className="text-xs text-muted">
                    {p.pending === 1 ? "falta 1 cuota" : `faltan ${p.pending} cuotas`}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-2">
              <Progress value={p.paid / p.installments} />
            </div>
          </div>
        ))}
      </div>

      {finished.length > 0 && (
        <>
          <SectionTitle>Terminadas</SectionTitle>
          <div className="card py-1">
            {finished.map((p) => (
              <div key={p.id} className="row text-muted">
                {p.expenseId ? (
                  <Link href={`/gastos/${p.expenseId}`} aria-label={`Editar ${p.description}`} className="absolute inset-0 rounded-lg hover:bg-white/[0.03]" />
                ) : (
                  <EditSheet title={`Editar ${p.description}`}>
                    <ActionForm action={savePlan}>
                      <PlanFields plan={p} methods={methods} people={people} />
                    </ActionForm>
                    <PlanDelete plan={p} />
                  </EditSheet>
                )}
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 break-words">{p.description}</span>
                  {p.otherPerson && <OtherPersonBadge person={p.otherPerson} />}
                </span>
                <span className="num shrink-0 text-sm">{p.totalAmount != null && money(p.totalAmount, p.currency)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
