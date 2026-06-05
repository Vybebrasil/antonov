import { Resend } from 'resend';

const DEFAULT_TO = 'contato@antonovcenter.com';

const FIELD_LABELS = {
  nome: 'Nome',
  email: 'E-mail',
  telefone: 'WhatsApp / telefone',
  interesse: 'Interesse',
  area: 'Área',
  disponibilidade: 'Disponibilidade',
  melhor_dia: 'Melhor dia',
  melhor_turno: 'Melhor turno',
  mensagem: 'Mensagem',
  page: 'Página de origem',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml({ formType, fields }) {
  const rows = Object.entries(fields)
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .map(
      ([key, value]) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#56565A;font-size:13px;vertical-align:top;width:38%;">
            ${escapeHtml(FIELD_LABELS[key] || key)}
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#0E0E10;font-size:14px;vertical-align:top;">
            ${escapeHtml(value).replace(/\n/g, '<br />')}
          </td>
        </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#EEEAE2;font-family:system-ui,sans-serif;color:#0E0E10;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid rgba(0,0,0,0.08);">
      <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#56565A;">Antonov Center</p>
      <h1 style="margin:0 0 20px;font-size:22px;line-height:1.2;">${escapeHtml(formType)}</h1>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
    </div>
  </body>
</html>`;
}

function buildText({ formType, fields }) {
  const lines = Object.entries(fields)
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .map(([key, value]) => `${FIELD_LABELS[key] || key}: ${value}`);

  return [`Antonov Center — ${formType}`, '', ...lines].join('\n');
}

export function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendLeadNotification({ subject, formType, fields }) {
  if (!isResendConfigured()) return null;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM || 'Antonov Center <contato@antonovcenter.com>';
  const to = process.env.RESEND_TO || DEFAULT_TO;
  const replyTo = fields.email ? String(fields.email).trim() : undefined;

  const payload = {
    from,
    to: [to],
    subject,
    html: buildHtml({ formType, fields }),
    text: buildText({ formType, fields }),
  };

  if (replyTo) payload.replyTo = replyTo;

  const { data, error } = await resend.emails.send(payload);
  if (error) throw new Error(error.message || 'Falha ao enviar e-mail.');
  return data;
}
