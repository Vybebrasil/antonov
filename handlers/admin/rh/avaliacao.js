import { json, notFound } from '../../../api/_lib/rh/common.js';
import {
  AvaliacaoError,
  listCiclos,
  createCiclo,
  getCiclo,
  updateCiclo,
  deleteCiclo,
  createAvaliacao,
  getAvaliacao,
  updateAvaliacao,
  deleteAvaliacao,
  historicoColaborador,
} from '../../../api/_lib/rh/avaliacao.js';

const notAllowed = (res) => json(res, 405, { error: 'Método não permitido.' });

async function route({ req, res, session, parts, body }) {
  const method = req.method;
  const [resource, id, sub] = parts;

  if (resource === 'ciclos') {
    if (!id) {
      if (method === 'GET') return json(res, 200, await listCiclos());
      if (method === 'POST') return json(res, 201, { ciclo: await createCiclo(body) });
      return notAllowed(res);
    }
    if (sub === 'avaliacoes') {
      if (method !== 'POST') return notAllowed(res);
      return json(res, 201, { avaliacao: await createAvaliacao(id, body, session?.userId) });
    }
    if (sub) return json(res, 404, { error: 'Rota não encontrada.' });
    if (method === 'GET') {
      const data = await getCiclo(id);
      return data ? json(res, 200, data) : notFound(res, 'Ciclo');
    }
    if (method === 'PATCH') {
      const ciclo = await updateCiclo(id, body);
      return ciclo ? json(res, 200, { ciclo }) : notFound(res, 'Ciclo');
    }
    if (method === 'DELETE') {
      return (await deleteCiclo(id)) ? json(res, 200, { ok: true }) : notFound(res, 'Ciclo');
    }
    return notAllowed(res);
  }

  if (resource === 'avaliacoes' && id && !sub) {
    if (method === 'GET') {
      const avaliacao = await getAvaliacao(id);
      return avaliacao ? json(res, 200, { avaliacao }) : notFound(res, 'Avaliação');
    }
    if (method === 'PATCH') {
      const avaliacao = await updateAvaliacao(id, body);
      return avaliacao ? json(res, 200, { avaliacao }) : notFound(res, 'Avaliação');
    }
    if (method === 'DELETE') {
      return (await deleteAvaliacao(id)) ? json(res, 200, { ok: true }) : notFound(res, 'Avaliação');
    }
    return notAllowed(res);
  }

  if (resource === 'colaborador' && id && !sub) {
    if (method !== 'GET') return notAllowed(res);
    const data = await historicoColaborador(id);
    return data ? json(res, 200, data) : notFound(res, 'Colaborador');
  }

  return json(res, 404, { error: 'Rota não encontrada.' });
}

export default async function handle(ctx) {
  try {
    return await route(ctx);
  } catch (err) {
    if (err instanceof AvaliacaoError) {
      return json(ctx.res, err.status, { error: err.message, ...(err.id ? { id: err.id } : {}) });
    }
    throw err;
  }
}
