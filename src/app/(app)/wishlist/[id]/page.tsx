import { asc, eq } from "drizzle-orm";
import { Check, ChevronLeft, ExternalLink, ShoppingBag, Trash2, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addWishStep,
  deleteWishItem,
  deleteWishStep,
  purchaseWishItem,
  saveWishItem,
  toggleWishStep,
} from "@/app/actions";
import { ExpenseForm } from "@/components/expense-form";
import { ActionButton, ActionForm, EditSheet, Field, Sheet } from "@/components/forms";
import { WishFields } from "@/components/wish-fields";
import { Empty, Progress, SectionTitle } from "@/components/ui";
import { db } from "@/db";
import { wishItems, wishProjects, wishSteps } from "@/db/schema";
import { money, moneyInput, shortDate, today } from "@/lib/format";
import { activeCategories, activeMethods } from "@/lib/queries";

export default async function WishItemPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [[item], steps, projects, categories, methods] = await Promise.all([
    db.select().from(wishItems).where(eq(wishItems.id, id)),
    db.select().from(wishSteps).where(eq(wishSteps.itemId, id)).orderBy(asc(wishSteps.sortOrder), asc(wishSteps.id)),
    db.select().from(wishProjects).orderBy(asc(wishProjects.sortOrder)),
    activeCategories(),
    activeMethods(),
  ]);
  if (!item) notFound();

  const done = steps.filter((s) => s.done).length;
  const project = projects.find((p) => p.id === item.projectId);

  return (
    <>
      <Link href="/wishlist" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted">
        <ChevronLeft size={18} /> Wishlist
      </Link>
      {/* Tocar el nombre, el ahorro o las notas abre la edición. */}
      <div className="relative">
        <EditSheet title="Editar deseo">
          <ActionForm action={saveWishItem}>
            <WishFields projects={projects} item={item} />
          </ActionForm>
          <ActionButton
            action={deleteWishItem}
            fields={{ id: item.id }}
            confirm="Tocá de nuevo para borrar"
            className="btn mt-2 w-full text-bad"
          >
            <Trash2 size={16} /> Borrar
          </ActionButton>
        </EditSheet>
        <div className="mb-5 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {project ? `${project.name} · ` : ""}Prioridad {item.priority}
          </p>
        </div>

        {item.estimatedPrice != null && (
          <div className="card mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Ahorrado</span>
              <span className="num">
                {money(item.saved, item.currency)} / {money(item.estimatedPrice, item.currency)}
              </span>
            </div>
            <div className="mt-2">
              <Progress value={item.saved / item.estimatedPrice} />
            </div>
          </div>
        )}

        {item.note && <p className="mb-3 text-sm whitespace-pre-wrap text-muted">{item.note}</p>}
      </div>
      {item.link && (
        <a href={item.link} target="_blank" rel="noopener noreferrer" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-accent">
          <ExternalLink size={15} /> Ver link
        </a>
      )}

      <SectionTitle>
        Paso a paso{steps.length > 0 && ` · ${done} de ${steps.length}`}
      </SectionTitle>
      <div className="card py-1">
        {steps.length === 0 && <Empty>Agregá los pasos: comparar precios, ahorrar, comprar…</Empty>}
        {steps.map((step) => (
          <div key={step.id} className="row py-1!">
            <ActionButton
              action={toggleWishStep}
              fields={{ id: step.id }}
              label={step.done ? `Desmarcar ${step.text}` : `Marcar ${step.text}`}
              className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                  step.done ? "border-accent bg-accent text-white" : "border-line"
                }`}
              >
                {step.done && <Check size={14} />}
              </span>
              <span className={step.done ? "text-muted line-through" : ""}>{step.text}</span>
            </ActionButton>
            <ActionButton
              action={deleteWishStep}
              fields={{ id: step.id }}
              confirm="¿Borrar?"
              label={`Borrar ${step.text}`}
              pendingLabel={null}
              className="flex h-11 min-w-8 shrink-0 cursor-pointer items-center justify-center text-xs text-muted"
            >
              <X size={15} />
            </ActionButton>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <ActionForm action={addWishStep} resetOnSuccess submitLabel="Agregar paso" pendingLabel="Agregando…" className="space-y-2">
          <input type="hidden" name="id" value={item.id} />
          <Field label="Nuevo paso">
            <input name="text" required autoComplete="off" className="input" />
          </Field>
        </ActionForm>
      </div>

      <div className="mt-8">
        {item.purchasedOn ? (
          <p className="text-center text-sm text-good">
            Comprado el {shortDate(item.purchasedOn)}
            {item.purchasedExpenseId && (
              <>
                {" · "}
                <Link href={`/gastos/${item.purchasedExpenseId}`} className="underline">
                  Ver gasto
                </Link>
              </>
            )}
          </p>
        ) : (
          <Sheet
            title="Registrar la compra"
            triggerClassName="btn btn-primary w-full"
            trigger={
              <>
                <ShoppingBag size={18} /> Ya lo compré
              </>
            }
          >
            <p className="mb-4 text-sm text-muted">Se va a crear el gasto y este deseo pasa a Comprados.</p>
            <ExpenseForm
              action={purchaseWishItem}
              hiddenId={item.id}
              submitLabel="Registrar compra"
              options={{ categories, methods, suggestions: [], today: today() }}
              initial={{
                description: item.name,
                amount: moneyInput(item.estimatedPrice),
                currency: item.currency,
              }}
            />
          </Sheet>
        )}
      </div>
    </>
  );
}
