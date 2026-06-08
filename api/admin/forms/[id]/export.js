import { json, adminCors } from '../../../lib/admin-http.js';
import { requireAdmin } from '../../../lib/admin-auth.js';
import { getFormById, getFormFields } from '../../../lib/forms.js';
import { getAllSubmissionsForExport, toXlsxBuffer, toPdfBuffer } from '../../../lib/export.js';

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
  const format = q.format === 'pdf' ? 'pdf' : 'xlsx';
  const defaults = defaultRange();
  const from = q.from || defaults.from;
  const to = q.to || defaults.to;
  const search = q.search ? String(q.search).trim() : '';

  try {
    const fields = form.source_type === 'dynamic' ? await getFormFields(formId) : [];
    const { exportRows, columns, labels } = await getAllSubmissionsForExport(form, fields, {
      from,
      to,
      search,
    });

    const safeName = form.slug.replace(/[^a-z0-9-]/gi, '-');
    const date = new Date().toISOString().slice(0, 10);

    if (format === 'pdf') {
      const buf = await toPdfBuffer(`${form.name} — Respostas`, exportRows, columns, labels);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}-${date}.pdf"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.end(buf);
    }

    const buf = toXlsxBuffer(exportRows, form.name);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}-${date}.xlsx"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.end(buf);
  } catch (err) {
    console.error('export', err);
    return json(res, 500, { error: 'Erro ao exportar.' });
  }
}
