import { Resend } from 'resend';

const DEFAULT_TO = 'contato@antonovcenter.com';
const WHATSAPP = '+55 74 99963-1507';
const WHATSAPP_URL = 'https://wa.me/5574999631507';

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

const CONFIRMATIONS = {
  contato: {
    subject: 'Recebemos sua mensagem — Antonov Center',
    title: 'Mensagem recebida',
    body: (nome) =>
      `Recebemos sua mensagem pelo formulário de contato do site. Nossa equipe analisa e retorna em breve, em horário comercial.`,
  },
  curriculos: {
    subject: 'Candidatura recebida — Antonov Center',
    title: 'Candidatura recebida',
    body: (nome) =>
      `Recebemos sua candidatura pelo site. Se o seu perfil avançar no processo seletivo, entraremos em contato pelo e-mail ou WhatsApp informados.`,
  },
  preMatricula: {
    subject: 'Pré-cadastro confirmado — Antonov Center',
    title: 'Pré-cadastro confirmado',
    body: (nome) =>
      `Confirmamos o recebimento do seu pré-cadastro de inauguração. Você está na lista de prioridade e avisaremos sobre novidades em primeira mão.`,
  },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstName(nome) {
  const part = String(nome || '').trim().split(/\s+/)[0];
  return part || 'Olá';
}

function getFrom() {
  return process.env.RESEND_FROM || 'Antonov Center <contato@antonovcenter.com>';
}

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
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

function buildConfirmationHtml({ nome, title, message }) {
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#EEEAE2;font-family:system-ui,sans-serif;color:#0E0E10;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px 24px;border:1px solid rgba(0,0,0,0.08);">
      <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#56565A;">Antonov Center · Irecê, BA</p>
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;">${escapeHtml(title)}</h1>
      <p style="margin:0 0 14px;font-size:16px;line-height:1.55;">Olá, <strong>${escapeHtml(firstName(nome))}</strong>.</p>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#323234;">${escapeHtml(message)}</p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#56565A;">Precisa falar agora?</p>
      <p style="margin:0;font-size:14px;line-height:1.6;">
        <a href="${WHATSAPP_URL}" style="color:#2A8FD6;text-decoration:none;">WhatsApp ${WHATSAPP}</a><br />
        <a href="mailto:contato@antonovcenter.com" style="color:#2A8FD6;text-decoration:none;">contato@antonovcenter.com</a>
      </p>
    </div>
  </body>
</html>`;
}

function buildConfirmationText({ nome, title, message }) {
  return [
    `Antonov Center — ${title}`,
    '',
    `Olá, ${firstName(nome)}.`,
    '',
    message,
    '',
    `WhatsApp: ${WHATSAPP}`,
    'E-mail: contato@antonovcenter.com',
  ].join('\n');
}

export function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

async function sendEmail(payload) {
  const { data, error } = await getResend().emails.send(payload);
  if (error) throw new Error(error.message || 'Falha ao enviar e-mail.');
  return data;
}

export async function sendLeadNotification({ subject, formType, fields }) {
  if (!isResendConfigured()) return null;

  const to = process.env.RESEND_TO || DEFAULT_TO;
  const replyTo = fields.email ? String(fields.email).trim() : undefined;

  const payload = {
    from: getFrom(),
    to: [to],
    subject,
    html: buildHtml({ formType, fields }),
    text: buildText({ formType, fields }),
  };

  if (replyTo) payload.replyTo = replyTo;

  return sendEmail(payload);
}

export async function sendLeadConfirmation({ nome, email, confirmationType }) {
  if (!isResendConfigured()) return null;

  const template = CONFIRMATIONS[confirmationType];
  if (!template) return null;

  const recipient = String(email || '').trim().toLowerCase();
  if (!recipient) return null;

  const message = template.body(nome);

  return sendEmail({
    from: getFrom(),
    to: [recipient],
    subject: template.subject,
    html: buildConfirmationHtml({ nome, title: template.title, message }),
    text: buildConfirmationText({ nome, title: template.title, message }),
  });
}

export async function sendLeadEmails(notify) {
  await sendLeadNotification(notify);

  if (notify.confirmationType && notify.fields?.email) {
    await sendLeadConfirmation({
      nome: notify.fields.nome,
      email: notify.fields.email,
      confirmationType: notify.confirmationType,
    });
  }
}
