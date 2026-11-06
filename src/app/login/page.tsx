import type { Metadata } from "next";
import { enterAsGuest, login } from "@/app/actions";
import { ActionForm, Field } from "@/components/forms";
import { guestModeEnabled } from "@/lib/guest";

export const metadata: Metadata = { title: "Entrar · Nightspend" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Nightspend</h1>
        <ActionForm action={login} submitLabel="Entrar" pendingLabel="Entrando…">
          <Field label="Contraseña">
            <input
              type="password"
              name="password"
              required
              autoFocus
              autoComplete="current-password"
              className="input"
            />
          </Field>
        </ActionForm>

        {guestModeEnabled() && (
          <section className="mt-6 border-t border-line pt-6">
            <ActionForm
              action={enterAsGuest}
              submitLabel="Entrar como invitado"
              pendingLabel="Preparando la demo…"
              submitClassName="btn w-full"
            >
              <p className="text-sm text-muted">
                Probá la app con datos ficticios. Podés cargar y borrar lo que quieras: es solo para vos y se elimina a las 24 horas.
              </p>
            </ActionForm>
          </section>
        )}
      </div>
    </main>
  );
}
