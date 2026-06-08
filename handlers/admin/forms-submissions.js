import { json, adminCors } from '../../api/lib/admin-http.js';
import { requireAdmin } from '../../api/lib/admin-auth.js';
import {
  getFormById,
  getFormFields,
  countLegacySubmissions,
  fetchLegacySubmissions,
  countDynamicSubmissions,
  fetchDynamicSubmissions,
  normalizeLegacyRow,
  normalizeSubmissionPayload,
  LEGACY_TABLES,
} from '../../api/lib/forms.js';

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 30);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default async function handler(req, res) {
  adminCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const formId = Number(req.query?.id);
  if (!formId) return json(res, 400, { error: 'ID inválido.' });

  const form = await getFormById(formId);
  if (!form) return json(res, 404, { error: 'Formulário não encontrado.' });

  const q = req.query || {};
  const defaults = defaultRange();
  const from = q.from || defaults.from;
  const to = q.to || defaults.to;
  const search = q.search ? String(q.search).trim() : '';
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 25));
  const offset = (page - 1) * limit;

  try {
    let total = 0;
    let rows = [];
    let columns = [];
    let labels = {};

    if (form.source_type === 'legacy' && LEGACY_TABLES[form.legacy_table]) {
      const meta = LEGACY_TABLES[form.legacy_table];
      columns = meta.columns;
      labels = meta.labels;
      total = await countLegacySubmissions(form.legacy_table, from, to, search);
      const raw = await fetchLegacySubmissions(form.legacy_table, { from, to, search, limit, offset });
      rows = raw.map((r) => normalizeLegacyRow(r, form.legacy_table));
    } else {
      const fields = await getFormFields(formId);
      columns = fields.map((f) => f.field_key);
      labels = Object.fromEntries(fields.map((f) => [f.field_key, f.label]));
      total = await countDynamicSubmissions(formId, from, to, search);
      const raw = await fetchDynamicSubmissions(formId, { from, to, search, limit, offset });
      rows = raw.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        page: r.page,
        payload: normalizeSubmissionPayload(
          typeof r.payload === 'object' ? r.payload : JSON.parse(r.payload || '{}')
        ),
      }));
    }

    return json(res, 200, {
      form,
      columns,
      labels,
      submissions: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    console.error('submissions', err);
    return json(res, 500, { error: 'Erro ao listar respostas.' });
  }
}
