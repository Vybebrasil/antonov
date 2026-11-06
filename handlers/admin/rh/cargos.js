import { json, notFound } from '../../../api/_lib/rh/common.js';
import {
  CBO_URL, MODELOS, NIVEIS, CargoError,
  listCargos, searchCbo, getCargo, createCargo, updateCargo, deleteCargo,
} from '../../../api/_lib/rh/cargos.js';

export default async function handle({ req, res, parts, body, query }) {
  const method = req.method;
  const [first, ...rest] = parts;
  try {
    if (!first) {
      if (method === 'GET') {
        const ativos = ['1', 'true'].includes(String(query.ativos || ''));
        return json(res, 200, await listCargos({ ativos }));
      }
      if (method === 'POST') return json(res, 201, { cargo: await createCargo(body) });
      return json(res, 405, { error: 'Método não permitido.' });
    }

    if (rest.length) return json(res, 404, { error: 'Rota não encontrada.' });

    if (first === 'cbo') {
      if (method !== 'GET') return json(res, 405, { error: 'Método não permitido.' });
      return json(res, 200, { cbo: searchCbo(query.q), cbo_url: CBO_URL });
    }
    if (first === 'modelos') {
      if (method !== 'GET') return json(res, 405, { error: 'Método não permitido.' });
      return json(res, 200, { modelos: MODELOS, niveis: NIVEIS });
    }

    if (method === 'GET') {
      const cargo = await getCargo(first);
      return cargo ? json(res, 200, { cargo }) : notFound(res, 'Cargo');
    }
    if (method === 'PATCH' || method === 'PUT') {
      const cargo = await updateCargo(first, body);
      return cargo ? json(res, 200, { cargo }) : notFound(res, 'Cargo');
    }
    if (method === 'DELETE') {
      const r = await deleteCargo(first);
      if (!r) return notFound(res, 'Cargo');
      if (r.inativado) {
        return json(res, 200, {
          ok: true,
          inativado: true,
          colaboradores: r.colaboradores,
          message: `Este cargo tem ${r.colaboradores} colaborador(es) vinculado(s), por isso foi marcado como inativo em vez de excluído.`,
        });
      }
      return json(res, 200, { ok: true, inativado: false, message: 'Cargo excluído.' });
    }
    return json(res, 405, { error: 'Método não permitido.' });
  } catch (err) {
    if (err instanceof CargoError) return json(res, err.status, { error: err.message });
    throw err;
  }
}
