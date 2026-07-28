import { parseBody } from '../_lib/db.js';
import { confirmSpinCpf } from '../_lib/roleta.js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  try {
    const body = parseBody(req) || {};
    const spinId = String(body.spin_id || '').trim();
    if (!spinId) return json(res, 400, { error: 'spin_id é obrigatório.' });

    const result = await confirmSpinCpf(spinId, body.cpf);
    if (result.error) return json(res, 400, result);
    return json(res, 200, result);
  } catch (err) {
    console.error('roleta/confirm-cpf', err);
    return json(res, 500, { error: 'Erro ao confirmar CPF.' });
  }
}
