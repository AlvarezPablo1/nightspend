import Link from "next/link";
import type { ReactNode } from "react";
import { Glow } from "./glow";
import { Logo } from "./logo";

const MONTHS = [
  { label: "Jun", value: 52 },
  { label: "Jul", value: 74 },
  { label: "Ago", value: 38 },
  { label: "Sep", value: 66 },
  { label: "Oct", value: 88 },
  { label: "Nov", value: 30 },
];

const CATEGORIES = [
  { name: "Mercadería", percent: 42 },
  { name: "Salidas", percent: 23 },
  { name: "Transporte", percent: 15 },
];

/**
 * Mitad ilustrada de la pantalla en la compu: pedazos de la app con datos ficticios.
 * Es decorativa, así que los lectores de pantalla la saltean.
 */
function AuthArt() {
  return (
    <aside
      aria-hidden="true"
      className="relative isolate hidden overflow-hidden border-r border-line bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12"
    >
      <Glow />

      <div className="relative flex items-center gap-2.5 text-accent">
        <Logo className="h-7 w-7" />
        <span className="text-lg font-semibold text-ink">Nightspend</span>
      </div>

      <div className="relative mx-auto w-full max-w-md">
        {/* Disponible del mes */}
        <div className="card relative z-10 -rotate-2 shadow-2xl shadow-black/40">
          <p className="text-[13px] text-muted">Te queda disponible</p>
          <p className="num mt-1 text-3xl font-semibold tracking-tight">$ 182.450</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full w-[62%] rounded-full bg-primary" />
          </div>
          <p className="mt-2 text-xs text-muted">Gastaste el 62 % de lo que entró este mes</p>
        </div>

        {/* Próximo vencimiento */}
        <div className="relative z-20 mt-[-10px] ml-12 flex rotate-1 items-center gap-3 rounded-xl border border-warn/40 bg-[#2a2216] px-4 py-3 shadow-xl shadow-black/40">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-warn" />
          <div className="min-w-0 flex-1">
            <p className="text-sm">Internet</p>
            <p className="text-xs text-warn">Vence en 2 días</p>
          </div>
          <span className="num text-sm">$ 18.900</span>
        </div>

        {/* Gastos por mes y por categoría */}
        <div className="card relative z-0 mt-4 -ml-6 rotate-[1.5deg] shadow-2xl shadow-black/40">
          <p className="text-[13px] text-muted">Gastos por mes</p>
          <div className="mt-3 flex items-end gap-2.5">
            {MONTHS.map((m, i) => (
              <div key={m.label} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className={`w-7 rounded-md ${i === MONTHS.length - 1 ? "bg-accent" : "bg-primary/60"}`}
                  style={{ height: m.value }}
                />
                <span className="text-[10px] text-muted">{m.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2.5 border-t border-line pt-3">
            {CATEGORIES.map((c) => (
              <div key={c.name}>
                <div className="flex justify-between text-xs">
                  <span>{c.name}</span>
                  <span className="num text-muted">{c.percent} %</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent/80" style={{ width: `${c.percent * 2}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative">
        <p className="text-2xl font-semibold tracking-tight">Tus gastos, en orden.</p>
        <p className="mt-2 max-w-sm text-muted">Sabé cuánto te queda en el mes, qué está por vencer y en qué se va la plata.</p>
      </div>
    </aside>
  );
}

/**
 * Marco común de las pantallas sin sesión: login, registro y recuperar la contraseña.
 * En la compu, la pantalla se parte al medio: la ilustración a la izquierda y el formulario a la derecha.
 */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-2">
      <AuthArt />
      {/* En el celular no entra la ilustración, pero el formulario usa su mismo fondo. */}
      <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-surface p-4 pt-[calc(1rem+env(safe-area-inset-top))] lg:bg-transparent lg:p-12">
        <Glow className="lg:hidden" />
        <div className="relative w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2 text-accent lg:hidden">
            <Logo className="h-6 w-6" />
            <span className="text-sm font-medium text-ink">Nightspend</span>
          </div>
          <h1 className="mb-6 text-2xl font-semibold tracking-tight lg:text-3xl">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center text-sm text-muted underline">
      {children}
    </Link>
  );
}
