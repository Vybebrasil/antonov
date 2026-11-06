import { json, notFound } from '../../../api/_lib/rh/common.js';
import {
  BemEstarError, definicoes, resumoBemEstar, historicoColaborador, getCheck,
  createCheck, updateCheck, deleteCheck,
} from '../../../api/_lib/rh/bemestar.js';

export default async function handle({ req, res, session, parts, body }) {
  const [first, second] = parts;
  try {
    if (req.method === 'GET') {
      if (!first) return json(res, 200, await resumoBemEstar());
      if (first === 'indicadores' && !second) return json(res, 200, definicoes());
      if (first === 'colaborador' && second) {
        const data = await historicoColaborador(second);
        return data ? json(res, 200, data) : notFound(res, 'Colaborador');
      }
      if (!second) {
        const check = await getCheck(first);
        return check ? json(res, 200, { check }) : json(res, 404, { error: 'Checagem não encontrada.' });
      }
      return json(res, 404, { error: 'Rota não encontrada.' });
    }

    if (req.method === 'POST' && !first) {
      const check = await createCheck(body, session);
      return json(res, 201, { check });
    }

    if (req.method === 'PATCH' && first && !second) {
      const check = await updateCheck(first, body);
      return check ? json(res, 200, { check }) : json(res, 404, { error: 'Checagem não encontrada.' });
    }

    if (req.method === 'DELETE' && first && !second) {
      const ok = await deleteCheck(first);
      return ok ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Checagem não encontrada.' });
    }

    return json(res, 405, { error: 'Método não permitido.' });
  } catch (err) {
    if (err instanceof BemEstarError) return json(res, err.status, { error: err.message });
    throw err;
  }
}
