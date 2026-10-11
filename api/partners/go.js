import { json } from '../_lib/db.js';
import { checkRateLimit, clientIp } from '../_lib/rate-limit.js';
import { getPartnerRowBySlug } from '../_lib/parceiros.js';
import { insertEvent } from '../_lib/parceiros-analytics.js';
import {
  GO_CHANNELS,
  eventTypeForChannel,
  goTargetUrl,
  isPublicPartnerStatus,
} from '../_lib/parceiros-logic.js';

function queryValue(req, key) {
  const q = req.query || {};
  const v = q[key];
  if (Array.isArray(v)) return String(v[0] || '');
  return String(v || '');
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  const slug = queryValue(req, 'slug').trim();
  const channel = queryValue(req, 'channel').trim().toLowerCase();
  if (!slug || !GO_CHANNELS.includes(channel)) {
    return json(res, 400, { error: 'Destino inválido.' });
  }

  try {
    const allowed = await checkRateLimit(`partners:go:${channel}`, clientIp(req), {
      maxAttempts: 40,
      windowMs: 10 * 60 * 1000,
    });
    if (!allowed) return json(res, 429, { error: 'Muitas tentativas.' });

    const partner = await getPartnerRowBySlug(slug);
    if (!partner || !isPublicPartnerStatus(partner.status)) {
      return json(res, 404, { error: 'Parceiro não encontrado.' });
    }

    const target = goTargetUrl(partner, channel);
    if (!target) return json(res, 404, { error: 'Canal não cadastrado.' });

    const referrer = String(req.headers.referer || req.headers.referrer || '').slice(0, 500);
    const sessionId = String(queryValue(req, 'sid') || `go-${Date.now()}`).slice(0, 64);
    const campaignId = queryValue(req, 'campaign');
    const placementId = queryValue(req, 'placement');

    try {
      await insertEvent({
        event_type: eventTypeForChannel(channel),
        partner_id: Number(partner.id),
        campaign_id: campaignId ? Number(campaignId) : null,
        placement_id: placementId ? Number(placementId) : null,
        category_id: partner.category_id ? Number(partner.category_id) : null,
        session_id: sessionId,
        page: `/go/${slug}/${channel}`,
        referrer: referrer || null,
        metadata: { channel, source: 'go' },
      });
    } catch (err) {
      console.error('go event', err);
    }

    res.statusCode = 302;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Location', target);
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    return res.end();
  } catch (err) {
    console.error('partners go', err);
    return json(res, 500, { error: 'Não foi possível redirecionar.' });
  }
}
