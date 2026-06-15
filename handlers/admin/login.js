import { json, adminCors, parseBody } from '../../api/_lib/admin-http.js';
import { loginUser, signToken, setAuthCookie } from '../../api/_lib/admin-auth.js';
import { checkRateLimit, clientIp } from '../../api/_lib/rate-limit.js';

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
    const allowed = await checkRateLimit('admin:login', clientIp(req));
    if (!allowed) {
      return json(res, 429, { error: 'Muitas tentativas. Tente novamente em uma hora.' });
    }

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
