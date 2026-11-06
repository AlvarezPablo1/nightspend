import { logout } from "@/app/actions";
import { Nav } from "@/components/nav";
import { requireSession } from "@/lib/auth";
import { today } from "@/lib/format";
import { activeCategories, activeMethods, debtPeople, expenseSuggestions } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const [categories, methods, suggestions, people] = await Promise.all([
    activeCategories(),
    activeMethods(),
    expenseSuggestions(),
    debtPeople(),
  ]);
  const options = {
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    methods: methods.map((m) => ({ id: m.id, name: m.name, type: m.type })),
    suggestions,
    today: today(),
    people,
  };
  return (
    <>
      <Nav options={options} />
      <main className="mx-auto w-full max-w-3xl px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(88px+env(safe-area-inset-bottom))] md:pb-12 md:pl-64 md:pr-8 md:max-w-none">
        <div className="mx-auto max-w-3xl">
          {session.role === "guest" && (
            <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
              <p className="text-muted">
                <span className="font-medium text-ink">Modo invitado.</span> Datos ficticios, se borran a las 24 horas.
              </p>
              <form action={logout}>
                <button type="submit" className="min-h-9 shrink-0 cursor-pointer px-1 text-ink underline">
                  Salir
                </button>
              </form>
            </div>
          )}
          {children}
        </div>
      </main>
    </>
  );
}
