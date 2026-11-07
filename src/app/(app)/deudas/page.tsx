import { Plus, Trash2, X } from "lucide-react";
import { addDebtPayment, deleteDebt, deleteDebtPayment, saveDebt } from "@/app/actions";
import { ActionButton, ActionForm, AmountField, EditSheet, Field, Sheet } from "@/components/forms";
import { Empty, PageTitle, Progress, SectionTitle } from "@/components/ui";
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

function totalsLabel(list: Debt[]) {
  const ars = list.filter((d) => d.currency === "ARS").reduce((sum, d) => sum + d.remaining, 0);
  const usd = list.filter((d) => d.currency === "USD").reduce((sum, d) => sum + d.remaining, 0);
  const parts = [ars > 0 && money(ars), usd > 0 && money(usd, "USD")].filter(Boolean);
  return parts.length ? parts.join(" + ") : money(0);
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

export default async function DebtsPage() {
  const debts = await debtStatus();
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
      <SectionTitle action={<span className="num text-sm">{totalsLabel(owedToMe)}</span>}>Me deben</SectionTitle>
      <div className="card py-1">
        {owedToMe.length === 0 && <Empty>Nadie te debe nada.</Empty>}
        {owedToMe.map((d) => (
          <DebtCard key={d.id} debt={d} />
        ))}
      </div>
      <SectionTitle action={<span className="num text-sm">{totalsLabel(iOwe)}</span>}>Debo</SectionTitle>
      <div className="card py-1">
        {iOwe.length === 0 && <Empty>No tenés deudas cargadas.</Empty>}
        {iOwe.map((d) => (
          <DebtCard key={d.id} debt={d} />
        ))}
      </div>
    </>
  );
}
