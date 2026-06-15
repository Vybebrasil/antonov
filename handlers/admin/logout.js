import { json, adminCors } from '../../api/_lib/admin-http.js';
import { clearAuthCookie } from '../../api/_lib/admin-auth.js';

export default function handler(req, res) {
  adminCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Método não permitido.' });
  }
  clearAuthCookie(res);
  return json(res, 200, { ok: true });
}
