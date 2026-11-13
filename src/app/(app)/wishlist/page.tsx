import { asc, eq } from "drizzle-orm";
import { ChevronRight, FolderPlus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { deleteProject, saveProject, saveWishItem } from "@/app/actions";
import { ActionButton, ActionForm, Field, Sheet } from "@/components/forms";
import { WishFields } from "@/components/wish-fields";
import { Empty, PageTitle, Progress, SectionTitle } from "@/components/ui";
import { db } from "@/db";
import { wishItems, wishProjects, wishSteps } from "@/db/schema";
import { currentUserId } from "@/lib/auth";
import { money } from "@/lib/format";

const PRIORITY_ORDER = { alta: 0, media: 1, baja: 2 };

export default async function WishlistPage() {
  const userId = await currentUserId();
  const [projects, items, steps] = await Promise.all([
    db
      .select()
      .from(wishProjects)
      .where(eq(wishProjects.userId, userId))
      .orderBy(asc(wishProjects.sortOrder), asc(wishProjects.id)),
    db.select().from(wishItems).where(eq(wishItems.userId, userId)),
    db.select().from(wishSteps).where(eq(wishSteps.userId, userId)),
  ]);

  const pending = items
    .filter((i) => !i.purchasedOn)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const purchased = items.filter((i) => i.purchasedOn);

  const row = (item: (typeof items)[number]) => {
    const own = steps.filter((s) => s.itemId === item.id);
    const done = own.filter((s) => s.done).length;
    return (
      <Link key={item.id} href={`/wishlist/${item.id}`} className="block py-3 not-first:border-t not-first:border-line">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p>{item.name}</p>
            <p className="truncate text-xs text-muted first-letter:uppercase">
              Prioridad {item.priority}
              {own.length > 0 && ` · ${done} de ${own.length} pasos`}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1">
            <span className="text-right">
              {item.estimatedPrice != null && <span className="num block">{money(item.estimatedPrice, item.currency)}</span>}
              {!item.purchasedOn && (item.estimatedPrice != null || item.saved > 0) && (
                <span className="num block text-xs text-accent-hover">{money(item.saved, item.currency)} ahorrado</span>
              )}
            </span>
            <ChevronRight size={16} className="text-muted" />
          </span>
        </div>
        {own.length > 0 && (
          <div className="mt-2">
            <Progress value={done / own.length} />
          </div>
        )}
      </Link>
    );
  };

  const unassigned = pending.filter((i) => !i.projectId);

  return (
    <>
      <PageTitle
        title="Wishlist"
        action={
          <div className="flex gap-2">
            <Sheet title="Nuevo proyecto" triggerLabel="Agregar proyecto" trigger={<FolderPlus size={18} />}>
              <ActionForm action={saveProject} resetOnSuccess>
                <Field label="Nombre">
                  <input name="name" required autoComplete="off" className="input" placeholder="Vacaciones, Casa…" />
                </Field>
              </ActionForm>
            </Sheet>
            <Sheet title="Nuevo deseo" triggerLabel="Agregar deseo" trigger={<Plus size={18} />}>
              <ActionForm action={saveWishItem} resetOnSuccess>
                <WishFields projects={projects} />
              </ActionForm>
            </Sheet>
          </div>
        }
      />

      {projects.map((project) => {
        const own = pending.filter((i) => i.projectId === project.id);
        return (
          <section key={project.id}>
            <SectionTitle>
              <Sheet
                title={`Editar ${project.name}`}
                triggerLabel={`Editar ${project.name}`}
                triggerClassName="min-h-8 cursor-pointer text-left hover:text-ink"
                trigger={project.name}
              >
                <ActionForm action={saveProject}>
                  <input type="hidden" name="id" value={project.id} />
                  <Field label="Nombre">
                    <input name="name" required defaultValue={project.name} className="input" />
                  </Field>
                </ActionForm>
                <ActionButton
                  action={deleteProject}
                  fields={{ id: project.id }}
                  confirm="Tocá de nuevo para borrar"
                  className="btn mt-2 w-full text-bad"
                >
                  <Trash2 size={16} /> Borrar proyecto (los deseos quedan)
                </ActionButton>
              </Sheet>
            </SectionTitle>
            <div className="card py-1">
              {own.length === 0 && <Empty>Nada por acá todavía.</Empty>}
              {own.map(row)}
            </div>
          </section>
        );
      })}

      {unassigned.length > 0 && (
        <>
          <SectionTitle>Sin proyecto</SectionTitle>
          <div className="card py-1">{unassigned.map(row)}</div>
        </>
      )}

      {purchased.length > 0 && (
        <>
          <SectionTitle>Comprados</SectionTitle>
          <div className="card py-1 opacity-70">{purchased.map(row)}</div>
        </>
      )}
    </>
  );
}
