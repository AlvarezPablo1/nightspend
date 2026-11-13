import type { Metadata } from "next";
import { enterAsGuest, login } from "@/app/actions";
import { AuthLink, AuthShell } from "@/components/auth-shell";
import { ActionForm, Field } from "@/components/forms";
import { guestModeEnabled } from "@/lib/guest";

export const metadata: Metadata = { title: "Entrar · Nightspend" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <AuthShell title="Entrar">
      <ActionForm action={login} submitLabel="Entrar" pendingLabel="Entrando…">
        <Field label="Email">
          <input type="email" name="email" required autoFocus autoComplete="email" className="input" />
        </Field>
        <Field label="Contraseña">
          <input type="password" name="password" required autoComplete="current-password" className="input" />
        </Field>
      </ActionForm>
      <div className="mt-2 flex flex-wrap justify-between gap-x-4">
        <AuthLink href="/registro">Crear una cuenta</AuthLink>
      </div>

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
    </AuthShell>
  );
}
