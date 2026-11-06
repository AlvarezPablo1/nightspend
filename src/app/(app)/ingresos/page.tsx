import { sql } from "drizzle-orm";
import { Pause, Play, Plus, Trash2 } from "lucide-react";
import { redirect } from "next/navigation";
import {
  deleteIncome,
  deleteRecurringIncome,
  saveIncome,
  saveRecurringIncome,
  toggleRecurringIncome,
} from "@/app/actions";
import { ActionButton, ActionForm, AmountField, EditSheet, Field, Sheet } from "@/components/forms";
import { Empty, MonthNav, PageTitle, SectionTitle, Stat } from "@/components/ui";
import { db } from "@/db";
import { expenses, incomes, recurringIncomes } from "@/db/schema";
import { currentMonth, isMonth, money, moneyInput, monthRange, shortDate, today } from "@/lib/format";
import { availableMonths, incomesFor, totalForRange } from "@/lib/queries";
import { ensureRecurringIncomes, payDate } from "@/lib/recurring-incomes";

type Income = Awaited<ReturnType<typeof incomesFor>>[number];
type Job = typeof recurringIncomes.$inferSelect;

function OriginField({
  name,
  defaultValue,
  listId,
  origins,
}: {
  name: string;
  defaultValue?: string;
  listId: string;
  origins: string[];
}) {
  return (
    <>
      <Field label="¿De dónde viene?">
        <input
          name={name}
          required
          list={listId}
          defaultValue={defaultValue}
          autoComplete="off"
          placeholder="Ej: sueldo, trabajo extra, una venta"
          className="input"
        />
      </Field>
      <datalist id={listId}>
        {origins.map((origin) => (
          <option key={origin} value={origin} />
        ))}
      </datalist>
    </>
  );
}

function IncomeFields({
  income,
  defaultDate,
  origins,
}: {
  income?: Income;
  defaultDate: string;
  origins: string[];
}) {
  return (
    <>
      {income && <input type="hidden" name="id" value={income.id} />}
      <AmountField
        defaultValue={moneyInput(income?.amount)}
        defaultCurrency={income?.currency}
        rateSide="compra"
        savedRate={income?.rate}
        savedDate={income?.date}
      />
      <OriginField
        name="description"
        defaultValue={income?.description}
        listId={`origenes-${income?.id ?? "nuevo"}`}
        origins={origins}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          <select name="type" defaultValue={income?.type ?? "variable"} className="input">
            <option value="fijo">Fijo</option>
            <option value="variable">Variable</option>
          </select>
        </Field>
        <Field label="Fecha">
          <input type="date" name="date" required defaultValue={income?.date ?? defaultDate} className="input" />
        </Field>
      </div>
      <Field label="Nota (opcional)">
        <input name="note" defaultValue={income?.note ?? ""} autoComplete="off" className="input" />
      </Field>
    </>
  );
}

function JobFields({ job, origins }: { job?: Job; origins: string[] }) {
  return (
    <>
      {job && <input type="hidden" name="id" value={job.id} />}
      <OriginField
        name="name"
        defaultValue={job?.name}
        listId={`trabajos-${job?.id ?? "nuevo"}`}
        origins={origins}
      />
      <AmountField label="Monto por mes" defaultValue={moneyInput(job?.amount)} defaultCurrency={job?.currency} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Día de cobro">
          <input name="payDay" type="number" min={1} max={31} required defaultValue={job?.payDay ?? 1} className="input num" />
        </Field>
        {!job && (
          <Field label="Desde">
            <input name="firstMonth" type="month" required defaultValue={currentMonth()} className="input" />
          </Field>
        )}
      </div>
      <p className="text-xs text-muted">
        {job
          ? "Un cambio de monto aplica a los próximos cobros. Los ya registrados se editan uno por uno."
          : "El ingreso se registra solo cada mes, en el día de cobro. Si elegís un mes pasado, también se cargan los meses que faltan."}
      </p>
    </>
  );
}

export default async function IncomePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const [{ mes: param }, months] = await Promise.all([searchParams, availableMonths()]);
  if (param && !months.includes(param)) redirect("/ingresos");
  const month = isMonth(param) ? param : currentMonth();
  const { from, to } = monthRange(month);
  const [{ failed }, list, spent, jobs, usedOrigins] = await Promise.all([
    ensureRecurringIncomes(),
    incomesFor(month),
    totalForRange(expenses, from, to),
    db.select().from(recurringIncomes).orderBy(sql`${recurringIncomes.active} desc, ${recurringIncomes.name}`),
    db.selectDistinct({ origin: incomes.description }).from(incomes).orderBy(sql`1`),
  ]);
  const origins = usedOrigins.map((o) => o.origin);
  const total = list.reduce((sum, i) => sum + i.amountArs, 0);
  const defaultDate = month === currentMonth() ? today() : `${month}-01`;

  return (
    <>
      <PageTitle
        title="Ingresos"
        action={
          <Sheet title="Nuevo ingreso" triggerLabel="Agregar ingreso" trigger={<Plus size={18} />}>
            <ActionForm action={saveIncome} resetOnSuccess>
              <IncomeFields defaultDate={defaultDate} origins={origins} />
            </ActionForm>
          </Sheet>
        }
      />
      <MonthNav month={month} months={months} href={(m) => `/ingresos?mes=${m}`} />
      <div className="mt-2 mb-4 grid grid-cols-2 gap-3">
        <Stat label="Ingresos" value={money(total)} />
        <Stat label="Balance" value={money(total - spent)} hint={`Gastaste ${money(spent)}`} />
      </div>

      {failed.length > 0 && (
        <p role="status" className="mb-3 rounded-lg border border-line bg-surface p-3 text-sm">
          <span className="text-warn">No pude registrar {failed.join(", ")}.</span>{" "}
          <span className="text-muted">Falta la cotización del dólar. Se vuelve a intentar sola la próxima vez que abras la app.</span>
        </p>
      )}

      <div className="card py-1">
        {list.length === 0 && <Empty>No hay ingresos este mes.</Empty>}
        {list.map((i) => (
          <div key={i.id} className="row">
            <EditSheet title={`Editar ${i.description}`}>
              <ActionForm action={saveIncome}>
                <IncomeFields income={i} defaultDate={defaultDate} origins={origins} />
              </ActionForm>
              <ActionButton
                action={deleteIncome}
                fields={{ id: i.id }}
                confirm="Tocá de nuevo para borrar"
                className="btn mt-2 w-full text-bad"
              >
                <Trash2 size={16} /> Borrar
              </ActionButton>
            </EditSheet>
            <div className="min-w-0 flex-1">
              <p className="truncate">{i.description}</p>
              <p className="text-xs text-muted first-letter:uppercase">
                {i.recurringIncomeId ? "Automático" : i.type} · {shortDate(i.date)}
              </p>
            </div>
            <div className="text-right">
              <p className="num">{money(i.amount, i.currency)}</p>
              {i.currency === "USD" && <p className="num text-xs text-muted">{money(i.amountArs)}</p>}
            </div>
          </div>
        ))}
      </div>

      <SectionTitle
        action={
          <Sheet
            title="Nuevo trabajo fijo"
            triggerLabel="Agregar trabajo fijo"
            triggerClassName="flex h-8 w-8 cursor-pointer items-center justify-center text-muted"
            trigger={<Plus size={18} />}
          >
            <ActionForm action={saveRecurringIncome} resetOnSuccess>
              <JobFields origins={origins} />
            </ActionForm>
          </Sheet>
        }
      >
        Trabajos fijos
      </SectionTitle>
      <div className="card py-1">
        {jobs.length === 0 && (
          <Empty>Agregá un trabajo fijo y su ingreso se va a registrar solo todos los meses.</Empty>
        )}
        {jobs.map((job) => (
          <div key={job.id} className="row">
            <EditSheet title={`Editar ${job.name}`}>
              <ActionForm action={saveRecurringIncome}>
                <JobFields job={job} origins={origins} />
              </ActionForm>
              <ActionButton action={toggleRecurringIncome} fields={{ id: job.id }} className="btn mt-2 w-full">
                {job.active ? (
                  <>
                    <Pause size={16} /> Pausar
                  </>
                ) : (
                  <>
                    <Play size={16} /> Reactivar
                  </>
                )}
              </ActionButton>
              <ActionButton
                action={deleteRecurringIncome}
                fields={{ id: job.id }}
                confirm="Tocá de nuevo para borrar"
                className="btn mt-2 w-full text-bad"
              >
                <Trash2 size={16} /> Borrar (los ingresos registrados quedan)
              </ActionButton>
            </EditSheet>
            <div className={`min-w-0 flex-1 ${job.active ? "" : "opacity-60"}`}>
              <p className="truncate">{job.name}</p>
              <p className="text-xs text-muted">
                {job.active ? `Próximo cobro: ${shortDate(payDate(job.nextMonth, job.payDay))}` : "En pausa"}
              </p>
            </div>
            <span className="num shrink-0">{money(job.amount, job.currency)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
