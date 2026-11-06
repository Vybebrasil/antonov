import bcrypt from 'bcryptjs';
import { json, adminCors, parseBody } from '../../api/_lib/admin-http.js';
import { getParceirosSession } from '../../api/_lib/parceiros-auth.js';
import { getSql } from '../../api/_lib/db.js';

export default async function handler(req, res) {
  adminCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  const session = await getParceirosSession(req);
  if (!session) return json(res, 401, { error: 'Não autenticado.' });

  const body = parseBody(req) || {};
  const next = String(body.new_password || '');
  const current = String(body.current_password || '');
  if (next.length < 8) return json(res, 400, { error: 'A nova senha precisa de pelo menos 8 caracteres.' });

  try {
    const sql = getSql();
    const rows = await sql`SELECT password_hash FROM admin_users WHERE id = ${session.userId} AND deleted_at IS NULL`;
    if (!rows[0]) return json(res, 404, { error: 'Usuário não encontrado.' });
    if (!session.mustChangePassword) {
      const ok = current && await bcrypt.compare(current, rows[0].password_hash);
      if (!ok) return json(res, 400, { error: 'Senha atual incorreta.' });
    }
    if (await bcrypt.compare(next, rows[0].password_hash)) {
      return json(res, 400, { error: 'Escolha uma senha diferente da atual.' });
    }
    const hash = await bcrypt.hash(next, 12);
    await sql`
      UPDATE admin_users SET password_hash = ${hash}, must_change_password = FALSE
      WHERE id = ${session.userId}
    `;
    return json(res, 200, { ok: true });
  } catch (err) {
    console.error('admin password', err);
    return json(res, 500, { error: 'Não foi possível trocar a senha.' });
  }
}
