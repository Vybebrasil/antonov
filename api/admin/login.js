import { json, adminCors, parseBody } from '../lib/admin-http.js';
import { loginUser, signToken, setAuthCookie } from '../lib/admin-auth.js';

export default async function handler(req, res) {
  adminCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  const body = parseBody(req);
  if (!body?.email || !body?.password) {
    return json(res, 400, { error: 'E-mail e senha são obrigatórios.' });
  }

  try {
    const user = await loginUser(body.email, body.password);
    if (!user) return json(res, 401, { error: 'Credenciais inválidas.' });

    const token = await signToken({ sub: String(user.id), email: user.email });
    setAuthCookie(res, token);
    return json(res, 200, { ok: true, email: user.email });
  } catch (err) {
    console.error('admin login', err);
    return json(res, 500, { error: 'Erro ao autenticar.' });
  }
}
