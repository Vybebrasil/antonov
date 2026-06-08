import { json, adminCors, parseBody } from '../../lib/admin-http.js';
import { requireAdmin } from '../../lib/admin-auth.js';
import { getFormById, getFormFields, normalizeOptionalText } from '../../lib/forms.js';
import { getSql } from '../../lib/db.js';

export default async function handler(req, res) {
  adminCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const id = Number(req.query?.id);
  if (!id) return json(res, 400, { error: 'ID inválido.' });

  const form = await getFormById(id);
  if (!form) return json(res, 404, { error: 'Formulário não encontrado.' });

  const sql = getSql();

  if (req.method === 'GET') {
    const fields = form.source_type === 'dynamic' ? await getFormFields(id) : [];
    return json(res, 200, { form, fields });
  }

  if (req.method === 'PATCH') {
    const body = parseBody(req);
    if (body?.field_type != null || body?.field_key != null) {
      return json(res, 400, { error: 'Para editar campos, use /api/admin/form-fields.' });
    }
    const updates = {};
    if (body?.name != null) updates.name = String(body.name).trim();
    if (body?.description != null) updates.description = normalizeOptionalText(body.description);
    if (body?.status === 'archived' || body?.status === 'active') updates.status = body.status;

    if (!Object.keys(updates).length) {
      return json(res, 400, { error: 'Nada para atualizar.' });
    }

    try {
      const rows = await sql`
        UPDATE forms SET
          name = COALESCE(${updates.name ?? null}, name),
          description = COALESCE(${updates.description ?? null}, description),
          status = COALESCE(${updates.status ?? null}, status),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return json(res, 200, { form: rows[0] });
    } catch (err) {
      console.error('forms patch', err);
      return json(res, 500, { error: 'Erro ao atualizar formulário.' });
    }
  }

  if (req.method === 'DELETE') {
    if (form.source_type === 'legacy') {
      return json(res, 400, { error: 'Formulários legados não podem ser excluídos. Arquive se necessário.' });
    }
    try {
      await sql`DELETE FROM forms WHERE id = ${id} AND source_type = 'dynamic'`;
      return json(res, 200, { ok: true });
    } catch (err) {
      console.error('forms delete', err);
      return json(res, 500, { error: 'Erro ao excluir formulário.' });
    }
  }

  return json(res, 405, { error: 'Método não permitido.' });
}
