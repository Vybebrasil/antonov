import { getSql } from './db.js';

/** Chave YYYY-MM-DD a partir de DATE do Postgres (string ou Date). */
export function dayKey(value) {
  if (value == null) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s.slice(0, 10);
}

export function normalizeOptionalText(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return null;
  return s;
}

export function formatSubmissionValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => formatSubmissionValue(item)).filter(Boolean).join(', ');
  }
  if (value === true) return 'Sim';
  if (value === false) return 'Não';
  if (value == null) return '';
  const s = String(value).trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return '';
  return s;
}

export function normalizeSubmissionPayload(raw) {
  const payload = typeof raw === 'object' && raw && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      out[key] = value
        .map((item) => formatSubmissionValue(item))
        .filter((item) => item !== '');
    } else if (value === true || value === false) out[key] = value;
    else out[key] = formatSubmissionValue(value);
  }
  return out;
}

export function checkboxFieldOptions(field) {
  if (field?.field_type !== 'checkbox' || !Array.isArray(field.options)) return [];
  return field.options.map(String).filter(Boolean);
}

export function isCheckboxGroup(field) {
  return checkboxFieldOptions(field).length > 0;
}

function parseCheckboxGroupFromBody(body, field) {
  const allowed = checkboxFieldOptions(field);
  const raw = body[field.field_key];
  const selected = Array.isArray(raw)
    ? raw
    : (raw != null && raw !== '' && raw !== false ? [raw] : []);
  return selected.map(String).filter((v) => allowed.includes(v));
}

function mapFormFieldRow(field) {
  return {
    ...field,
    description: normalizeOptionalText(field.description),
    placeholder: normalizeOptionalText(field.placeholder),
    default_value: normalizeOptionalText(field.default_value),
  };
}

export const LEGACY_TABLES = {
  leads_tour: {
    columns: ['nome', 'email', 'telefone', 'interesse', 'melhor_dia', 'melhor_turno', 'mensagem'],
    labels: {
      nome: 'Nome',
      email: 'E-mail',
      telefone: 'Telefone',
      interesse: 'Interesse',
      melhor_dia: 'Melhor dia',
      melhor_turno: 'Melhor turno',
      mensagem: 'Mensagem',
    },
  },
  leads_curriculos: {
    columns: ['nome', 'email', 'telefone', 'area', 'disponibilidade', 'mensagem'],
    labels: {
      nome: 'Nome',
      email: 'E-mail',
      telefone: 'Telefone',
      area: 'Área',
      disponibilidade: 'Disponibilidade',
      mensagem: 'Mensagem',
    },
  },
  leads_pre_matricula: {
    columns: ['nome', 'email', 'telefone', 'interesse', 'mensagem'],
    labels: {
      nome: 'Nome',
      email: 'E-mail',
      telefone: 'Telefone',
      interesse: 'Interesse',
      mensagem: 'Mensagem',
    },
  },
};

export async function getFormById(id) {
  const sql = getSql();
  const rows = await sql`SELECT * FROM forms WHERE id = ${id} LIMIT 1`;
  return rows[0] || null;
}

export async function getFormBySlug(slug) {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM forms WHERE slug = ${slug} AND status = 'active' LIMIT 1
  `;
  return rows[0] || null;
}

export async function listForms(includeArchived = false) {
  const sql = getSql();
  if (includeArchived) {
    return sql`SELECT * FROM forms ORDER BY source_type DESC, name ASC`;
  }
  return sql`SELECT * FROM forms WHERE status = 'active' ORDER BY source_type DESC, name ASC`;
}

export async function getFormFields(formId) {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM form_fields
    WHERE form_id = ${formId}
    ORDER BY sort_order ASC, id ASC
  `;
  return rows.map(mapFormFieldRow);
}

export async function countLegacySubmissions(table, from, to, search) {
  if (!LEGACY_TABLES[table]) return 0;
  const sql = getSql();

  if (search) {
    if (table === 'leads_tour') {
      const r = await sql`
        SELECT COUNT(*)::int AS n FROM leads_tour
        WHERE created_at >= ${from} AND created_at <= ${to}
        AND (
          LOWER(nome) LIKE ${`%${search.toLowerCase()}%`}
          OR LOWER(email) LIKE ${`%${search.toLowerCase()}%`}
          OR LOWER(telefone) LIKE ${`%${search.toLowerCase()}%`}
        )
      `;
      return r[0]?.n || 0;
    }
    if (table === 'leads_curriculos') {
      const r = await sql`
        SELECT COUNT(*)::int AS n FROM leads_curriculos
        WHERE created_at >= ${from} AND created_at <= ${to}
        AND (
          LOWER(nome) LIKE ${`%${search.toLowerCase()}%`}
          OR LOWER(email) LIKE ${`%${search.toLowerCase()}%`}
          OR LOWER(telefone) LIKE ${`%${search.toLowerCase()}%`}
        )
      `;
      return r[0]?.n || 0;
    }
    if (table === 'leads_pre_matricula') {
      const r = await sql`
        SELECT COUNT(*)::int AS n FROM leads_pre_matricula
        WHERE created_at >= ${from} AND created_at <= ${to}
        AND (
          LOWER(nome) LIKE ${`%${search.toLowerCase()}%`}
          OR LOWER(email) LIKE ${`%${search.toLowerCase()}%`}
          OR LOWER(telefone) LIKE ${`%${search.toLowerCase()}%`}
        )
      `;
      return r[0]?.n || 0;
    }
    return 0;
  }

  if (table === 'leads_tour') {
    const r = await sql`
      SELECT COUNT(*)::int AS n FROM leads_tour
      WHERE created_at >= ${from} AND created_at <= ${to}
    `;
    return r[0]?.n || 0;
  }
  if (table === 'leads_curriculos') {
    const r = await sql`
      SELECT COUNT(*)::int AS n FROM leads_curriculos
      WHERE created_at >= ${from} AND created_at <= ${to}
    `;
    return r[0]?.n || 0;
  }
  if (table === 'leads_pre_matricula') {
    const r = await sql`
      SELECT COUNT(*)::int AS n FROM leads_pre_matricula
      WHERE created_at >= ${from} AND created_at <= ${to}
    `;
    return r[0]?.n || 0;
  }
  return 0;
}

const LEGACY_TABLE_SELECT = {
  leads_tour:
    'id, nome, email, telefone, interesse, melhor_dia, melhor_turno, mensagem, page, created_at',
  leads_curriculos:
    'id, nome, email, telefone, area, disponibilidade, mensagem, page, created_at',
  leads_pre_matricula: 'id, nome, email, telefone, interesse, mensagem, page, created_at',
};

function buildLegacyOrderBy(table, sort, order) {
  const meta = LEGACY_TABLES[table];
  if (!meta) return 'created_at DESC';
  const allowed = new Set(['id', 'created_at', 'page', ...meta.columns]);
  const col = allowed.has(sort) ? sort : 'created_at';
  const dir = order === 'asc' ? 'ASC' : 'DESC';
  return `${col} ${dir} NULLS LAST`;
}

function buildDynamicOrderBy(sort, order, columns) {
  const dir = order === 'asc' ? 'ASC' : 'DESC';
  if (sort === 'id') return `id ${dir}`;
  if (sort === 'created_at') return `created_at ${dir}`;
  if (columns.includes(sort) && /^[a-z0-9_]+$/i.test(sort)) {
    return `(payload->>'${sort}') ${dir} NULLS LAST`;
  }
  return 'created_at DESC';
}

export async function fetchLegacySubmissions(
  table,
  { from, to, search, limit, offset, sort = 'created_at', order = 'desc' },
) {
  if (!LEGACY_TABLES[table] || !LEGACY_TABLE_SELECT[table]) return [];
  const sql = getSql();
  const cols = LEGACY_TABLE_SELECT[table];
  const orderBy = buildLegacyOrderBy(table, sort, order);

  if (search) {
    const s = `%${search.toLowerCase()}%`;
    return sql(
      `SELECT ${cols} FROM ${table}
       WHERE created_at >= $1 AND created_at <= $2
       AND (LOWER(nome) LIKE $3 OR LOWER(email) LIKE $3 OR LOWER(telefone) LIKE $3)
       ORDER BY ${orderBy} LIMIT $4 OFFSET $5`,
      [from, to, s, limit, offset],
    );
  }

  return sql(
    `SELECT ${cols} FROM ${table}
     WHERE created_at >= $1 AND created_at <= $2
     ORDER BY ${orderBy} LIMIT $3 OFFSET $4`,
    [from, to, limit, offset],
  );
}

export function normalizeLegacyRow(row, table) {
  const meta = LEGACY_TABLES[table];
  const payload = {};
  for (const col of meta.columns) {
    payload[col] = row[col] ?? '';
  }
  return {
    id: row.id,
    created_at: row.created_at,
    payload,
  };
}

export async function countDynamicSubmissions(formId, from, to, search) {
  const sql = getSql();
  if (search) {
    const s = `%${search.toLowerCase()}%`;
    const rows = await sql`
      SELECT COUNT(*)::int AS n FROM form_submissions
      WHERE form_id = ${formId}
      AND created_at >= ${from} AND created_at <= ${to}
      AND payload::text ILIKE ${s}
    `;
    return rows[0]?.n || 0;
  }
  const rows = await sql`
    SELECT COUNT(*)::int AS n FROM form_submissions
    WHERE form_id = ${formId}
    AND created_at >= ${from} AND created_at <= ${to}
  `;
  return rows[0]?.n || 0;
}

export async function fetchDynamicSubmissions(
  formId,
  { from, to, search, limit, offset, sort = 'created_at', order = 'desc', columns = [] },
) {
  const sql = getSql();
  const orderBy = buildDynamicOrderBy(sort, order, columns);

  if (search) {
    const s = `%${search.toLowerCase()}%`;
    return sql(
      `SELECT id, payload, page, created_at
       FROM form_submissions
       WHERE form_id = $1 AND created_at >= $2 AND created_at <= $3
       AND payload::text ILIKE $4
       ORDER BY ${orderBy} LIMIT $5 OFFSET $6`,
      [formId, from, to, s, limit, offset],
    );
  }

  return sql(
    `SELECT id, payload, page, created_at
     FROM form_submissions
     WHERE form_id = $1 AND created_at >= $2 AND created_at <= $3
     ORDER BY ${orderBy} LIMIT $4 OFFSET $5`,
    [formId, from, to, limit, offset],
  );
}

export async function deleteDynamicSubmission(formId, submissionId) {
  const sql = getSql();
  const rows = await sql`
    DELETE FROM form_submissions
    WHERE id = ${submissionId} AND form_id = ${formId}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function deleteLegacySubmission(table, submissionId) {
  if (!LEGACY_TABLES[table]) return false;
  const sql = getSql();
  const id = Number(submissionId);
  if (!id) return false;

  if (table === 'leads_tour') {
    const rows = await sql`DELETE FROM leads_tour WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  }
  if (table === 'leads_curriculos') {
    const rows = await sql`DELETE FROM leads_curriculos WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  }
  if (table === 'leads_pre_matricula') {
    const rows = await sql`DELETE FROM leads_pre_matricula WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  }
  return false;
}

export async function getSubmissionStats(fromIso, toIso = null) {
  const sql = getSql();
  const forms = await listForms(true);
  const stats = [];

  for (const form of forms) {
    let count = 0;
    if (form.source_type === 'legacy' && LEGACY_TABLES[form.legacy_table]) {
      if (form.legacy_table === 'leads_tour') {
        const r = toIso
          ? await sql`SELECT COUNT(*)::int AS n FROM leads_tour WHERE created_at >= ${fromIso} AND created_at < ${toIso}`
          : await sql`SELECT COUNT(*)::int AS n FROM leads_tour WHERE created_at >= ${fromIso}`;
        count = r[0]?.n || 0;
      } else if (form.legacy_table === 'leads_curriculos') {
        const r = toIso
          ? await sql`SELECT COUNT(*)::int AS n FROM leads_curriculos WHERE created_at >= ${fromIso} AND created_at < ${toIso}`
          : await sql`SELECT COUNT(*)::int AS n FROM leads_curriculos WHERE created_at >= ${fromIso}`;
        count = r[0]?.n || 0;
      } else if (form.legacy_table === 'leads_pre_matricula') {
        const r = toIso
          ? await sql`SELECT COUNT(*)::int AS n FROM leads_pre_matricula WHERE created_at >= ${fromIso} AND created_at < ${toIso}`
          : await sql`SELECT COUNT(*)::int AS n FROM leads_pre_matricula WHERE created_at >= ${fromIso}`;
        count = r[0]?.n || 0;
      }
    } else if (form.source_type === 'dynamic') {
      const r = toIso
        ? await sql`
            SELECT COUNT(*)::int AS n FROM form_submissions
            WHERE form_id = ${form.id} AND created_at >= ${fromIso} AND created_at < ${toIso}
          `
        : await sql`
            SELECT COUNT(*)::int AS n FROM form_submissions
            WHERE form_id = ${form.id} AND created_at >= ${fromIso}
          `;
      count = r[0]?.n || 0;
    }
    stats.push({ form_id: form.id, name: form.name, slug: form.slug, count });
  }

  return stats;
}

export async function countAllInRange(fromIso, toIso) {
  const sql = getSql();
  const [t, c, p, d] = await Promise.all([
    sql`SELECT COUNT(*)::int AS n FROM leads_tour WHERE created_at >= ${fromIso} AND created_at < ${toIso}`,
    sql`SELECT COUNT(*)::int AS n FROM leads_curriculos WHERE created_at >= ${fromIso} AND created_at < ${toIso}`,
    sql`SELECT COUNT(*)::int AS n FROM leads_pre_matricula WHERE created_at >= ${fromIso} AND created_at < ${toIso}`,
    sql`SELECT COUNT(*)::int AS n FROM form_submissions WHERE created_at >= ${fromIso} AND created_at < ${toIso}`,
  ]);
  return (t[0]?.n || 0) + (c[0]?.n || 0) + (p[0]?.n || 0) + (d[0]?.n || 0);
}

export async function countFormInRange(formId, fromIso, toIso) {
  const form = await getFormById(formId);
  if (!form) return 0;
  const sql = getSql();

  if (form.source_type === 'legacy' && LEGACY_TABLES[form.legacy_table]) {
    const table = form.legacy_table;
    if (table === 'leads_tour') {
      const r = await sql`SELECT COUNT(*)::int AS n FROM leads_tour WHERE created_at >= ${fromIso} AND created_at < ${toIso}`;
      return r[0]?.n || 0;
    }
    if (table === 'leads_curriculos') {
      const r = await sql`SELECT COUNT(*)::int AS n FROM leads_curriculos WHERE created_at >= ${fromIso} AND created_at < ${toIso}`;
      return r[0]?.n || 0;
    }
    if (table === 'leads_pre_matricula') {
      const r = await sql`SELECT COUNT(*)::int AS n FROM leads_pre_matricula WHERE created_at >= ${fromIso} AND created_at < ${toIso}`;
      return r[0]?.n || 0;
    }
    return 0;
  }

  const r = await sql`
    SELECT COUNT(*)::int AS n FROM form_submissions
    WHERE form_id = ${formId} AND created_at >= ${fromIso} AND created_at < ${toIso}
  `;
  return r[0]?.n || 0;
}

async function dailyCountsFromRows(rows, fromIso, toIso) {
  const start = startOfUtcDay(fromIso);
  const endExclusive = parseEndExclusive(toIso);
  const map = new Map();
  for (const r of rows) {
    const key = dayKey(r.day);
    map.set(key, (map.get(key) || 0) + r.n);
  }
  const out = [];
  const cursor = new Date(start);
  while (cursor < endExclusive) {
    const key = cursor.toISOString().slice(0, 10);
    out.push({ day: key, count: map.get(key) || 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export async function getDailyCountsForForm(formId, fromIso, toIso) {
  const form = await getFormById(formId);
  if (!form) return [];
  const sql = getSql();
  const start = startOfUtcDay(fromIso);
  const endExclusive = parseEndExclusive(toIso);
  const from = start.toISOString();
  const to = endExclusive.toISOString();

  if (form.source_type === 'legacy' && form.legacy_table === 'leads_tour') {
    const rows = await sql`
      SELECT TO_CHAR(DATE(created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
      FROM leads_tour WHERE created_at >= ${from} AND created_at < ${to}
      GROUP BY 1 ORDER BY 1
    `;
    return dailyCountsFromRows(rows, fromIso, toIso);
  }
  if (form.source_type === 'legacy' && form.legacy_table === 'leads_curriculos') {
    const rows = await sql`
      SELECT TO_CHAR(DATE(created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
      FROM leads_curriculos WHERE created_at >= ${from} AND created_at < ${to}
      GROUP BY 1 ORDER BY 1
    `;
    return dailyCountsFromRows(rows, fromIso, toIso);
  }
  if (form.source_type === 'legacy' && form.legacy_table === 'leads_pre_matricula') {
    const rows = await sql`
      SELECT TO_CHAR(DATE(created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
      FROM leads_pre_matricula WHERE created_at >= ${from} AND created_at < ${to}
      GROUP BY 1 ORDER BY 1
    `;
    return dailyCountsFromRows(rows, fromIso, toIso);
  }

  const rows = await sql`
    SELECT TO_CHAR(DATE(created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
    FROM form_submissions
    WHERE form_id = ${formId} AND created_at >= ${from} AND created_at < ${to}
    GROUP BY 1 ORDER BY 1
  `;
  return dailyCountsFromRows(rows, fromIso, toIso);
}

function startOfUtcDay(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function parseEndExclusive(toIso) {
  const d = new Date(toIso);
  const midnight = startOfUtcDay(d);
  if (d.getTime() === midnight.getTime()) return midnight;
  const end = new Date(midnight);
  end.setUTCDate(end.getUTCDate() + 1);
  return end;
}

export async function getDailyCountsBetween(fromIso, toIso) {
  const sql = getSql();
  const start = startOfUtcDay(fromIso);
  const endExclusive = parseEndExclusive(toIso);
  const from = start.toISOString();
  const to = endExclusive.toISOString();

  const tour = await sql`
    SELECT TO_CHAR(DATE(created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
    FROM leads_tour WHERE created_at >= ${from} AND created_at < ${to}
    GROUP BY 1 ORDER BY 1
  `;
  const cur = await sql`
    SELECT TO_CHAR(DATE(created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
    FROM leads_curriculos WHERE created_at >= ${from} AND created_at < ${to}
    GROUP BY 1 ORDER BY 1
  `;
  const pre = await sql`
    SELECT TO_CHAR(DATE(created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
    FROM leads_pre_matricula WHERE created_at >= ${from} AND created_at < ${to}
    GROUP BY 1 ORDER BY 1
  `;
  const dyn = await sql`
    SELECT TO_CHAR(DATE(created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
    FROM form_submissions WHERE created_at >= ${from} AND created_at < ${to}
    GROUP BY 1 ORDER BY 1
  `;

  const map = new Map();
  for (const rows of [tour, cur, pre, dyn]) {
    for (const r of rows) {
      const key = dayKey(r.day);
      map.set(key, (map.get(key) || 0) + r.n);
    }
  }

  const out = [];
  const cursor = new Date(start);
  while (cursor < endExclusive) {
    const key = cursor.toISOString().slice(0, 10);
    out.push({ day: key, count: map.get(key) || 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function previewFromPayload(payload) {
  const data = typeof payload === 'object' && payload ? payload : {};
  for (const key of ['nome', 'name', 'email', 'telefone', 'titulo', 'label']) {
    const val = data[key];
    if (typeof val === 'string' && val.trim()) return val.trim().slice(0, 100);
  }
  for (const val of Object.values(data)) {
    if (typeof val === 'string' && val.trim()) return val.trim().slice(0, 100);
    if (Array.isArray(val) && val.length) return val.join(', ').slice(0, 100);
  }
  return 'Nova resposta';
}

export async function getRecentSubmissions(limit = 8, fromIso = null, toIso = null, formId = null) {
  const sql = getSql();
  const forms = await listForms(true);
  const legacyForm = {};
  for (const f of forms) {
    if (f.legacy_table) legacyForm[f.legacy_table] = f;
  }

  const fetchLimit = Math.min(Math.max(limit * 3, limit), 40);
  const items = [];

  const inRange = (iso) => {
    if (!fromIso && !toIso) return true;
    const t = new Date(iso).getTime();
    if (fromIso && t < new Date(fromIso).getTime()) return false;
    if (toIso && t >= new Date(toIso).getTime()) return false;
    return true;
  };

  const tour = await sql`
    SELECT id, nome, email, created_at FROM leads_tour
    ORDER BY created_at DESC LIMIT ${fetchLimit}
  `;
  for (const r of tour) {
    if (!inRange(r.created_at)) continue;
    const f = legacyForm.leads_tour;
    items.push({
      id: `tour-${r.id}`,
      form_id: f?.id || null,
      form_name: f?.name || 'Contato',
      form_slug: f?.slug || '',
      created_at: r.created_at,
      preview: r.nome || r.email || 'Nova resposta',
    });
  }

  const cur = await sql`
    SELECT id, nome, email, created_at FROM leads_curriculos
    ORDER BY created_at DESC LIMIT ${fetchLimit}
  `;
  for (const r of cur) {
    if (!inRange(r.created_at)) continue;
    const f = legacyForm.leads_curriculos;
    items.push({
      id: `cur-${r.id}`,
      form_id: f?.id || null,
      form_name: f?.name || 'Trabalhe conosco',
      form_slug: f?.slug || '',
      created_at: r.created_at,
      preview: r.nome || r.email || 'Nova resposta',
    });
  }

  const pre = await sql`
    SELECT id, nome, email, created_at FROM leads_pre_matricula
    ORDER BY created_at DESC LIMIT ${fetchLimit}
  `;
  for (const r of pre) {
    if (!inRange(r.created_at)) continue;
    const f = legacyForm.leads_pre_matricula;
    items.push({
      id: `pre-${r.id}`,
      form_id: f?.id || null,
      form_name: f?.name || 'Pré-matrícula',
      form_slug: f?.slug || '',
      created_at: r.created_at,
      preview: r.nome || r.email || 'Nova resposta',
    });
  }

  const dyn = await sql`
    SELECT fs.id, fs.created_at, fs.payload, f.id AS form_id, f.name, f.slug
    FROM form_submissions fs
    JOIN forms f ON f.id = fs.form_id
    ORDER BY fs.created_at DESC
    LIMIT ${fetchLimit}
  `;
  for (const r of dyn) {
    if (!inRange(r.created_at)) continue;
    const payload = typeof r.payload === 'object' ? r.payload : JSON.parse(r.payload || '{}');
    items.push({
      id: `dyn-${r.id}`,
      form_id: r.form_id,
      form_name: r.name,
      form_slug: r.slug,
      created_at: r.created_at,
      preview: previewFromPayload(payload),
    });
  }

  items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const filtered = formId ? items.filter((item) => item.form_id === formId) : items;
  return filtered.slice(0, limit);
}

export async function getDailyCounts(days = 30) {
  const sql = getSql();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  const tour = await sql`
    SELECT TO_CHAR(DATE(created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
    FROM leads_tour WHERE created_at >= ${since.toISOString()}
    GROUP BY 1 ORDER BY 1
  `;
  const cur = await sql`
    SELECT TO_CHAR(DATE(created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
    FROM leads_curriculos WHERE created_at >= ${since.toISOString()}
    GROUP BY 1 ORDER BY 1
  `;
  const pre = await sql`
    SELECT TO_CHAR(DATE(created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
    FROM leads_pre_matricula WHERE created_at >= ${since.toISOString()}
    GROUP BY 1 ORDER BY 1
  `;
  const dyn = await sql`
    SELECT TO_CHAR(DATE(created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
    FROM form_submissions WHERE created_at >= ${since.toISOString()}
    GROUP BY 1 ORDER BY 1
  `;

  const map = new Map();
  for (const rows of [tour, cur, pre, dyn]) {
    for (const r of rows) {
      const key = dayKey(r.day);
      map.set(key, (map.get(key) || 0) + r.n);
    }
  }

  const out = [];
  for (let i = 0; i <= days; i++) {
    const d = new Date(since);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, count: map.get(key) || 0 });
  }
  return out;
}

export function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

function normCondValue(v) {
  return String(v ?? '').trim().toLowerCase();
}

export function fieldIsVisible(field, values) {
  const cond = field.show_when;
  if (!cond?.field_key) return true;

  const parentVal = values[cond.field_key];
  const op = cond.operator || 'equals';

  if (op === 'checked') {
    if (Array.isArray(parentVal)) return parentVal.length > 0;
    return Boolean(parentVal);
  }
  if (op === 'not_checked') {
    if (Array.isArray(parentVal)) return parentVal.length === 0;
    return !Boolean(parentVal);
  }

  if (Array.isArray(parentVal)) {
    const normalized = parentVal.map(normCondValue);
    const expected = normCondValue(cond.value);
    if (op === 'equals') return normalized.includes(expected);
    if (op === 'not_equals') return !normalized.includes(expected);
    if (op === 'contains') return normalized.some((v) => v.includes(expected));
    return true;
  }

  const str = normCondValue(parentVal);
  const expected = normCondValue(cond.value);

  if (op === 'equals') return str === expected;
  if (op === 'not_equals') return str !== expected;
  if (op === 'contains') return str.includes(expected);
  return true;
}

export function buildFieldValues(fields, body) {
  const values = {};
  for (const f of fields) {
    if (isCheckboxGroup(f)) values[f.field_key] = parseCheckboxGroupFromBody(body, f);
    else if (f.field_type === 'checkbox') values[f.field_key] = Boolean(body[f.field_key]);
    else values[f.field_key] = String(body[f.field_key] ?? '').trim();
  }
  return values;
}

export function parseShowWhen(raw, fieldKey, allFields) {
  if (!raw || typeof raw !== 'object' || !raw.field_key) return null;

  const parentKey = String(raw.field_key).trim();
  const parent = allFields.find((f) => f.field_key === parentKey);
  if (!parent || parentKey === fieldKey) return null;

  const operator = String(raw.operator || 'equals');
  const allowed = new Set(['equals', 'not_equals', 'contains', 'checked', 'not_checked']);
  if (!allowed.has(operator)) return null;

  if (operator === 'checked' || operator === 'not_checked') {
    if (parent.field_type !== 'checkbox') return null;
    return { field_key: parentKey, operator };
  }

  const value = String(raw.value ?? '').trim();
  if (!value) return null;

  return { field_key: parentKey, operator, value };
}

export async function validateDynamicPayload(fields, body) {
  const values = buildFieldValues(fields, body);
  const payload = {};

  for (const f of fields) {
    const visible = fieldIsVisible(f, values);

    if (f.field_type === 'checkbox') {
      if (isCheckboxGroup(f)) {
        const selected = visible ? parseCheckboxGroupFromBody(body, f) : [];
        payload[f.field_key] = selected;
        if (visible && f.required && !selected.length) {
          return { error: `Campo obrigatório: ${f.label}` };
        }
      } else {
        payload[f.field_key] = visible ? Boolean(body[f.field_key]) : false;
        if (visible && f.required && !payload[f.field_key]) {
          return { error: `Campo obrigatório: ${f.label}` };
        }
      }
      continue;
    }

    const val = visible ? String(body[f.field_key] ?? '').trim() : '';

    if (visible && f.required && !val) {
      return { error: `Campo obrigatório: ${f.label}` };
    }
    if (val && f.field_type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      return { error: `E-mail inválido: ${f.label}` };
    }
    if (val && f.field_type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      return { error: `Data inválida: ${f.label}` };
    }
    if (val && f.field_type === 'number' && Number.isNaN(Number(val))) {
      return { error: `Número inválido: ${f.label}` };
    }
    if (val && (f.field_type === 'select' || f.field_type === 'radio') && f.options?.length) {
      const opts = f.options.map(String);
      if (!opts.includes(val)) return { error: `Opção inválida: ${f.label}` };
    }
    payload[f.field_key] = val;
  }
  return { payload: normalizeSubmissionPayload(payload) };
}
