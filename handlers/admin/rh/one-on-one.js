import { json, notFound } from '../../../api/_lib/rh/common.js';
import {
  OneOnOneError, listOneOnOnes, getOneOnOne, createOneOnOne, updateOneOnOne, deleteOneOnOne, resumoOneOnOnes,
} from '../../../api/_lib/rh/one-on-one.js';

export default async function handle({ req, res, session, parts, body, query }) {
  const [first, ...rest] = parts;
  const method = req.method;
  if (rest.length) return notFound(res, 'Recurso');

  try {
    if (!first) {
      if (method === 'GET') {
        const reunioes = await listOneOnOnes({
          colaboradorId: query.colaborador_id,
          status: query.status,
          limit: query.limit,
        });
        return json(res, 200, { reunioes });
      }
      if (method === 'POST') {
        const reuniao = await createOneOnOne(body, session);
        return json(res, 201, { reuniao });
      }
      return json(res, 405, { error: 'Método não permitido.' });
    }

    if (first === 'resumo') {
      if (method !== 'GET') return json(res, 405, { error: 'Método não permitido.' });
      return json(res, 200, await resumoOneOnOnes());
    }

    if (method === 'GET') {
      const reuniao = await getOneOnOne(first);
      return reuniao ? json(res, 200, { reuniao }) : notFound(res, 'Reunião 1:1');
    }
    if (method === 'PATCH' || method === 'PUT') {
      const reuniao = await updateOneOnOne(first, body);
      return reuniao ? json(res, 200, { reuniao }) : notFound(res, 'Reunião 1:1');
    }
    if (method === 'DELETE') {
      const ok = await deleteOneOnOne(first);
      return ok ? json(res, 200, { ok: true }) : notFound(res, 'Reunião 1:1');
    }
    return json(res, 405, { error: 'Método não permitido.' });
  } catch (err) {
    if (err instanceof OneOnOneError) return json(res, err.status, { error: err.message });
    throw err;
  }
}
