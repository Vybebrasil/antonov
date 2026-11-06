import { json } from '../_lib/admin-http.js';
import { cronAuthorized } from '../_lib/telao-novacloud.js';
import { receiveCallback, runDaily, runTick } from '../_lib/telao-jobs.js';

export default async function handler(req, res) {
  const job = String(req.query?.job || '').toLowerCase();
  try {
    if (job === 'callback' || job === 'screenshot') {
      const given = req.query?.token || req.headers['x-telao-token'];
      console.log('telao callback recebido', JSON.stringify({
        job,
        method: req.method,
        token: given ? `presente(${String(given).length})` : 'ausente',
        esperado: String(process.env.TELAO_CALLBACK_TOKEN || '').length,
        url: String(req.url || '').replace(/token=[^&]*/, 'token=***').replace(/\/(callback|screenshot)\/[^?]+/, '/$1/***').slice(0, 200),
        agent: String(req.headers['user-agent'] || '').slice(0, 80),
        type: String(req.headers['content-type'] || ''),
        body: JSON.stringify(req.body ?? null).slice(0, 1500),
      }));
      if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
      const result = await receiveCallback({
        token: given,
        kind: job === 'screenshot' ? 'screenshot' : 'program',
        body: req.body,
      });
      if (result.unauthorized) console.warn('telao callback recusado: token inválido', job);
      if (result.unauthorized) return json(res, 401, { error: 'Token inválido.' });
      return json(res, 200, { ok: true });
    }
    if (job !== 'tick' && job !== 'daily') return json(res, 404, { error: 'Rota não encontrada.' });
    if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
    if (!cronAuthorized(req)) return json(res, 401, { error: 'Não autenticado.' });
    const result = job === 'tick' ? await runTick() : await runDaily(req);
    return json(res, 200, { ok: true, ...result });
  } catch (err) {
    console.error('telao job', job, err);
    return json(res, 500, { error: 'Falha no job do telão.' });
  }
}
