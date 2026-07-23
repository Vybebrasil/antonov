import { listPendentesPublic } from './_lib/achados-perdidos.js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60');
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
    const itens = await listPendentesPublic();
    return json(res, 200, { itens });
  } catch (err) {
    console.error('achados-e-perdidos public', err);
    return json(res, 500, { error: 'Erro ao carregar achados e perdidos.' });
  }
}
