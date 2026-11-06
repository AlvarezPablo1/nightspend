import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { monthName } from "@/lib/format";

export function PageTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="mb-5 flex min-h-11 items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {action}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-8 mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-medium text-muted">{children}</h2>
      {action}
    </div>
  );
}

/** Flecha de navegación: sin destino queda deshabilitada. */
function NavArrow({ href, label, icon: Icon }: { href?: string; label: string; icon: typeof ChevronLeft }) {
  const className = "flex h-11 w-11 items-center justify-center";
  if (!href) {
    return (
      <span aria-disabled="true" aria-label={label} role="link" className={`${className} text-muted opacity-25`}>
        <Icon size={20} />
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={`${className} text-muted`}>
      <Icon size={20} />
    </Link>
  );
}

/** Navega solo entre los períodos disponibles, salteando los que no tienen datos. */
function PeriodNav({
  value,
  values,
  href,
  label,
  noun,
}: {
  value: string;
  values: string[];
  href: (value: string) => string;
  label: string;
  noun: string;
}) {
  const index = values.indexOf(value);
  const previous = index > 0 ? values[index - 1] : undefined;
  const next = index >= 0 && index < values.length - 1 ? values[index + 1] : undefined;
  return (
    <div className="flex items-center justify-between">
      <NavArrow href={previous && href(previous)} label={`${noun} anterior`} icon={ChevronLeft} />
      <span className="font-medium first-letter:uppercase">{label}</span>
      <NavArrow href={next && href(next)} label={`${noun} siguiente`} icon={ChevronRight} />
    </div>
  );
}

export function MonthNav({
  month,
  months,
  href,
}: {
  month: string;
  months: string[];
  href: (month: string) => string;
}) {
  return <PeriodNav value={month} values={months} href={href} label={monthName(month)} noun="Mes" />;
}

export function YearNav({
  year,
  years,
  href,
}: {
  year: string;
  years: string[];
  href: (year: string) => string;
}) {
  return <PeriodNav value={year} values={years} href={href} label={year} noun="Año" />;
}

export function Tabs({ tabs }: { tabs: { href: string; label: string; active: boolean }[] }) {
  return (
    <div className="mb-4 flex gap-1 rounded-xl border border-line bg-surface p-1">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={`flex min-h-9 flex-1 items-center justify-center rounded-lg text-sm ${
            t.active ? "bg-surface-2 text-ink" : "text-muted"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) {
  return (
    <div className="card min-w-0">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="num mt-1 truncate text-xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Progress({ value, tone = "accent" }: { value: number; tone?: "accent" | "warn" | "bad" | "good" }) {
  const color = { accent: "bg-accent", warn: "bg-warn", bad: "bg-bad", good: "bg-good" }[tone];
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(Math.max(value, 0), 1) * 100}%` }} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}
