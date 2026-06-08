import { json, adminCors } from '../../api/lib/admin-http.js';
import { getSession } from '../../api/lib/admin-auth.js';

export default async function handler(req, res) {
  adminCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  const session = await getSession(req);
  if (!session) return json(res, 401, { error: 'Não autenticado.' });
  return json(res, 200, { ok: true, email: session.email });
}
