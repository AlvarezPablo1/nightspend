import { asc, eq } from "drizzle-orm";
import { Download, Plus } from "lucide-react";
import { saveCategory, saveDollarType, saveMethod, toggleCategoryArchived, toggleMethodArchived } from "@/app/actions";
import { ActionButton, ActionForm, EditSheet, Field, Sheet } from "@/components/forms";
import { PageTitle, SectionTitle } from "@/components/ui";
import { db } from "@/db";
import { categories, paymentMethods } from "@/db/schema";
import { currentUserId } from "@/lib/auth";
import { DOLLAR_TYPES, getDollarType, todayRates } from "@/lib/dollar";
import { currentMonth, money, monthName } from "@/lib/format";
import { availableMonths } from "@/lib/queries";

const METHOD_TYPES = { efectivo: "Efectivo", debito: "Débito", transferencia: "Transferencia", credito: "Crédito" };

function CategoryFields({ category }: { category?: typeof categories.$inferSelect }) {
  return (
    <>
      {category && <input type="hidden" name="id" value={category.id} />}
      <Field label="Nombre">
        <input name="name" required defaultValue={category?.name} autoComplete="off" className="input" />
      </Field>
    </>
  );
}

function MethodFields({ method }: { method?: typeof paymentMethods.$inferSelect }) {
  return (
    <>
      {method && <input type="hidden" name="id" value={method.id} />}
      <Field label="Nombre">
        <input name="name" required defaultValue={method?.name} autoComplete="off" className="input" />
      </Field>
      <Field label="Tipo">
        <select name="type" defaultValue={method?.type ?? "credito"} className="input">
          {Object.entries(METHOD_TYPES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

export default async function SettingsPage() {
  const userId = await currentUserId();
  const [cats, methods, dollarType, rates, months] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(eq(categories.userId, userId))
      .orderBy(asc(categories.archived), asc(categories.sortOrder), asc(categories.name)),
    db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.userId, userId))
      .orderBy(asc(paymentMethods.archived), asc(paymentMethods.id)),
    getDollarType(userId),
    todayRates(),
    availableMonths(userId),
  ]);

  const edit = (title: string, children: React.ReactNode) => <EditSheet title={title}>{children}</EditSheet>;

  return (
    <>
      <PageTitle title="Ajustes" />

      <SectionTitle
        action={
          <Sheet title="Nueva categoría" triggerLabel="Agregar categoría" triggerClassName="flex h-8 w-8 cursor-pointer items-center justify-center text-muted" trigger={<Plus size={18} />}>
            <ActionForm action={saveCategory} resetOnSuccess>
              <CategoryFields />
            </ActionForm>
          </Sheet>
        }
      >
        Categorías
      </SectionTitle>
      <div className="card py-1">
        {cats.map((c) => (
          <div key={c.id} className={`row min-h-13 py-1! ${c.archived ? "opacity-50" : ""}`}>
            <div className="min-w-0 flex-1">
              <p className="truncate">{c.name}</p>
              {c.archived && <p className="text-xs text-muted">Archivada</p>}
            </div>
            {edit(
              `Editar ${c.name}`,
              <>
                <ActionForm action={saveCategory}>
                  <CategoryFields category={c} />
                </ActionForm>
                <ActionButton action={toggleCategoryArchived} fields={{ id: c.id }} className="btn mt-2 w-full">
                  {c.archived ? "Reactivar" : "Archivar"}
                </ActionButton>
              </>,
            )}
          </div>
        ))}
      </div>

      <SectionTitle
        action={
          <Sheet title="Nuevo medio de pago" triggerLabel="Agregar medio de pago" triggerClassName="flex h-8 w-8 cursor-pointer items-center justify-center text-muted" trigger={<Plus size={18} />}>
            <ActionForm action={saveMethod} resetOnSuccess>
              <MethodFields />
            </ActionForm>
          </Sheet>
        }
      >
        Medios de pago
      </SectionTitle>
      <div className="card py-1">
        {methods.map((m) => (
          <div key={m.id} className={`row py-1! ${m.archived ? "opacity-50" : ""}`}>
            <div className="min-w-0 flex-1">
              <p className="truncate">{m.name}</p>
              <p className="text-xs text-muted">{m.archived ? "Archivado" : METHOD_TYPES[m.type]}</p>
            </div>
            {edit(
              `Editar ${m.name}`,
              <>
                <ActionForm action={saveMethod}>
                  <MethodFields method={m} />
                </ActionForm>
                <ActionButton action={toggleMethodArchived} fields={{ id: m.id }} className="btn mt-2 w-full">
                  {m.archived ? "Reactivar" : "Archivar"}
                </ActionButton>
              </>,
            )}
          </div>
        ))}
      </div>

      <SectionTitle>Cotización del dólar</SectionTitle>
      <div className="card">
        <ActionForm action={saveDollarType} submitLabel="Guardar tipo de dólar" pendingLabel="Guardando…">
          <Field label="Tipo de dólar para convertir a pesos">
            <select name="dollarType" defaultValue={dollarType} className="input">
              {Object.entries(DOLLAR_TYPES).map(([value, label]) => {
                const rate = rates[value as keyof typeof DOLLAR_TYPES];
                return (
                  <option key={value} value={value}>
                    {label}
                    {rate ? ` · hoy ${money(Math.round(rate * 100))}` : ""}
                  </option>
                );
              })}
            </select>
          </Field>
          {Object.keys(rates).length === 0 && (
            <p role="status" className="text-xs text-warn">
              No pude obtener las cotizaciones de hoy. Si cargás algo en dólares, vas a poder escribir la cotización a mano.
            </p>
          )}
          <p className="text-xs text-muted">
            Se usa la cotización del día de cada movimiento: venta en los gastos y compra en los ingresos. Lo que ya está cargado conserva su cotización.
          </p>
        </ActionForm>
      </div>

      <SectionTitle>Backup</SectionTitle>
      <form method="get" action="/api/export/excel" className="card space-y-3">
        <Field label="¿Qué querés descargar?">
          <select name="mes" defaultValue={currentMonth()} className="input">
            {[...months].reverse().map((m) => (
              <option key={m} value={m}>
                {monthName(m).replace(/^./, (c) => c.toUpperCase())}
              </option>
            ))}
            <option value="todos">Todos los meses</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <button type="submit" formAction="/api/export/excel" className="btn">
            <Download size={16} /> Excel
          </button>
          <button type="submit" formAction="/api/export/csv" className="btn">
            <Download size={16} /> CSV
          </button>
        </div>
        <p className="text-xs text-muted">
          El Excel de un mes trae gastos, ingresos y cuotas de ese mes. Con &quot;Todos los meses&quot; suma fijos, deudas y wishlist. El CSV trae solo gastos.
        </p>
      </form>
    </>
  );
}
