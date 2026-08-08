import { listActivePrizesPublic, getSettings } from '../_lib/roleta.js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  try {
    const [premios, settings] = await Promise.all([
      listActivePrizesPublic(),
      getSettings(),
    ]);
    return json(res, 200, {
      premios,
      settings: {
        result_timeout_seconds: settings.result_timeout_seconds,
        /* Lets the totem skip re-downloading the art while it is unchanged. */
        layout_signature: settings.has_layout
          ? `${settings.layout_name || ''}:${settings.layout_bytes}`
          : '',
      },
    });
  } catch (err) {
    console.error('roleta/premios', err);
    return json(res, 500, { error: 'Erro ao carregar prêmios.' });
  }
}
