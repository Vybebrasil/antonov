import { cors, json, parseBody } from './lib/db.js';
import preMatricula from './leads/pre-matricula.js';
import curriculos from './leads/curriculos.js';
import tour from './leads/tour.js';

/** Roteador legado: redireciona pelo campo `origem` para as tabelas novas. */
const HANDLERS = {
  'pre-cadastro-inauguracao': preMatricula,
  'trabalhe-conosco-curriculo': curriculos,
  'contato-tour': tour,
};

export default async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  const body = parseBody(req);
  if (!body) return json(res, 400, { error: 'JSON inválido.' });

  const origem = String(body?.origem || '').trim();
  const fn = HANDLERS[origem];
  if (!fn) {
    return json(res, 400, {
      error: 'Use /api/leads/pre-matricula, /api/leads/curriculos ou /api/leads/tour.',
    });
  }

  return fn(req, res);
}
