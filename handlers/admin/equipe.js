import { json, adminCors, parseBody } from '../../api/_lib/admin-http.js';
import { ACCESS_MODULES } from '../../api/_lib/access.js';
import { requireModule } from '../../api/_lib/parceiros-auth.js';
import {
  createAdminUser,
  deactivateAdminUser,
  listAdminUsers,
  updateAdminUser,
} from '../../api/_lib/admin-users.js';
import { listAdminPartners } from '../../api/_lib/parceiros.js';
import { listForms } from '../../api/_lib/forms.js';

function segments(req) {
  const raw = req.query?.path;
  if (typeof raw === 'string') return raw.split('/').filter(Boolean);
  if (Array.isArray(raw)) return raw.filter(Boolean);
  const pathname = String(req.url || '').split('?')[0];
  const prefix = '/api/admin/equipe/';
  if (pathname.startsWith(prefix)) return pathname.slice(prefix.length).split('/').filter(Boolean);
  return [];
}

export default async function handler(req, res) {
  adminCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const session = await requireModule(req, res, 'equipe');
  if (!session) return;

  const parts = segments(req);
  const body = parseBody(req) || {};

  try {
    if (parts.length === 0 && req.method === 'GET') {
      const [users, partners, forms] = await Promise.all([
        listAdminUsers(),
        listAdminPartners({ limit: 200 }).catch(() => ({ partners: [] })),
        listForms(true).catch(() => []),
      ]);
      return json(res, 200, {
        users,
        modules: ACCESS_MODULES,
        partners: partners.partners || partners || [],
        forms: (forms || []).map((item) => ({
          id: Number(item.id),
          name: item.name,
          status: item.status,
        })),
      });
    }
    if (parts[0] === 'users' && parts.length === 1 && req.method === 'GET') {
      return json(res, 200, { users: await listAdminUsers(), modules: ACCESS_MODULES });
    }
    if (parts[0] === 'users' && parts.length === 1 && req.method === 'POST') {
      const result = await createAdminUser(body, session);
      if (result.error) return json(res, 400, { error: result.error });
      return json(res, 201, result);
    }
    if (parts[0] === 'users' && parts.length === 2 && (req.method === 'PATCH' || req.method === 'PUT')) {
      const result = await updateAdminUser(parts[1], body, session);
      if (result.error) return json(res, result.status || 400, { error: result.error });
      return json(res, 200, result);
    }
    if (parts[0] === 'users' && parts.length === 2 && req.method === 'DELETE') {
      const result = await deactivateAdminUser(parts[1], session.userId);
      if (result.error) return json(res, result.status || 400, { error: result.error });
      return json(res, 200, result);
    }
    return json(res, 404, { error: 'Rota não encontrada.' });
  } catch (err) {
    console.error('admin equipe', err);
    return json(res, 500, { error: 'Erro interno.' });
  }
}
