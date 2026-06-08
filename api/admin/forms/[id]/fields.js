import { json, adminCors, parseBody } from '../../../lib/admin-http.js';
import { requireAdmin } from '../../../lib/admin-auth.js';
import { getFormById, getFormFields, parseShowWhen, normalizeOptionalText } from '../../../lib/forms.js';
import { getSql } from '../../../lib/db.js';

const FIELD_TYPES = new Set(['text', 'email', 'tel', 'textarea', 'select', 'checkbox', 'date', 'number']);

function fieldMeta(body, fieldKey, allFields) {
  const description = body?.description != null ? normalizeOptionalText(body.description) : null;
  const placeholder = body?.placeholder != null ? normalizeOptionalText(body.placeholder) : null;
  const showWhen = body?.show_when != null
    ? parseShowWhen(body.show_when, fieldKey, allFields)
    : null;
  return { description, placeholder, show_when: showWhen };
}

export default async function handler(req, res) {
  adminCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const formId = Number(req.query?.id);
  if (!formId) return json(res, 400, { error: 'ID inválido.' });

  const form = await getFormById(formId);
  if (!form) return json(res, 404, { error: 'Formulário não encontrado.' });
  if (form.source_type !== 'dynamic') {
    return json(res, 400, { error: 'Campos só podem ser editados em formulários dinâmicos.' });
  }

  const sql = getSql();

  if (req.method === 'GET') {
    const fields = await getFormFields(formId);
    return json(res, 200, { fields });
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    const fieldKey = String(body?.field_key || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const label = String(body?.label || '').trim();
    const fieldType = body?.field_type || 'text';

    if (!fieldKey || !label) return json(res, 400, { error: 'Chave e rótulo são obrigatórios.' });
    if (!FIELD_TYPES.has(fieldType)) return json(res, 400, { error: 'Tipo de campo inválido.' });

    const options = Array.isArray(body?.options) ? body.options.map(String) : null;
    const sortOrder = Number(body?.sort_order) || 0;
    const existing = await getFormFields(formId);
    const meta = fieldMeta(body, fieldKey, existing);

    if (body?.show_when?.field_key && !meta.show_when) {
      return json(res, 400, { error: 'Condicional inválida. Verifique o campo, operador e valor.' });
    }

    try {
      const rows = await sql`
        INSERT INTO form_fields (
          form_id, field_key, label, field_type, required, options,
          description, placeholder, show_when, sort_order
        )
        VALUES (
          ${formId},
          ${fieldKey},
          ${label},
          ${fieldType},
          ${Boolean(body?.required)},
          ${options ? JSON.stringify(options) : null},
          ${meta.description},
          ${meta.placeholder},
          ${meta.show_when ? JSON.stringify(meta.show_when) : null},
          ${sortOrder}
        )
        RETURNING *
      `;
      return json(res, 201, { field: rows[0] });
    } catch (err) {
      if (err?.code === '23505') return json(res, 409, { error: 'Chave de campo já existe.' });
      console.error('fields create', err);
      return json(res, 500, { error: 'Erro ao criar campo.' });
    }
  }

  if (req.method === 'PATCH') {
    const body = parseBody(req);
    const fieldId = Number(body?.id);
    if (!fieldId) return json(res, 400, { error: 'ID do campo é obrigatório.' });

    if (Array.isArray(body?.reorder)) {
      for (const item of body.reorder) {
        await sql`
          UPDATE form_fields SET sort_order = ${Number(item.sort_order) || 0}
          WHERE id = ${Number(item.id)} AND form_id = ${formId}
        `;
      }
      const fields = await getFormFields(formId);
      return json(res, 200, { fields });
    }

    const allFields = await getFormFields(formId);
    const current = allFields.find((f) => Number(f.id) === fieldId);
    if (!current) return json(res, 404, { error: 'Campo não encontrado.' });

    const fieldKey = body?.field_key != null
      ? String(body.field_key).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
      : current.field_key;
    const label = body?.label != null ? String(body.label).trim() : null;
    const fieldType = body?.field_type;
    if (fieldType && !FIELD_TYPES.has(fieldType)) {
      return json(res, 400, { error: 'Tipo de campo inválido.' });
    }

    const options = body?.options != null
      ? (Array.isArray(body.options) ? JSON.stringify(body.options.map(String)) : null)
      : undefined;

    const description = body?.description !== undefined ? normalizeOptionalText(body.description) : undefined;
    const placeholder = body?.placeholder !== undefined ? normalizeOptionalText(body.placeholder) : undefined;

    let showWhenParam = current.show_when;
    if (body?.show_when !== undefined) {
      if (body.show_when === null || !body.show_when?.field_key) {
        showWhenParam = null;
      } else {
        const parsed = parseShowWhen(body.show_when, fieldKey, allFields.filter((f) => f.id !== fieldId));
        if (!parsed) return json(res, 400, { error: 'Condicional inválida.' });
        showWhenParam = parsed;
      }
    }

    try {
      const rows = await sql`
        UPDATE form_fields SET
          field_key = COALESCE(${body?.field_key != null ? fieldKey : null}, field_key),
          label = COALESCE(${label}, label),
          field_type = COALESCE(${fieldType ?? null}, field_type),
          required = COALESCE(${body?.required ?? null}, required),
          options = COALESCE(${options ?? null}::jsonb, options),
          description = COALESCE(${description ?? null}, description),
          placeholder = COALESCE(${placeholder ?? null}, placeholder),
          show_when = ${showWhenParam ? JSON.stringify(showWhenParam) : null}::jsonb,
          sort_order = COALESCE(${body?.sort_order ?? null}, sort_order)
        WHERE id = ${fieldId} AND form_id = ${formId}
        RETURNING *
      `;
      if (!rows[0]) return json(res, 404, { error: 'Campo não encontrado.' });
      return json(res, 200, { field: rows[0] });
    } catch (err) {
      console.error('fields patch', err);
      return json(res, 500, { error: 'Erro ao atualizar campo.' });
    }
  }

  if (req.method === 'DELETE') {
    const fieldId = Number(req.query?.fieldId);
    if (!fieldId) return json(res, 400, { error: 'fieldId é obrigatório.' });
    try {
      await sql`DELETE FROM form_fields WHERE id = ${fieldId} AND form_id = ${formId}`;
      return json(res, 200, { ok: true });
    } catch (err) {
      console.error('fields delete', err);
      return json(res, 500, { error: 'Erro ao excluir campo.' });
    }
  }

  return json(res, 405, { error: 'Método não permitido.' });
}
