import type { Metadata } from "next";
import { register } from "@/app/actions";
import { AuthLink, AuthShell } from "@/components/auth-shell";
import { ActionForm, Field } from "@/components/forms";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

export const metadata: Metadata = { title: "Crear cuenta · Nightspend" };
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <AuthShell title="Crear cuenta">
      <ActionForm action={register} submitLabel="Crear cuenta" pendingLabel="Creando tu cuenta…">
        <Field label="Email">
          <input type="email" name="email" required autoFocus autoComplete="email" className="input" />
        </Field>
        <Field label={`Contraseña (mínimo ${MIN_PASSWORD_LENGTH} caracteres)`}>
          <input
            type="password"
            name="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            className="input"
          />
        </Field>
      </ActionForm>
      <div className="mt-2">
        <AuthLink href="/login">Ya tengo cuenta</AuthLink>
      </div>
    </AuthShell>
  );
}
