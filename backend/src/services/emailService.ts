import { env } from "../config.js";

interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BRAND_GREEN = "#007a55";
const BRAND_ACCENT = "#bbf451";

function emailShell(
  title: string,
  bodyHtml: string,
  footer = "Se não criou uma conta ExpenseSnap, pode ignorar este email.",
) {
  return `<!doctype html>
<html lang="pt">
  <body style="margin:0;padding:0;background:#f4f6f4;">
    <div role="presentation" style="background:#f4f6f4;padding:32px 16px;">
      <div
        role="presentation"
        style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e3e8e4;border-radius:16px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;"
      >
        <div style="background:${BRAND_GREEN};padding:24px 32px;">
          <span style="color:${BRAND_ACCENT};font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">ExpenseSnap</span>
        </div>
        <div style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#14201b;">${title}</h1>
          ${bodyHtml}
        </div>
        <div style="padding:20px 32px 28px;border-top:1px solid #eef2ee;color:#8a948d;font-size:12px;line-height:1.5;">
          ${footer}
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export function buildVerificationEmail(params: { name: string; verifyUrl: string }) {
  const firstName = escapeHtml(params.name.split(/\s+/)[0] ?? params.name);
  const verifyUrl = escapeHtml(params.verifyUrl);

  const html = emailShell(
    `Confirme o seu email, ${firstName}`,
    `
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3c4a42;">
            Falta só um passo para ativar a sua conta. Clique no botão abaixo para
            confirmar que este email é seu.
          </p>
          <div style="text-align:center;margin:0 0 24px;">
            <a
              href="${verifyUrl}"
              style="display:inline-block;background:${BRAND_GREEN};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:12px;"
            >Verificar email</a>
          </div>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#8a948d;">
            Ou copie este link para o navegador:<br />
            <a href="${verifyUrl}" style="color:${BRAND_GREEN};word-break:break-all;">${verifyUrl}</a>
          </p>
          <p style="margin:20px 0 0;font-size:13px;color:#8a948d;">Este link expira em 24 horas.</p>
        `,
  );

  const text = [
    `Olá ${params.name},`,
    "",
    "Confirme o seu email para ativar a sua conta ExpenseSnap:",
    params.verifyUrl,
    "",
    "Este link expira em 24 horas.",
    "",
    "Se não criou uma conta ExpenseSnap, pode ignorar este email.",
  ].join("\n");

  return {
    subject: "Confirme o seu email — ExpenseSnap",
    text,
    html,
  };
}

const BREVO_TIMEOUT_MS = 15_000;

export async function sendEmail(email: OutboundEmail): Promise<void> {
  // Sem chave da Brevo não há envio real. Em desenvolvimento o corpo vai para
  // o log (útil para copiar o link). Em produção não se regista o corpo nem o
  // token — os logs do Render não devem vazar links de verificação/reposição.
  if (!env.BREVO_API_KEY) {
    if (env.NODE_ENV === "production") {
      console.info("[email] BREVO_API_KEY ausente — email não enviado.");
      return;
    }
    console.info(
      `[email] BREVO_API_KEY ausente — email não enviado.\n` +
        `  Para: ${email.to}\n` +
        `  Assunto: ${email.subject}\n` +
        `  Corpo (texto):\n${email.text}`,
    );
    return;
  }

  let response: Response;
  try {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: env.EMAIL_FROM_NAME, email: env.EMAIL_FROM_ADDRESS },
        to: [{ email: email.to }],
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
      }),
      signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("A Brevo não respondeu a tempo (15s).");
    }
    throw error;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `A Brevo recusou o email (${response.status}): ${detail.slice(0, 300) || "sem detalhe"}`,
    );
  }
}

export async function sendVerificationEmail(params: {
  name: string;
  email: string;
  token: string;
}): Promise<void> {
  const verifyUrl = `${env.FRONTEND_ORIGIN}/verify-email?token=${encodeURIComponent(params.token)}`;
  const content = buildVerificationEmail({ name: params.name, verifyUrl });
  await sendEmail({ to: params.email, ...content });
}

export function buildPasswordResetEmail(params: { name: string; resetUrl: string }) {
  const firstName = escapeHtml(params.name.split(/\s+/)[0] ?? params.name);
  const resetUrl = escapeHtml(params.resetUrl);

  const html = emailShell(
    `Redefina a sua palavra-passe, ${firstName}`,
    `
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3c4a42;">
            Recebemos um pedido para repor a palavra-passe da sua conta. Clique no
            botão abaixo para escolher uma nova.
          </p>
          <div style="text-align:center;margin:0 0 24px;">
            <a
              href="${resetUrl}"
              style="display:inline-block;background:${BRAND_GREEN};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:12px;"
            >Definir nova palavra-passe</a>
          </div>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#8a948d;">
            Ou copie este link para o navegador:<br />
            <a href="${resetUrl}" style="color:${BRAND_GREEN};word-break:break-all;">${resetUrl}</a>
          </p>
          <p style="margin:20px 0 0;font-size:13px;color:#8a948d;">Este link expira em 1 hora.</p>
        `,
    "Se não pediu a reposição da palavra-passe, pode ignorar este email.",
  );

  const text = [
    `Olá ${params.name},`,
    "",
    "Recebemos um pedido para repor a palavra-passe da sua conta ExpenseSnap:",
    params.resetUrl,
    "",
    "Este link expira em 1 hora.",
    "",
    "Se não pediu a reposição da palavra-passe, pode ignorar este email.",
  ].join("\n");

  return {
    subject: "Redefina a sua palavra-passe — ExpenseSnap",
    text,
    html,
  };
}

export async function sendPasswordResetEmail(params: {
  name: string;
  email: string;
  token: string;
}): Promise<void> {
  const resetUrl = `${env.FRONTEND_ORIGIN}/reset-password?token=${encodeURIComponent(params.token)}`;
  const content = buildPasswordResetEmail({ name: params.name, resetUrl });
  await sendEmail({ to: params.email, ...content });
}
