import { json, adminCors, parseBody } from '../../lib/admin-http.js';
import { requireAdmin, RESERVED_SLUGS } from '../../lib/admin-auth.js';
import { listForms, slugify } from '../../lib/forms.js';
import { getSql } from '../../lib/db.js';

export default async function handler(req, res) {
  adminCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const sql = getSql();

  if (req.method === 'GET') {
    try {
      const includeArchived = req.query?.archived === '1';
      const forms = await listForms(includeArchived);
      return json(res, 200, { forms });
    } catch (err) {
      console.error('forms list', err);
      return json(res, 500, { error: 'Erro ao listar formulários.' });
    }
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    if (!body?.name) return json(res, 400, { error: 'Nome é obrigatório.' });

    const slug = slugify(body.slug || body.name);
    if (!slug || slug.length < 2) return json(res, 400, { error: 'Slug inválido.' });
    if (RESERVED_SLUGS.has(slug)) return json(res, 400, { error: 'Slug reservado.' });
    if (!/^[a-z0-9-]+$/.test(slug)) return json(res, 400, { error: 'Slug deve conter apenas a-z, 0-9 e hífen.' });

    try {
      const rows = await sql`
        INSERT INTO forms (slug, name, description, status, source_type)
        VALUES (
          ${slug},
          ${String(body.name).trim()},
          ${body.description ? String(body.description).trim() : null},
          'active',
          'dynamic'
        )
        RETURNING *
      `;
      return json(res, 201, { form: rows[0] });
    } catch (err) {
      if (err?.code === '23505') return json(res, 409, { error: 'Slug já existe.' });
      console.error('forms create', err);
      return json(res, 500, { error: 'Erro ao criar formulário.' });
    }
  }

  return json(res, 405, { error: 'Método não permitido.' });
}
