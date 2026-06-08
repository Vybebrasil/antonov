import crypto from 'crypto';
import { json, parseBody } from '../../api/lib/admin-http.js';
import { getFormBySlug, getFormFields, validateDynamicPayload } from '../../api/lib/forms.js';
import { getSql } from '../../api/lib/db.js';

function hashIp(ip) {
  const salt = process.env.RATE_LIMIT_SALT || 'antonov';
  return crypto.createHash('sha256').update(`${ip}:${salt}`).digest('hex').slice(0, 32);
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

async function checkRateLimit(slug, ip) {
  const sql = getSql();
  const ipHash = hashIp(ip);
  const rows = await sql`
    SELECT submit_count, window_start FROM form_rate_limits
    WHERE ip_hash = ${ipHash} AND slug = ${slug}
  `;

  const hourAgo = Date.now() - 3600000;

  if (rows[0]) {
    const windowStart = new Date(rows[0].window_start).getTime();
    if (windowStart < hourAgo) {
      await sql`
        UPDATE form_rate_limits
        SET submit_count = 1, window_start = NOW()
        WHERE ip_hash = ${ipHash} AND slug = ${slug}
      `;
      return true;
    }
    if (rows[0].submit_count >= 5) return false;
    await sql`
      UPDATE form_rate_limits
      SET submit_count = submit_count + 1
      WHERE ip_hash = ${ipHash} AND slug = ${slug}
    `;
    return true;
  }

  await sql`
    INSERT INTO form_rate_limits (ip_hash, slug, submit_count, window_start)
    VALUES (${ipHash}, ${slug}, 1, NOW())
    ON CONFLICT (ip_hash, slug) DO UPDATE SET submit_count = 1, window_start = NOW()
  `;
  return true;
}

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

    return json(res, 201, { ok: true, id: rows[0]?.id, created_at: rows[0]?.created_at });
  } catch (err) {
    console.error('form submit', err);
    return json(res, 500, { error: 'Não foi possível enviar o formulário.' });
  }
}
