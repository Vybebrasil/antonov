import { json, notFound } from '../../../api/_lib/rh/common.js';
import {
  TrilhaError, listTrilhas, getTrilha, createTrilha, updateTrilha, deleteTrilha,
  createItem, updateItem, deleteItem,
  createAtribuicao, updateAtribuicao, deleteAtribuicao, setProgresso,
  trilhasDoColaborador, listModelos, createFromModelo,
} from '../../../api/_lib/rh/trilhas.js';

const notAllowed = (res) => json(res, 405, { error: 'Método não permitido.' });

export default async function handle({ req, res, parts, body }) {
  const method = req.method;
  const [a, b, c, d, ...rest] = parts;
  if (rest.length) return notFound(res, 'Recurso');

  try {
    if (!a) {
      if (method === 'GET') return json(res, 200, await listTrilhas());
      if (method === 'POST') return json(res, 201, { trilha: await createTrilha(body) });
      return notAllowed(res);
    }

    if (a === 'modelos') {
      if (c) return notFound(res, 'Recurso');
      if (!b) return method === 'GET' ? json(res, 200, { modelos: listModelos() }) : notAllowed(res);
      if (method !== 'POST') return notAllowed(res);
      const trilha = await createFromModelo(b);
      return trilha ? json(res, 201, { trilha }) : notFound(res, 'Modelo');
    }

    if (a === 'itens') {
      if (!b || c) return notFound(res, 'Recurso');
      if (method === 'PATCH' || method === 'PUT') {
        const item = await updateItem(b, body);
        return item ? json(res, 200, { item }) : notFound(res, 'Item');
      }
      if (method === 'DELETE') return (await deleteItem(b)) ? json(res, 200, { ok: true }) : notFound(res, 'Item');
      return notAllowed(res);
    }

    if (a === 'atribuicoes') {
      if (!b) return notFound(res, 'Recurso');
      if (c === 'itens' && d) {
        if (method !== 'PUT' && method !== 'PATCH') return notAllowed(res);
        return json(res, 200, { atribuicao: await setProgresso(b, d, body) });
      }
      if (c) return notFound(res, 'Recurso');
      if (method === 'PATCH' || method === 'PUT') {
        const atribuicao = await updateAtribuicao(b, body);
        return atribuicao ? json(res, 200, { atribuicao }) : json(res, 404, { error: 'Atribuição não encontrada.' });
      }
      if (method === 'DELETE') {
        return (await deleteAtribuicao(b)) ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Atribuição não encontrada.' });
      }
      return notAllowed(res);
    }

    if (a === 'colaborador') {
      if (!b || c) return notFound(res, 'Recurso');
      if (method !== 'GET') return notAllowed(res);
      const atribuicoes = await trilhasDoColaborador(b);
      return atribuicoes ? json(res, 200, { atribuicoes }) : notFound(res, 'Colaborador');
    }

    if (b === 'itens' && !c) {
      if (method !== 'POST') return notAllowed(res);
      const item = await createItem(a, body);
      return item ? json(res, 201, { item }) : json(res, 404, { error: 'Trilha não encontrada.' });
    }
    if (b === 'atribuicoes' && !c) {
      if (method !== 'POST') return notAllowed(res);
      return json(res, 201, { atribuicao: await createAtribuicao(a, body) });
    }
    if (b) return notFound(res, 'Recurso');

    if (method === 'GET') {
      const trilha = await getTrilha(a);
      return trilha ? json(res, 200, { trilha }) : json(res, 404, { error: 'Trilha não encontrada.' });
    }
    if (method === 'PATCH' || method === 'PUT') {
      const trilha = await updateTrilha(a, body);
      return trilha ? json(res, 200, { trilha }) : json(res, 404, { error: 'Trilha não encontrada.' });
    }
    if (method === 'DELETE') return (await deleteTrilha(a)) ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Trilha não encontrada.' });
    return notAllowed(res);
  } catch (err) {
    if (err instanceof TrilhaError) return json(res, err.status, { error: err.message });
    throw err;
  }
}
