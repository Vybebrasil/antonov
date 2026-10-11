import { json } from '../../_lib/db.js';
import { refreshOperationalStatuses } from '../../_lib/parceiros.js';
import { getParceirosSession } from '../../_lib/parceiros-auth.js';

function authorized(req) {
  const secret = process.env.PARTNERS_CRON_SECRET || process.env.CRON_SECRET;
  const auth = String(req.headers.authorization || '');
  if (secret && auth === `Bearer ${secret}`) return true;
  if (req.headers['x-vercel-cron'] === '1' && secret && auth === `Bearer ${secret}`) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  if (!authorized(req)) {
    const session = await getParceirosSession(req);
    if (!session) return json(res, 401, { error: 'Não autenticado.' });
  }

  try {
    const result = await refreshOperationalStatuses();
    return json(res, 200, { ok: true, ...result });
  } catch (err) {
    console.error('partners tick', err);
    return json(res, 500, { error: 'Falha ao atualizar status.' });
  }
}
