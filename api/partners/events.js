import { json, cors, parseBody } from '../_lib/db.js';
import { checkRateLimit, clientIp } from '../_lib/rate-limit.js';
import { insertEvent, normalizeEvent } from '../_lib/parceiros-analytics.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  try {
    const allowed = await checkRateLimit('partners:events', clientIp(req), {
      maxAttempts: 80,
      windowMs: 10 * 60 * 1000,
    });
    if (!allowed) return json(res, 429, { error: 'Muitas requisições.' });

    const body = parseBody(req);
    if (!body) return json(res, 400, { error: 'JSON inválido.' });

    const items = Array.isArray(body.events) ? body.events : [body];
    if (items.length > 20) return json(res, 400, { error: 'Lote muito grande.' });

    const referrer = String(req.headers.referer || req.headers.referrer || '').slice(0, 500);
    const saved = [];
    for (const item of items) {
      const parsed = normalizeEvent(item, { referrer, page: item?.page });
      if (parsed.error) continue;
      const result = await insertEvent(parsed.value);
      saved.push(result);
    }

    return json(res, 202, { ok: true, count: saved.length });
  } catch (err) {
    console.error('partners events', err);
    return json(res, 202, { ok: true, count: 0 });
  }
}
