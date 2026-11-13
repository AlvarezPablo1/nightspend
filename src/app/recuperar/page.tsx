import type { Metadata } from "next";
import { requestPasswordReset } from "@/app/actions";
import { AuthLink, AuthShell } from "@/components/auth-shell";
import { ActionForm, Field } from "@/components/forms";

export const metadata: Metadata = { title: "Recuperar contraseña · Nightspend" };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ enviado?: string }> }) {
  const sent = (await searchParams).enviado === "1";
  return (
    <AuthShell title="Recuperar contraseña">
      {sent ? (
        <p role="status" className="card text-sm">
          Si hay una cuenta con ese email, te mandamos un link para elegir una contraseña nueva. Vence en una hora. Revisá también
          el correo no deseado.
        </p>
      ) : (
        <ActionForm action={requestPasswordReset} submitLabel="Mandarme el link" pendingLabel="Enviando…">
          <p className="text-sm text-muted">Te mandamos por mail un link para elegir una contraseña nueva.</p>
          <Field label="Email">
            <input type="email" name="email" required autoFocus autoComplete="email" className="input" />
          </Field>
        </ActionForm>
      )}
      <div className="mt-2">
        <AuthLink href="/login">Volver a entrar</AuthLink>
      </div>
    </AuthShell>
  );
}
