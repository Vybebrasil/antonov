function segments(req) {
  const raw = req.query?.path;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function withId(req, id) {
  req.query = { ...req.query, id: String(id) };
}

export default async function handler(req, res) {
  const parts = segments(req);

  try {
    if (parts.length === 1 && parts[0] === 'dashboard') {
      return (await import('../../handlers/admin/dashboard.js')).default(req, res);
    }
    if (parts.length === 1 && parts[0] === 'login') {
      return (await import('../../handlers/admin/login.js')).default(req, res);
    }
    if (parts.length === 1 && parts[0] === 'logout') {
      return (await import('../../handlers/admin/logout.js')).default(req, res);
    }
    if (parts.length === 1 && parts[0] === 'me') {
      return (await import('../../handlers/admin/me.js')).default(req, res);
    }
    if (parts.length === 1 && parts[0] === 'form-fields') {
      return (await import('../../handlers/admin/form-fields.js')).default(req, res);
    }
    if (parts.length === 1 && parts[0] === 'forms') {
      return (await import('../../handlers/admin/forms-index.js')).default(req, res);
    }
    if (parts.length === 2 && parts[0] === 'forms' && /^\d+$/.test(parts[1])) {
      withId(req, parts[1]);
      return (await import('../../handlers/admin/forms-id.js')).default(req, res);
    }
    if (parts.length === 3 && parts[0] === 'forms' && /^\d+$/.test(parts[1]) && parts[2] === 'submissions') {
      withId(req, parts[1]);
      return (await import('../../handlers/admin/forms-submissions.js')).default(req, res);
    }
    if (parts.length === 3 && parts[0] === 'forms' && /^\d+$/.test(parts[1]) && parts[2] === 'export') {
      withId(req, parts[1]);
      return (await import('../../handlers/admin/forms-export.js')).default(req, res);
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'Rota não encontrada.' }));
  } catch (err) {
    console.error('admin router', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'Erro interno.' }));
  }
}
