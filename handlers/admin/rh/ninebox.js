import { json, notFound } from '../../../api/_lib/rh/common.js';
import {
  NINEBOX_QUADRANTES,
  getGrade,
  getHistorico,
  upsertPosicao,
  deletePosicao,
  periodoValido,
} from '../../../api/_lib/rh/ninebox.js';

export default async function handle({ req, res, session, parts, body, query }) {
  const method = req.method;
  const [first, second] = parts;

  if (method === 'GET' && !first) {
    const periodo = query.periodo ? String(query.periodo).trim().toUpperCase() : null;
    if (periodo && !periodoValido(periodo)) {
      return json(res, 400, { error: 'Período inválido. Use o formato 2026-S2 ou 2026-Q4.' });
    }
    return json(res, 200, await getGrade(periodo));
  }

  if (method === 'GET' && first === 'quadrantes' && !second) {
    return json(res, 200, { quadrantes: NINEBOX_QUADRANTES });
  }

  if (method === 'GET' && first === 'colaborador' && second) {
    const data = await getHistorico(second);
    if (!data) return notFound(res, 'Colaborador');
    return json(res, 200, data);
  }

  if (method === 'PUT' && !first) {
    const result = await upsertPosicao(body || {}, session);
    if (result.error) return json(res, result.status, { error: result.error });
    return json(res, result.created ? 201 : 200, result);
  }

  if (method === 'DELETE' && first && !second) {
    const ok = await deletePosicao(first);
    if (!ok) return notFound(res, 'Posicionamento');
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: 'Rota do 9-Box não encontrada.' });
}
