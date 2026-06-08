import getHandler from '../../handlers/forms/get.js';
import submitHandler from '../../handlers/forms/submit.js';

function ensureSlug(req) {
  const fromQuery = String(req.query?.slug || '').trim();
  if (fromQuery) return fromQuery;

  const pathname = String(req.url || '').split('?')[0];
  const prefix = '/api/forms/';
  if (!pathname.startsWith(prefix)) return '';

  const segment = pathname.slice(prefix.length).split('/').filter(Boolean)[0];
  return segment && segment !== 'submit' ? segment : '';
}

export default async function handler(req, res) {
  const slug = ensureSlug(req);
  if (slug) {
    if (!req.query) req.query = {};
    req.query.slug = slug;
  }

  if (req.method === 'GET') return getHandler(req, res);
  if (req.method === 'POST') return submitHandler(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.end();
  }
  res.statusCode = 405;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'Método não permitido.' }));
}
