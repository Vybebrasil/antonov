import { json, adminCors, parseBody } from '../../api/_lib/admin-http.js';
import { requireAdmin } from '../../api/_lib/admin-auth.js';
import { getFormById, getFormFields, parseShowWhen, normalizeOptionalText } from '../../api/_lib/forms.js';
import { getSql } from '../../api/_lib/db.js';

const FIELD_TYPES = new Set(['text', 'email', 'tel', 'textarea', 'select', 'checkbox', 'radio', 'date', 'number', 'file']);
const FIELD_WIDTHS = new Set(['full', 'half', 'third']);

function normalizeOptions(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw.map(String);
  return null;
}

function normalizeFileFieldOptions(raw) {
  if (raw == null) return null;

  let extensions = [];
  let maxFiles = 1;

  if (Array.isArray(raw)) {
    extensions = raw.map(String).map((s) => s.trim()).filter(Boolean);
  } else if (typeof raw === 'object') {
    extensions = Array.isArray(raw.extensions)
      ? raw.extensions.map(String).map((s) => s.trim()).filter(Boolean)
      : [];
    const n = parseInt(raw.maxFiles, 10);
    if (Number.isFinite(n) && n >= 1) maxFiles = Math.min(n, 20);
  }

  if (!extensions.length && maxFiles === 1) return null;
  return { extensions, maxFiles };
}

function optionsForField(fieldType, raw) {
  return fieldType === 'file' ? normalizeFileFieldOptions(raw) : normalizeOptions(raw);
}

function normalizeWidth(raw) {
  const w = String(raw || 'full');
  return FIELD_WIDTHS.has(w) ? w : 'full';
}

function fieldMeta(body, fieldKey, allFields, excludeFieldId) {
  const description = body?.description != null ? normalizeOptionalText(body.description) : null;
  const placeholder = body?.placeholder != null ? normalizeOptionalText(body.placeholder) : null;
  const default_value = body?.default_value != null ? normalizeOptionalText(body.default_value) : null;
  const pool = excludeFieldId ? allFields.filter((f) => Number(f.id) !== excludeFieldId) : allFields;
  const showWhen = body?.show_when != null
    ? parseShowWhen(body.show_when, fieldKey, pool)
    : null;
  return { description, placeholder, default_value, show_when: showWhen };
}

export default async function handler(req, res) {
  adminCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const body = parseBody(req) || {};
  const formId = Number(req.query?.formId || body.form_id);
  const fieldId = Number(req.query?.fieldId || body.id);

  if (!formId) return json(res, 400, { error: 'formId é obrigatório.' });

  const form = await getFormById(formId);
  if (!form) return json(res, 404, { error: 'Formulário não encontrado.' });
  if (form.source_type !== 'dynamic') {
    return json(res, 400, { error: 'Campos só podem ser editados em formulários dinâmicos.' });
  }

  const sql = getSql();

  if (req.method === 'POST') {
    const fieldKey = String(body?.field_key || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const label = String(body?.label || '').trim();
    const fieldType = body?.field_type || 'text';

    if (!fieldKey || !label) return json(res, 400, { error: 'Chave e rótulo são obrigatórios.' });
    if (!FIELD_TYPES.has(fieldType)) return json(res, 400, { error: 'Tipo de campo inválido.' });

    const options = optionsForField(fieldType, body?.options);
    const existing = await getFormFields(formId);
    const meta = fieldMeta(body, fieldKey, existing);

    if (body?.show_when?.field_key && !meta.show_when) {
      return json(res, 400, { error: 'Condicional inválida. Verifique o campo, operador e valor.' });
    }

    try {
      const rows = await sql`
        INSERT INTO form_fields (
          form_id, field_key, label, field_type, required, options,
          description, placeholder, default_value, show_when, field_width, sort_order
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
          ${meta.default_value},
          ${meta.show_when ? JSON.stringify(meta.show_when) : null},
          ${normalizeWidth(body?.field_width)},
          ${Number(body?.sort_order) || 0}
        )
        RETURNING *
      `;
      return json(res, 201, { field: rows[0] });
    } catch (err) {
      if (err?.code === '23505') return json(res, 409, { error: 'Chave de campo já existe.' });
      console.error('form-fields create', err);
      return json(res, 500, { error: 'Erro ao criar campo.' });
    }
  }

  if (req.method === 'PATCH') {
    if (!fieldId && Array.isArray(body.layout)) {
      try {
        for (const item of body.layout) {
          const id = Number(item.id);
          if (!id) continue;
          await sql`
            UPDATE form_fields SET
              sort_order = ${Number(item.sort_order) || 0},
              field_width = ${normalizeWidth(item.field_width)}
            WHERE id = ${id} AND form_id = ${formId}
          `;
        }
        const fields = await getFormFields(formId);
        return json(res, 200, { ok: true, fields });
      } catch (err) {
        console.error('form-fields layout', err);
        return json(res, 500, { error: 'Erro ao salvar layout.' });
      }
    }

    if (!fieldId) return json(res, 400, { error: 'fieldId é obrigatório.' });

    const allFields = await getFormFields(formId);
    const current = allFields.find((f) => Number(f.id) === fieldId);
    if (!current) return json(res, 404, { error: 'Campo não encontrado.' });

    const fieldKey = body?.field_key != null
      ? String(body.field_key).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
      : current.field_key;
    const label = body?.label != null ? String(body.label).trim() : current.label;
    const fieldType = body?.field_type || current.field_type;

    if (!FIELD_TYPES.has(fieldType)) {
      return json(res, 400, { error: 'Tipo de campo inválido.' });
    }

    const options = body?.options !== undefined
      ? optionsForField(fieldType, body.options)
      : optionsForField(fieldType, current.options);
    const description = body?.description !== undefined
      ? normalizeOptionalText(body.description)
      : normalizeOptionalText(current.description);
    const placeholder = body?.placeholder !== undefined
      ? normalizeOptionalText(body.placeholder)
      : normalizeOptionalText(current.placeholder);
    const default_value = body?.default_value !== undefined
      ? normalizeOptionalText(body.default_value)
      : normalizeOptionalText(current.default_value);
    const fieldWidth = body?.field_width !== undefined ? normalizeWidth(body.field_width) : normalizeWidth(current.field_width);

    let showWhenParam = current.show_when;
    if (body?.show_when !== undefined) {
      if (body.show_when === null || !body.show_when?.field_key) {
        showWhenParam = null;
      } else {
        const parsed = parseShowWhen(body.show_when, fieldKey, allFields.filter((f) => Number(f.id) !== fieldId));
        if (!parsed) return json(res, 400, { error: 'Condicional inválida.' });
        showWhenParam = parsed;
      }
    }

    try {
      const rows = await sql`
        UPDATE form_fields SET
          field_key = ${fieldKey},
          label = ${label},
          field_type = ${fieldType},
          required = ${Boolean(body?.required)},
          options = ${options ? JSON.stringify(options) : null},
          description = ${description},
          placeholder = ${placeholder},
          default_value = ${default_value},
          show_when = ${showWhenParam ? JSON.stringify(showWhenParam) : null},
          field_width = ${fieldWidth}
        WHERE id = ${fieldId} AND form_id = ${formId}
        RETURNING *
      `;
      if (!rows[0]) return json(res, 404, { error: 'Campo não encontrado.' });
      return json(res, 200, { field: rows[0], ok: true });
    } catch (err) {
      console.error('form-fields patch', err);
      return json(res, 500, { error: 'Erro ao atualizar campo.' });
    }
  }

  if (req.method === 'DELETE') {
    if (!fieldId) return json(res, 400, { error: 'fieldId é obrigatório.' });
    try {
      await sql`DELETE FROM form_fields WHERE id = ${fieldId} AND form_id = ${formId}`;
      return json(res, 200, { ok: true });
    } catch (err) {
      console.error('form-fields delete', err);
      return json(res, 500, { error: 'Erro ao excluir campo.' });
    }
  }

  return json(res, 405, { error: 'Método não permitido.' });
}
