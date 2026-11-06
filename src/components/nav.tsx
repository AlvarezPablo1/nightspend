"use client";

import { BarChart3, Home, LogOut, Menu, Plus, Receipt } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";
import { MORE_LINKS } from "@/lib/more-links";
import { ExpenseForm, type ExpenseOptions } from "./expense-form";
import { Sheet } from "./forms";

const MAIN = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/gastos", label: "Gastos", icon: Receipt },
  { href: "/estadisticas", label: "Estadísticas", icon: BarChart3 },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Nav({ options }: { options: ExpenseOptions }) {
  const pathname = usePathname();
  const moreActive = pathname === "/mas" || MORE_LINKS.some((l) => isActive(pathname, l.href));

  const tab = (href: string, label: string, Icon: typeof Home, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
        active ? "text-ink" : "text-muted"
      }`}
    >
      <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
      {label}
    </Link>
  );

  return (
    <>
      {/* Compu: barra lateral */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line p-4 md:flex">
        <p className="mb-5 px-3 pt-2 text-lg font-semibold">Nightspend</p>
        <Sheet
          title="Nuevo gasto"
          triggerClassName="btn btn-primary mb-4 w-full"
          trigger={
            <>
              <Plus size={18} /> Nuevo gasto
            </>
          }
        >
          <ExpenseForm options={options} allowOtherOwner />
        </Sheet>
        <nav className="flex flex-1 flex-col gap-0.5">
          {[...MAIN, ...MORE_LINKS].map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-[15px] ${
                  active ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"
                }`}
              >
                <Icon size={18} /> {label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => logout()}
          className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-[15px] text-muted hover:text-ink"
        >
          <LogOut size={18} /> Salir
        </button>
      </aside>

      {/* Celular: barra inferior con el + al medio */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {tab("/", "Inicio", Home, pathname === "/")}
        {tab("/gastos", "Gastos", Receipt, isActive(pathname, "/gastos"))}
        <div className="flex flex-1 justify-center">
          <Sheet
            title="Nuevo gasto"
            triggerLabel="Nuevo gasto"
            triggerClassName="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-primary text-white"
            trigger={<Plus size={24} />}
          >
            <ExpenseForm options={options} allowOtherOwner />
          </Sheet>
        </div>
        {tab("/estadisticas", "Stats", BarChart3, isActive(pathname, "/estadisticas"))}
        {tab("/mas", "Más", Menu, moreActive)}
      </nav>
    </>
  );
}
