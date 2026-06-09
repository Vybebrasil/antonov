import { json, parseBody } from '../../api/lib/admin-http.js';
import { getFormBySlug, getFormFields, validateDynamicPayload } from '../../api/lib/forms.js';
import { getSql } from '../../api/lib/db.js';
import { checkRateLimit, clientIp, hashIp } from '../../api/lib/rate-limit.js';
import { isResendConfigured, sendDynamicFormEmails } from '../../api/lib/resend.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  const slug = String(req.query?.slug || '').trim();
  if (!slug) return json(res, 400, { error: 'Slug inválido.' });

  const hasDb = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  if (!hasDb) return json(res, 500, { error: 'Servidor não configurado.' });

  const body = parseBody(req);
  if (!body) return json(res, 400, { error: 'JSON inválido.' });

  try {
    const form = await getFormBySlug(slug);
    if (!form || form.source_type !== 'dynamic') {
      return json(res, 404, { error: 'Formulário não encontrado.' });
    }

    const allowed = await checkRateLimit(slug, clientIp(req));
    if (!allowed) {
      return json(res, 429, { error: 'Muitas tentativas. Tente novamente em uma hora.' });
    }

    const fields = await getFormFields(form.id);
    if (!fields.length) return json(res, 400, { error: 'Formulário sem campos configurados.' });

    const validated = await validateDynamicPayload(fields, body);
    if (validated.error) return json(res, 400, { error: validated.error });

    const page = String(body.page || '').trim() || null;
    const ipHash = hashIp(clientIp(req));
    const sql = getSql();

    const rows = await sql`
      INSERT INTO form_submissions (form_id, payload, page, ip_hash)
      VALUES (${form.id}, ${JSON.stringify(validated.payload)}, ${page}, ${ipHash})
      RETURNING id, created_at
    `;

    if (isResendConfigured()) {
      try {
        await sendDynamicFormEmails({
          formName: form.name,
          fieldDefs: fields,
          payload: validated.payload,
        });
      } catch (err) {
        console.error('dynamic form email', err);
      }
    }

    return json(res, 201, { ok: true, id: rows[0]?.id, created_at: rows[0]?.created_at });
  } catch (err) {
    console.error('form submit', err);
    return json(res, 500, { error: 'Não foi possível enviar o formulário.' });
  }
}
