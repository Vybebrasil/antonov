import { json, adminCors, parseBody } from '../../api/_lib/admin-http.js';
import { requireModule } from '../../api/_lib/parceiros-auth.js';
import { segments } from '../../api/_lib/rh/common.js';

const MODULES = {
  'one-on-one': () => import('./rh/one-on-one.js'),
  onboarding: () => import('./rh/onboarding.js'),
  avaliacao: () => import('./rh/avaliacao.js'),
  ninebox: () => import('./rh/ninebox.js'),
  bemestar: () => import('./rh/bemestar.js'),
  cargos: () => import('./rh/cargos.js'),
  trilhas: () => import('./rh/trilhas.js'),
};

export default async function handler(req, res) {
  adminCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const session = await requireModule(req, res, 'hr');
  if (!session) return;

  const [moduleName, ...parts] = segments(req);
  const load = MODULES[moduleName];
  if (!load) return json(res, 404, { error: 'Módulo de RH não encontrado.' });

  try {
    const mod = await load();
    const body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? (parseBody(req) || {}) : {};
    return await mod.default({ req, res, session, parts, body, query: req.query || {} });
  } catch (err) {
    if (err?.code === '22P02') return json(res, 404, { error: 'Registro não encontrado.' });
    console.error(`rh ${moduleName}`, err);
    return json(res, 500, { error: 'Erro interno no módulo de RH.' });
  }
}
