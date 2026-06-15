function leadKind(req) {
  const fromQuery = String(req.query?.kind || '').trim();
  if (fromQuery) return fromQuery;

  const fromParam = String(req.query?.kind ?? req.query?.path ?? '').trim();
  if (fromParam) return fromParam;

  const pathname = String(req.url || '').split('?')[0];
  const prefix = '/api/leads/';
  if (pathname.startsWith(prefix)) {
    return pathname.slice(prefix.length).split('/').filter(Boolean)[0] || '';
  }
  return '';
}

export default async function handler(req, res) {
  const kind = leadKind(req);

  if (kind === 'pre-matricula') {
    return (await import('../../handlers/leads/pre-matricula.js')).default(req, res);
  }
  if (kind === 'curriculos') {
    return (await import('../../handlers/leads/curriculos.js')).default(req, res);
  }
  if (kind === 'tour') {
    return (await import('../../handlers/leads/tour.js')).default(req, res);
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify({ error: 'Rota não encontrada.' }));
}
