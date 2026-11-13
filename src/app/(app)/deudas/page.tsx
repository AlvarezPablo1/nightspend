import { Plus, Trash2, X } from "lucide-react";
import { addDebtPayment, deleteDebt, deleteDebtPayment, saveDebt } from "@/app/actions";
import { ActionButton, ActionForm, AmountField, EditSheet, Field, Sheet } from "@/components/forms";
import { Empty, PageTitle, Progress, SectionTitle } from "@/components/ui";
import { currentUserId } from "@/lib/auth";
import { money, moneyInput, shortDate, today } from "@/lib/format";
import { debtStatus } from "@/lib/queries";

type Debt = Awaited<ReturnType<typeof debtStatus>>[number];

function DebtFields({ debt }: { debt?: Debt }) {
  return (
    <>
      {debt && <input type="hidden" name="id" value={debt.id} />}
      <Field label="Tipo">
        <select name="direction" defaultValue={debt?.direction ?? "me_deben"} className="input">
          <option value="me_deben">Me deben</option>
          <option value="debo">Debo</option>
        </select>
      </Field>
      <Field label="Persona">
        <input name="person" required defaultValue={debt?.person} autoComplete="off" className="input" />
      </Field>
      <Field label="Concepto">
        <input name="concept" defaultValue={debt?.concept ?? ""} autoComplete="off" className="input" />
      </Field>
      <AmountField defaultValue={moneyInput(debt?.amount)} defaultCurrency={debt?.currency} />
    </>
  );
}

const CURRENCY_GROUPS = [
  { currency: "ARS", label: "Pesos" },
  { currency: "USD", label: "Dólares" },
] as const;

function totalRemaining(list: Debt[]) {
  return list.reduce((sum, d) => sum + d.remaining, 0);
}

function DebtCard({ debt }: { debt: Debt }) {
  return (
    <div className="relative py-3 not-first:border-t not-first:border-line">
      <EditSheet title={`Editar deuda de ${debt.person}${debt.concept ? ` · ${debt.concept}` : ""}`}>
            <ActionForm action={saveDebt}>
              <DebtFields debt={debt} />
            </ActionForm>
            <ActionButton
              action={deleteDebt}
              fields={{ id: debt.id }}
              confirm="Tocá de nuevo para borrar"
              className="btn mt-2 w-full text-bad"
            >
              <Trash2 size={16} /> Borrar deuda
            </ActionButton>
      </EditSheet>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate">{debt.person}</p>
          {debt.concept && <p className="truncate text-xs text-muted">{debt.concept}</p>}
        </div>
        <div className="shrink-0">
          <div className="text-right">
            <p className="num">{money(debt.remaining, debt.currency)}</p>
            {debt.paid > 0 && <p className="num text-xs text-muted">de {money(debt.amount, debt.currency)}</p>}
          </div>
        </div>
      </div>

      {debt.paid > 0 && (
        <div className="mt-2">
          <Progress value={debt.paid / debt.amount} tone={debt.remaining === 0 ? "good" : "accent"} />
        </div>
      )}

      {debt.remaining > 0 && (
        <div className="relative z-10 mt-2 inline-block">
          <Sheet title={`Registrar pago · ${debt.person}`} triggerClassName="btn min-h-9! px-3 text-sm" trigger="Registrar pago">
            <ActionForm action={addDebtPayment} resetOnSuccess submitLabel="Registrar" pendingLabel="Registrando pago…">
              <input type="hidden" name="id" value={debt.id} />
              <Field label={`Monto (${debt.currency})`}>
                <input name="amount" required inputMode="decimal" defaultValue={moneyInput(debt.remaining)} className="input num" />
              </Field>
              <Field label="Fecha">
                <input type="date" name="date" required defaultValue={today()} className="input" />
              </Field>
            </ActionForm>
          </Sheet>
        </div>
      )}

      {debt.payments.length > 0 && (
        <ul className="relative z-10 mt-2 space-y-0.5">
          {debt.payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between text-xs text-muted">
              <span>{shortDate(p.date)}</span>
              <span className="flex items-center gap-1">
                <span className="num">{money(p.amount, debt.currency)}</span>
                <ActionButton
                  action={deleteDebtPayment}
                  fields={{ id: p.id }}
                  confirm="¿Borrar?"
                  label="Borrar pago"
                  className="flex h-8 min-w-8 cursor-pointer items-center justify-center"
                >
                  <X size={14} />
                </ActionButton>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DebtSection({ title, empty, debts }: { title: string; empty: string; debts: Debt[] }) {
  const groups = CURRENCY_GROUPS.map((group) => ({
    ...group,
    debts: debts.filter((d) => d.currency === group.currency),
  })).filter((group) => group.debts.length > 0);
  const [only] = groups;
  const mixed = groups.length > 1;

  return (
    <>
      <SectionTitle
        action={
          mixed ? undefined : (
            <span className="num text-sm">{only ? money(totalRemaining(only.debts), only.currency) : money(0)}</span>
          )
        }
      >
        {title}
      </SectionTitle>
      <div className="card py-1">
        {debts.length === 0 && <Empty>{empty}</Empty>}
        {mixed
          ? groups.map((group) => (
              <section key={group.currency} className="not-first:border-t not-first:border-line">
                <div className="flex items-center justify-between gap-3 pt-4 pb-1 text-lg font-semibold">
                  <h3>{group.label}</h3>
                  <span className="num">{money(totalRemaining(group.debts), group.currency)}</span>
                </div>
                <div>
                  {group.debts.map((d) => (
                    <DebtCard key={d.id} debt={d} />
                  ))}
                </div>
              </section>
            ))
          : debts.map((d) => <DebtCard key={d.id} debt={d} />)}
      </div>
    </>
  );
}

export default async function DebtsPage() {
  const debts = await debtStatus(await currentUserId());
  const iOwe = debts.filter((d) => d.direction === "debo");
  const owedToMe = debts.filter((d) => d.direction === "me_deben");

  return (
    <>
      <PageTitle
        title="Deudas"
        action={
          <Sheet title="Nueva deuda" triggerLabel="Agregar deuda" trigger={<Plus size={18} />}>
            <ActionForm action={saveDebt} resetOnSuccess>
              <DebtFields />
            </ActionForm>
          </Sheet>
        }
      />
      <DebtSection title="Me deben" empty="Nadie te debe nada." debts={owedToMe} />
      <DebtSection title="Debo" empty="No tenés deudas cargadas." debts={iOwe} />
    </>
  );
}
