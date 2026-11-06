import { Check, Plus, Trash2, Undo2 } from "lucide-react";
import { deleteRecurring, payRecurring, saveRecurring, undoRecurringPayment } from "@/app/actions";
import { ActionButton, ActionForm, AmountField, EditSheet, Field, MethodSelect, Sheet } from "@/components/forms";
import { Empty, PageTitle, Tabs } from "@/components/ui";
import { currentMonth, money, moneyInput, monthName, monthShort, shortDate, today } from "@/lib/format";
import { activeCategories, activeMethods, recurringStatus } from "@/lib/queries";

type Option = { id: number; name: string };
type Recurring = Awaited<ReturnType<typeof recurringStatus>>[number];

function RecurringFields({
  frequency,
  categories,
  methods,
  item,
}: {
  frequency: string;
  categories: Option[];
  methods: Option[];
  item?: Recurring;
}) {
  return (
    <>
      {item && <input type="hidden" name="id" value={item.id} />}
      <input type="hidden" name="frequency" value={frequency} />
      <Field label="Nombre">
        <input name="name" required defaultValue={item?.name} autoComplete="off" className="input" />
      </Field>
      <AmountField
        label="Monto estimado"
        defaultValue={moneyInput(item?.amount)}
        defaultCurrency={item?.currency}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoría">
          <select name="categoryId" defaultValue={item?.categoryId} className="input">
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <MethodSelect methods={methods} defaultValue={item?.paymentMethodId} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Día de vencimiento">
          <input name="dueDay" type="number" min={1} max={31} defaultValue={item?.dueDay ?? ""} className="input num" />
        </Field>
        {frequency === "anual" ? (
          <Field label="Mes">
            <select name="dueMonth" defaultValue={item?.dueMonth ?? ""} className="input">
              <option value="">—</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {monthShort(i + 1)}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Si varía, aclaración">
            <input name="dueNote" defaultValue={item?.dueNote ?? ""} placeholder="primera semana" className="input" />
          </Field>
        )}
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="reminderOnly"
          defaultChecked={item ? !item.createsExpense : false}
          className="mt-0.5 h-5 w-5 accent-primary"
        />
        <span>
          Solo recordatorio: no suma como gasto al pagarlo.
          <span className="block text-xs text-muted">Usalo para el resumen de la tarjeta, porque esas compras ya se cargan una por una.</span>
        </span>
      </label>
    </>
  );
}

function dueLabel(r: Recurring) {
  if (r.frequency === "anual" && r.dueMonth) return `${r.dueDay ?? ""} ${monthShort(r.dueMonth)}`.trim();
  if (r.dueDay) return `Día ${r.dueDay}`;
  return r.dueNote ?? "Sin fecha fija";
}

export default async function RecurringPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const frequency = (await searchParams).tipo === "anual" ? "anual" : "mensual";
  const month = currentMonth();
  const [all, categories, methods] = await Promise.all([
    recurringStatus(month),
    activeCategories(),
    activeMethods(),
  ]);
  const items = all
    .filter((r) => r.frequency === frequency)
    .sort((a, b) => Number(!!a.payment) - Number(!!b.payment) || (a.dueDay ?? 99) - (b.dueDay ?? 99));
  const total = items.filter((r) => r.currency === "ARS").reduce((sum, r) => sum + r.amount, 0);
  const paid = items.filter((r) => r.payment).length;

  return (
    <>
      <PageTitle
        title="Fijos"
        action={
          <Sheet title={frequency === "anual" ? "Nuevo fijo anual" : "Nuevo fijo mensual"} triggerLabel="Agregar fijo" trigger={<Plus size={18} />}>
            <ActionForm action={saveRecurring} resetOnSuccess>
              <RecurringFields frequency={frequency} categories={categories} methods={methods} />
            </ActionForm>
          </Sheet>
        }
      />
      <Tabs
        tabs={[
          { href: "/fijos", label: "Mensuales", active: frequency === "mensual" },
          { href: "/fijos?tipo=anual", label: "Anuales", active: frequency === "anual" },
        ]}
      />
      <p className="mb-3 text-sm text-muted first-letter:uppercase">
        {frequency === "anual" ? month.slice(0, 4) : monthName(month)} · {paid} de {items.length} pagados ·{" "}
        <span className="num text-ink">{money(total)}</span>
      </p>

      <div className="card py-1">
        {items.length === 0 && <Empty>Todavía no hay fijos acá.</Empty>}
        {items.map((r) => (
          <div key={r.id} className="row">
            <div className="min-w-0 flex-1">
              <p className="truncate">{r.name}</p>
              <p className="truncate text-xs text-muted">
                {r.payment ? (
                  <span className="text-good">Pagado el {shortDate(r.payment.paidOn)}</span>
                ) : (
                  `Pendiente · ${dueLabel(r)}`
                )}
                {!r.createsExpense && " · recordatorio"}
              </p>
              <p className="num mt-0.5 text-sm">{money(r.payment?.amount ?? r.amount, r.currency)}</p>
            </div>
            <EditSheet title={`Editar ${r.name}`}>
                <ActionForm action={saveRecurring}>
                  <RecurringFields frequency={frequency} categories={categories} methods={methods} item={r} />
                </ActionForm>
                <ActionButton
                  action={deleteRecurring}
                  fields={{ id: r.id }}
                  confirm="Tocá de nuevo para quitarlo"
                  className="btn mt-2 w-full text-bad"
                >
                  <Trash2 size={16} /> Quitar de la lista
                </ActionButton>
            </EditSheet>
            <div className="relative z-10 flex shrink-0 items-center gap-1">
              {r.payment ? (
                <ActionButton
                  action={undoRecurringPayment}
                  fields={{ id: r.payment.id }}
                  confirm="¿Deshacer?"
                  label={`Deshacer pago de ${r.name}`}
                  className="btn px-3 text-sm"
                >
                  <Undo2 size={16} />
                </ActionButton>
              ) : (
                <Sheet
                  title={`Pagar ${r.name}`}
                  triggerClassName="btn px-3 text-sm"
                  trigger={
                    <>
                      <Check size={16} /> Pagar
                    </>
                  }
                >
                  <ActionForm action={payRecurring} submitLabel="Marcar como pagado">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="period" value={r.period} />
                    <AmountField
                      label={`Monto pagado (${r.currency})`}
                      defaultValue={moneyInput(r.amount)}
                      defaultCurrency={r.currency}
                      showCurrency={false}
                      rateSide="venta"
                    />
                    <Field label="Fecha de pago">
                      <input type="date" name="date" required defaultValue={today()} className="input" />
                    </Field>
                    {r.createsExpense && <MethodSelect methods={methods} defaultValue={r.paymentMethodId} />}
                    {!r.createsExpense && (
                      <p className="text-xs text-muted">Es un recordatorio: no se suma a tus gastos.</p>
                    )}
                  </ActionForm>
                </Sheet>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
