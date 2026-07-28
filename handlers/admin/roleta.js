import { json, adminCors, parseBody } from '../../api/_lib/admin-http.js';
import { requireAdmin } from '../../api/_lib/admin-auth.js';
import {
  listAllPrizesAdmin,
  updatePrize,
  getSettings,
  updateSettings,
  listSpins,
  suggestPityFromStock,
  equalizePity,
} from '../../api/_lib/roleta.js';

function segments(req) {
  const raw = req.query?.path;
  if (typeof raw === 'string') return raw.split('/').filter(Boolean);
  if (Array.isArray(raw)) return raw.filter(Boolean);
  const pathname = String(req.url || '').split('?')[0];
  const prefix = '/api/admin/roleta/';
  if (pathname.startsWith(prefix)) return pathname.slice(prefix.length).split('/').filter(Boolean);
  if (pathname === '/api/admin/roleta') return [];
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
      const [premios, settings, spins] = await Promise.all([
        listAllPrizesAdmin(),
        getSettings(),
        listSpins(50),
      ]);
      return json(res, 200, {
        premios,
        settings,
        stats: {
          spins: spins.length,
          active_prizes: premios.filter((p) => p.active).length,
          cooldown_hours: settings.whatsapp_cooldown_hours,
        },
      });
    }

    if (parts[0] === 'premios' && parts.length === 1 && req.method === 'GET') {
      const premios = await listAllPrizesAdmin();
      return json(res, 200, { premios });
    }

    if (parts[0] === 'premios' && parts.length === 2 && req.method === 'PATCH') {
      const result = await updatePrize(parts[1], body);
      if (result.error) return json(res, 400, { error: result.error });
      return json(res, 200, { prize: result.prize });
    }

    if (parts[0] === 'premios' && parts.length === 1 && req.method === 'PUT') {
      const list = Array.isArray(body.premios) ? body.premios : [];
      const updated = [];
      for (const item of list) {
        if (!item?.id) continue;
        const result = await updatePrize(item.id, item);
        if (result.error) return json(res, 400, { error: result.error });
        updated.push(result.prize);
      }
      return json(res, 200, { premios: updated });
    }

    if (parts[0] === 'settings' && parts.length === 1 && req.method === 'GET') {
      return json(res, 200, { settings: await getSettings() });
    }

    if (parts[0] === 'settings' && parts.length === 1 && req.method === 'PATCH') {
      const settings = await updateSettings(body);
      return json(res, 200, { settings });
    }

    if (parts[0] === 'spins' && parts.length === 1 && req.method === 'GET') {
      const limit = Number(req.query?.limit || 200);
      const spins = await listSpins(limit);
      return json(res, 200, { spins });
    }

    if (parts[0] === 'preset-estoque' && req.method === 'POST') {
      const current = await listAllPrizesAdmin();
      const suggested = suggestPityFromStock(current);
      const updated = [];
      for (const p of suggested) {
        const result = await updatePrize(p.id, {
          pity_every: p.pity_every,
          weight: p.weight,
        });
        if (result.prize) updated.push(result.prize);
      }
      return json(res, 200, { premios: updated });
    }

    if (parts[0] === 'equalizar' && req.method === 'POST') {
      const every = Math.max(1, Math.round(Number(body.every) || 10));
      const current = await listAllPrizesAdmin();
      const suggested = equalizePity(current, every);
      const updated = [];
      for (const p of suggested) {
        const result = await updatePrize(p.id, {
          pity_every: p.pity_every,
          weight: p.weight,
        });
        if (result.prize) updated.push(result.prize);
      }
      return json(res, 200, { premios: updated });
    }

    return json(res, 404, { error: 'Rota não encontrada.' });
  } catch (err) {
    console.error('admin/roleta', err);
    return json(res, 500, { error: 'Erro interno na roleta.' });
  }
}
