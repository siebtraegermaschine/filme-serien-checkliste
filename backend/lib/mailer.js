// Austauschbare Mailer-Abstraktion. MAIL_PROVIDER=console (Default) loggt nur,
// MAIL_PROVIDER=resend verschickt über die Resend-API. Weitere Anbieter lassen
// sich als zusätzlicher Fall in send() ergänzen, ohne Aufrufer anzufassen.

const provider = process.env.MAIL_PROVIDER || 'console';
const from = process.env.MAIL_FROM || 'no-reply@example.com';

async function sendViaConsole({ to, subject, text }) {
  console.log(`[mailer:console] An: ${to} | Betreff: ${subject}\n${text}`);
}

async function sendViaResend({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY fehlt, aber MAIL_PROVIDER=resend ist gesetzt.');
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html: html || `<pre>${text}</pre>`, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend-Versand fehlgeschlagen (${res.status}): ${body}`);
  }
}

export async function sendMail({ to, subject, text, html }) {
  if (provider === 'resend') {
    return sendViaResend({ to, subject, text, html });
  }
  return sendViaConsole({ to, subject, text, html });
}

export async function sendPasswordResetMail({ to, resetUrl }) {
  return sendMail({
    to,
    subject: 'Passwort zurücksetzen – MovieTaste',
    text: `Zum Zurücksetzen deines Passworts, öffne diesen Link (gültig 1 Stunde):\n${resetUrl}\n\nWenn du das nicht angefordert hast, ignoriere diese E-Mail.`,
  });
}
