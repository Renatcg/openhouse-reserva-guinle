// Cliente pra API do Resend (envio de e-mail transacional/em massa).

const RESEND_API_URL = 'https://api.resend.com/emails';

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

async function sendEmail({ to, subject, html }) {
  if (!isConfigured()) {
    throw new Error('E-mail não configurado. Defina RESEND_API_KEY e RESEND_FROM_EMAIL no .env.');
  }

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: [to],
      subject,
      html,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && data.message) || `Falha ao enviar e-mail (HTTP ${res.status}).`;
    throw new Error(msg);
  }
  return data;
}

module.exports = { isConfigured, sendEmail };
