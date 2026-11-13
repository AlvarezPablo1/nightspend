import Link from "next/link";
import type { ReactNode } from "react";

/** Marco común de las pantallas sin sesión: login, registro y recuperar la contraseña. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
      <div className="w-full max-w-sm">
        <p className="mb-1 text-sm text-muted">Nightspend</p>
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
        {children}
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
