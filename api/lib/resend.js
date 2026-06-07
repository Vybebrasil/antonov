import { Resend } from 'resend';

const SITE_URL = 'https://www.antonovcenter.com.br';
const LOGO_URL = `${SITE_URL}/assets/logo-211.png`;
const DEFAULT_TO = 'contato@antonovcenter.com';
const WHATSAPP = '+55 74 99963-1507';
const WHATSAPP_URL = 'https://wa.me/5574999631507';
const INSTAGRAM_URL = 'https://www.instagram.com/antonovcenter';

const BRAND = {
  yellow: '#FAB10F',
  blue: '#2A8FD6',
  ink: '#0E0E10',
  carbon: '#131316',
  bg: '#EEEAE2',
  soft: '#323234',
  mute: '#56565A',
};

const FIELD_LABELS = {
  nome: 'Nome',
  email: 'E-mail',
  telefone: 'WhatsApp',
  interesse: 'Interesse',
  area: 'Área de interesse',
  disponibilidade: 'Disponibilidade',
  melhor_dia: 'Melhor dia',
  melhor_turno: 'Melhor turno',
  mensagem: 'Mensagem',
  page: 'Origem',
};

const CONFIRMATIONS = {
  contato: {
    eyebrow: '/ CONTATO',
    subject: (nome) => `${firstName(nome)}, recebemos sua mensagem ✈`,
    title: (nome) => `Fala, ${firstName(nome)}.`,
    lead: (fields) =>
      `Sua mensagem chegou na tripulação Antonov. Anotamos seu interesse em **${fields.interesse || 'treino e performance'}** e vamos retornar em breve.`,
    nextSteps: [
      'Nossa equipe responde em horário comercial (segunda a sexta, 5h às 23h).',
      'Se preferir agilizar, fale direto pelo WhatsApp.',
    ],
    summaryKeys: ['interesse', 'melhor_dia', 'melhor_turno', 'telefone', 'mensagem'],
    cta: { label: 'Falar no WhatsApp', href: WHATSAPP_URL },
  },
  curriculos: {
    eyebrow: '/ TRABALHE CONOSCO',
    subject: (nome) => `${firstName(nome)}, candidatura recebida ✈`,
    title: (nome) => `Obrigado, ${firstName(nome)}.`,
    lead: (fields) =>
      `Recebemos sua candidatura para **${fields.area || 'nossa equipe'}**. Seu perfil entra na fila de análise da Antonov Center.`,
    nextSteps: [
      'Entraremos em contato se houver fit com a vaga.',
      'Guarde este e-mail como comprovante de envio.',
    ],
    summaryKeys: ['area', 'disponibilidade', 'telefone', 'mensagem'],
    cta: { label: 'Conhecer a Antonov', href: `${SITE_URL}/planos` },
  },
  preMatricula: {
    eyebrow: '/ PRÉ-INAUGURAÇÃO',
    subject: (nome) => `${firstName(nome)}, você está na lista VIP ✈`,
    title: (nome) => `Prioridade confirmada, ${firstName(nome)}.`,
    lead: (fields) =>
      `Seu pré-cadastro de inauguração foi confirmado. Você entrou na lista com foco em **${fields.interesse || 'performance'}** e avisaremos em primeira mão.`,
    nextSteps: [
      'Fique de olho no e-mail e WhatsApp para novidades da abertura.',
      'Vagas de inauguração são limitadas.',
    ],
    summaryKeys: ['interesse', 'telefone', 'mensagem'],
    cta: { label: 'Ver planos First Class', href: `${SITE_URL}/planos` },
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

function formatBoldMarkdown(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong style="color:#0E0E10;">$1</strong>');
}

function getFrom() {
  return process.env.RESEND_FROM || 'Antonov Center <contato@antonovcenter.com>';
}

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

function pickFields(fields, keys) {
  return keys
    .filter((key) => fields[key] != null && String(fields[key]).trim() !== '')
    .map((key) => [key, fields[key]]);
}

function buildSummaryHtml(entries) {
  if (!entries.length) return '';

  const rows = entries
    .map(
      ([key, value]) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #E8E4DC;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.mute};width:38%;vertical-align:top;">
          ${escapeHtml(FIELD_LABELS[key] || key)}
        </td>
        <td style="padding:12px 0 12px 16px;border-bottom:1px solid #E8E4DC;font-size:15px;line-height:1.5;color:${BRAND.ink};vertical-align:top;">
          ${escapeHtml(value).replace(/\n/g, '<br />')}
        </td>
      </tr>`
    )
    .join('');

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0 0;border-collapse:collapse;">
      <tr>
        <td style="padding:16px 18px;background:${BRAND.bg};border-radius:12px;border:1px solid rgba(0,0,0,0.06);">
          <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${BRAND.mute};">Resumo do envio</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${rows}</table>
        </td>
      </tr>
    </table>`;
}

function buildStepsHtml(steps) {
  if (!steps?.length) return '';

  const items = steps
    .map(
      (step) => `
      <tr>
        <td style="padding:0 0 10px 0;font-size:14px;line-height:1.55;color:${BRAND.soft};">
          <span style="display:inline-block;width:8px;height:8px;background:${BRAND.blue};border-radius:50%;margin-right:10px;vertical-align:middle;"></span>
          ${escapeHtml(step)}
        </td>
      </tr>`
    )
    .join('');

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0 0;border-collapse:collapse;">
      ${items}
    </table>`;
}

function buildCtaButton({ label, href }, secondary = false) {
  const bg = secondary ? 'transparent' : BRAND.yellow;
  const color = secondary ? BRAND.blue : BRAND.ink;
  const border = secondary ? `2px solid ${BRAND.blue}` : 'none';

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:${secondary ? '12px' : '28px'} 0 0;border-collapse:collapse;">
      <tr>
        <td style="border-radius:999px;background:${bg};border:${border};">
          <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 24px;font-size:14px;font-weight:600;letter-spacing:0.04em;text-decoration:none;color:${color};">
            ${escapeHtml(label)} →
          </a>
        </td>
      </tr>
    </table>`;
}

function wrapEmail({
  preheader,
  eyebrow,
  title,
  bodyHtml,
  summaryHtml = '',
  stepsHtml = '',
  ctaHtml = '',
  footerNote = 'Antonov Center · Av. 1º de Janeiro, Irecê, BA',
}) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>Antonov Center</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${BRAND.ink};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.bg};border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:32px 16px 40px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;border-collapse:collapse;">
          <tr>
            <td style="background:${BRAND.carbon};border-radius:16px 16px 0 0;padding:0;overflow:hidden;">
              <div style="height:4px;background:linear-gradient(90deg,${BRAND.blue},${BRAND.yellow});"></div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                <tr>
                  <td style="padding:24px 28px 8px;">
                    <img src="${LOGO_URL}" width="160" height="46" alt="Antonov Center" style="display:block;border:0;height:auto;max-width:160px;" />
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 28px 24px;">
                    <p style="margin:0;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.55);">${escapeHtml(eyebrow)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#FFFFFF;padding:32px 28px 28px;border-left:1px solid rgba(0,0,0,0.06);border-right:1px solid rgba(0,0,0,0.06);">
              <h1 style="margin:0 0 16px;font-size:32px;line-height:1.08;letter-spacing:-0.02em;text-transform:uppercase;font-family:Impact,'Arial Narrow Bold',sans-serif;color:${BRAND.ink};">
                ${escapeHtml(title)}
              </h1>
              <div style="font-size:16px;line-height:1.65;color:${BRAND.soft};">${bodyHtml}</div>
              ${summaryHtml}
              ${stepsHtml}
              ${ctaHtml}
            </td>
          </tr>
          <tr>
            <td style="background:${BRAND.carbon};border-radius:0 0 16px 16px;padding:22px 28px;border:1px solid rgba(0,0,0,0.08);border-top:none;">
              <p style="margin:0 0 12px;font-size:12px;line-height:1.5;color:rgba(255,255,255,0.72);">${escapeHtml(footerNote)}</p>
              <p style="margin:0;font-size:12px;line-height:1.8;">
                <a href="${WHATSAPP_URL}" style="color:${BRAND.yellow};text-decoration:none;">WhatsApp</a>
                <span style="color:rgba(255,255,255,0.35);"> · </span>
                <a href="mailto:contato@antonovcenter.com" style="color:${BRAND.yellow};text-decoration:none;">contato@antonovcenter.com</a>
                <span style="color:rgba(255,255,255,0.35);"> · </span>
                <a href="${INSTAGRAM_URL}" style="color:${BRAND.yellow};text-decoration:none;">Instagram</a>
                <span style="color:rgba(255,255,255,0.35);"> · </span>
                <a href="${SITE_URL}" style="color:${BRAND.yellow};text-decoration:none;">Site</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildNotificationHtml({ formType, fields }) {
  const entries = Object.entries(fields).filter(
    ([, value]) => value != null && String(value).trim() !== ''
  );
  const nome = fields.nome || 'Novo lead';
  const telDigits = String(fields.telefone || '').replace(/\D/g, '');
  const waHref = telDigits ? `https://wa.me/55${telDigits.replace(/^55/, '')}` : WHATSAPP_URL;
  const mailHref = fields.email ? `mailto:${fields.email}` : 'mailto:contato@antonovcenter.com';

  const summaryHtml = buildSummaryHtml(entries);
  const bodyHtml = `<p style="margin:0 0 4px;font-size:15px;line-height:1.6;">
    Novo envio pelo site em <strong style="color:${BRAND.ink};">${escapeHtml(formType)}</strong>.
  </p>
  <p style="margin:0;font-size:14px;color:${BRAND.mute};">
    Lead: <strong style="color:${BRAND.ink};">${escapeHtml(nome)}</strong>
  </p>`;

  const ctaHtml =
    buildCtaButton({ label: 'Responder por e-mail', href: mailHref }) +
    buildCtaButton({ label: 'Abrir WhatsApp', href: waHref }, true);

  return wrapEmail({
    preheader: `Novo lead: ${nome} | ${formType}`,
    eyebrow: '/ NOVO LEAD',
    title: formType.toUpperCase(),
    bodyHtml,
    summaryHtml,
    ctaHtml,
    footerNote: 'Notificação interna · Formulário do site Antonov Center',
  });
}

function buildNotificationText({ formType, fields }) {
  const lines = Object.entries(fields)
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .map(([key, value]) => `${FIELD_LABELS[key] || key}: ${value}`);

  return [`Antonov Center | ${formType}`, '', ...lines].join('\n');
}

function buildConfirmationHtml({ nome, fields, confirmationType }) {
  const template = CONFIRMATIONS[confirmationType];
  if (!template) return '';

  const lead = formatBoldMarkdown(template.lead(fields));
  const bodyHtml = `<p style="margin:0;">${lead}</p>`;
  const summaryHtml = buildSummaryHtml(pickFields(fields, template.summaryKeys));
  const stepsHtml = buildStepsHtml(template.nextSteps);
  const ctaHtml = template.cta ? buildCtaButton(template.cta) : '';

  return wrapEmail({
    preheader: template.subject(nome).replace('✈', '').trim(),
    eyebrow: template.eyebrow,
    title: template.title(nome),
    bodyHtml,
    summaryHtml,
    stepsHtml,
    ctaHtml,
    footerNote: 'Academia premium em Irecê · Projetado para decolar.',
  });
}

function buildConfirmationText({ nome, fields, confirmationType }) {
  const template = CONFIRMATIONS[confirmationType];
  if (!template) return '';

  const summary = pickFields(fields, template.summaryKeys)
    .map(([key, value]) => `${FIELD_LABELS[key] || key}: ${value}`)
    .join('\n');

  return [
    template.title(nome),
    '',
    template.lead(fields).replace(/\*\*/g, ''),
    '',
    ...(template.nextSteps || []).map((s) => `• ${s}`),
    '',
    summary ? `Resumo:\n${summary}` : '',
    '',
    `WhatsApp: ${WHATSAPP}`,
    'E-mail: contato@antonovcenter.com',
    SITE_URL,
  ]
    .filter(Boolean)
    .join('\n');
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
  const nome = fields.nome ? String(fields.nome).trim() : '';
  const personalizedSubject = nome ? `${subject.replace(' |', '')} · ${nome}` : subject;

  const payload = {
    from: getFrom(),
    to: [to],
    subject: personalizedSubject,
    html: buildNotificationHtml({ formType, fields }),
    text: buildNotificationText({ formType, fields }),
  };

  if (replyTo) payload.replyTo = replyTo;

  return sendEmail(payload);
}

export async function sendLeadConfirmation({ nome, email, confirmationType, fields = {} }) {
  if (!isResendConfigured()) return null;

  const template = CONFIRMATIONS[confirmationType];
  if (!template) return null;

  const recipient = String(email || fields.email || '').trim().toLowerCase();
  if (!recipient) return null;

  const safeNome = nome || fields.nome || '';

  return sendEmail({
    from: getFrom(),
    to: [recipient],
    subject: template.subject(safeNome),
    html: buildConfirmationHtml({ nome: safeNome, fields, confirmationType }),
    text: buildConfirmationText({ nome: safeNome, fields, confirmationType }),
  });
}

export async function sendLeadEmails(notify) {
  await sendLeadNotification(notify);

  if (notify.confirmationType && notify.fields?.email) {
    await sendLeadConfirmation({
      nome: notify.fields.nome,
      email: notify.fields.email,
      confirmationType: notify.confirmationType,
      fields: notify.fields,
    });
  }
}
