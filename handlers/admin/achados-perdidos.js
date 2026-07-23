import { json, adminCors, parseBody } from '../../api/_lib/admin-http.js';
import { requireAdmin } from '../../api/_lib/admin-auth.js';
import {
  ACHADOS_STATUS,
  parseFotoBody,
  listAll,
  getById,
  createItem,
  updateItem,
  deleteItem,
} from '../../api/_lib/achados-perdidos.js';

function segments(req) {
  const raw = req.query?.path;
  if (typeof raw === 'string') return raw.split('/').filter(Boolean);
  if (Array.isArray(raw)) return raw.filter(Boolean);
  const pathname = String(req.url || '').split('?')[0];
  const prefix = '/api/admin/achados-perdidos/';
  if (pathname.startsWith(prefix)) return pathname.slice(prefix.length).split('/').filter(Boolean);
  if (pathname === '/api/admin/achados-perdidos') return [];
  return [];
}

export default async function handler(req, res) {
  adminCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const parts = segments(req);
  const body = parseBody(req) || {};

  try {
    if (parts.length === 0 && req.method === 'GET') {
      const itens = await listAll();
      return json(res, 200, { itens });
    }

    if (parts.length === 0 && req.method === 'POST') {
      const nome = String(body.nome_produto || '').trim();
      const dataCadastro = body.data_cadastro;
      if (!nome) return json(res, 400, { error: 'Nome do produto é obrigatório.' });
      if (!dataCadastro) return json(res, 400, { error: 'Data de cadastro é obrigatória.' });

      const fotoParsed = parseFotoBody(body);
      if (fotoParsed.error) return json(res, 400, { error: fotoParsed.error });

      const item = await createItem({
        nome_produto: nome,
        data_cadastro: dataCadastro,
        foto: fotoParsed.value,
        criado_por: session.userId,
      });
      return json(res, 201, { item });
    }

    if (parts.length === 1 && req.method === 'GET') {
      const item = await getById(parts[0]);
      if (!item) return json(res, 404, { error: 'Item não encontrado.' });
      return json(res, 200, { item });
    }

    if (parts.length === 1 && req.method === 'PATCH') {
      const existing = await getById(parts[0]);
      if (!existing) return json(res, 404, { error: 'Item não encontrado.' });

      const patch = {};
      if (body.nome_produto != null) {
        const nome = String(body.nome_produto).trim();
        if (!nome) return json(res, 400, { error: 'Nome do produto é obrigatório.' });
        patch.nome_produto = nome;
      }
      if (body.data_cadastro != null) patch.data_cadastro = body.data_cadastro;

      if (body.foto !== undefined) {
        if (body.foto === null) {
          patch.foto = null;
        } else {
          const fotoParsed = parseFotoBody(body);
          if (fotoParsed.error) return json(res, 400, { error: fotoParsed.error });
          patch.foto = fotoParsed.value;
        }
      }

      if (body.status != null) {
        if (!ACHADOS_STATUS.has(body.status)) {
          return json(res, 400, { error: 'Status inválido.' });
        }
        patch.status = body.status;
        if (body.status === 'entregue') {
          const dataEntrega = body.data_entrega;
          const entregueA = String(body.entregue_a || '').trim();
          const entreguePor = String(body.entregue_por || '').trim();
          if (!dataEntrega) return json(res, 400, { error: 'Data de entrega é obrigatória.' });
          if (!entregueA) return json(res, 400, { error: 'Informe a quem foi entregue.' });
          if (!entreguePor) return json(res, 400, { error: 'Informe por quem foi entregue.' });
          patch.data_entrega = dataEntrega;
          patch.entregue_a = entregueA;
          patch.entregue_por = entreguePor;
        }
      }

      const item = await updateItem(parts[0], patch);
      return json(res, 200, { item });
    }

    if (parts.length === 1 && req.method === 'DELETE') {
      const deleted = await deleteItem(parts[0]);
      if (!deleted) return json(res, 404, { error: 'Item não encontrado.' });
      return json(res, 200, { ok: true, id: deleted.id });
    }

    return json(res, 404, { error: 'Rota Achados e Perdidos não encontrada.' });
  } catch (err) {
    console.error('achados-perdidos handler', err);
    return json(res, 500, { error: 'Erro interno no módulo de Achados e Perdidos.' });
  }
}
