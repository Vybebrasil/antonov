import { json, notFound } from '../../../api/_lib/rh/common.js';
import {
  listOnboardings,
  getOnboarding,
  createOnboarding,
  updateOnboarding,
  deleteOnboarding,
  addItem,
  updateItem,
  deleteItem,
  isUuid,
} from '../../../api/_lib/rh/onboarding.js';

function reply(res, r) {
  if (r.error) return json(res, r.status, { error: r.error });
  return json(res, r.status, r.data);
}

export default async function handle({ req, res, session, parts, body, query }) {
  const method = req.method;
  const [a, b, c] = parts;

  if (a === 'itens') {
    if (!b || c) return notFound(res, 'Recurso');
    if (method === 'PATCH') return reply(res, await updateItem(b, body, session?.userId));
    if (method === 'DELETE') {
      return (await deleteItem(b)) ? json(res, 200, { ok: true }) : notFound(res, 'Item');
    }
    return json(res, 405, { error: 'Método não permitido.' });
  }

  if (!a) {
    if (method === 'GET') {
      const colaboradorId = query.colaborador_id ? String(query.colaborador_id) : null;
      if (colaboradorId && !isUuid(colaboradorId)) return json(res, 400, { error: 'Colaborador inválido.' });
      return json(res, 200, await listOnboardings({ colaboradorId }));
    }
    if (method === 'POST') return reply(res, await createOnboarding(body));
    return json(res, 405, { error: 'Método não permitido.' });
  }

  if (b === 'itens' && !c) {
    if (method === 'POST') return reply(res, await addItem(a, body));
    return json(res, 405, { error: 'Método não permitido.' });
  }
  if (b) return notFound(res, 'Recurso');

  if (method === 'GET') {
    const o = await getOnboarding(a);
    return o ? json(res, 200, o) : json(res, 404, { error: 'Integração não encontrada.' });
  }
  if (method === 'PATCH') return reply(res, await updateOnboarding(a, body));
  if (method === 'DELETE') {
    return (await deleteOnboarding(a)) ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Integração não encontrada.' });
  }
  return json(res, 405, { error: 'Método não permitido.' });
}
