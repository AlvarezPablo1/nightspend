type Mail = {
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: string }[];
};

/**
 * Envía con Resend. La dirección de prueba de Resend solo llega al dueño de la cuenta:
 * para escribirle a cualquier usuario hace falta un dominio verificado en BACKUP_FROM.
 */
export async function sendMail(mail: Mail) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false as const, reason: "sin-configurar" as const };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      from: process.env.BACKUP_FROM ?? "Nightspend <onboarding@resend.dev>",
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      attachments: mail.attachments,
    }),
  });
  if (!response.ok) {
    console.error("No se pudo enviar el mail", mail.subject, response.status, await response.text());
    return { ok: false as const, reason: "error" as const };
  }
  return { ok: true as const };
}
