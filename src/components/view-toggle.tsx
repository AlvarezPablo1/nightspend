"use client";

import { List, Table2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { VIEW_COOKIE, type ExpenseView } from "@/lib/expense-view";

const OPTIONS = [
  { value: "tabla", label: "Tabla", icon: Table2 },
  { value: "lista", label: "Lista", icon: List },
] as const;

/** Recuerda la vista elegida en una cookie, así se mantiene al cambiar de mes. */
export function ViewToggle({ view }: { view: ExpenseView }) {
  const router = useRouter();
  const [, start] = useTransition();

  function choose(value: ExpenseView) {
    document.cookie = `${VIEW_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
    start(() => router.refresh());
  }

  return (
    <div role="group" aria-label="Vista de gastos" className="flex shrink-0 gap-1 rounded-[10px] border border-line bg-surface p-1">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={`Ver como ${label.toLowerCase()}`}
          aria-pressed={view === value}
          onClick={() => choose(value)}
          className={`flex h-9 min-w-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 text-sm md:px-3 ${
            view === value ? "bg-surface-2 text-ink" : "text-muted"
          }`}
        >
          <Icon size={17} />
          <span className="hidden md:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
