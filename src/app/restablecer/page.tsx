import type { Metadata } from "next";
import { resetPassword } from "@/app/actions";
import { AuthLink, AuthShell } from "@/components/auth-shell";
import { ActionForm, Field } from "@/components/forms";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

export const metadata: Metadata = { title: "Contraseña nueva · Nightspend", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Contraseña nueva">
      {token ? (
        <ActionForm action={resetPassword} submitLabel="Guardar contraseña" pendingLabel="Guardando…">
          <input type="hidden" name="token" value={token} />
          <Field label={`Contraseña nueva (mínimo ${MIN_PASSWORD_LENGTH} caracteres)`}>
            <input
              type="password"
              name="password"
              required
              autoFocus
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className="input"
            />
          </Field>
        </ActionForm>
      ) : (
        <p className="card text-sm">Este link no es válido. Pedí uno nuevo.</p>
      )}
      <div className="mt-2">
        <AuthLink href="/recuperar">Pedir otro link</AuthLink>
      </div>
    </AuthShell>
  );
}
