import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

export function buildExportRows(submissions, columns, labels) {
  return submissions.map((s) => {
    const row = { ID: s.id, Data: formatDate(s.created_at) };
    for (const col of columns) {
      row[labels[col] || col] = formatSubmissionValue(s.payload[col]);
    }
    if (s.page) row.Página = s.page;
    return row;
  });
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleString('pt-BR', { timeZone: 'America/Bahia' });
}

export function toXlsxBuffer(rows, sheetName = 'Respostas') {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: 'Sem registros' }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function toPdfBuffer(title, rows, columns, labels) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text(title, { align: 'left' });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#666').text(`Gerado em ${formatDate(new Date())}`, { align: 'left' });
    doc.moveDown(1);
    doc.fillColor('#000');

    if (!rows.length) {
      doc.fontSize(11).text('Nenhum registro no período selecionado.');
      doc.end();
      return;
    }

    const headers = ['ID', 'Data', ...columns.map((c) => labels[c] || c)];
    let y = doc.y;
    const colW = (doc.page.width - 80) / headers.length;

    doc.fontSize(8).fillColor('#333');
    headers.forEach((h, i) => {
      doc.text(String(h).slice(0, 24), 40 + i * colW, y, { width: colW - 4, continued: false });
    });
    y += 16;
    doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke('#ccc');
    y += 6;

    for (const row of rows.slice(0, 200)) {
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = 40;
      }
      const cells = [
        row.ID,
        row.Data,
        ...columns.map((c) => String(row[labels[c] || c] ?? '').slice(0, 40)),
      ];
      cells.forEach((cell, i) => {
        doc.text(String(cell), 40 + i * colW, y, { width: colW - 4, lineBreak: false });
      });
      y += 14;
    }

    if (rows.length > 200) {
      doc.moveDown().fontSize(8).fillColor('#666').text(`… e mais ${rows.length - 200} registros. Use XLSX para exportação completa.`);
    }

    doc.end();
  });
}

import {
  fetchLegacySubmissions,
  fetchDynamicSubmissions,
  normalizeLegacyRow,
  getFormFields,
  formatSubmissionValue,
  normalizeSubmissionPayload,
  LEGACY_TABLES,
} from './forms.js';

export async function getAllSubmissionsForExport(form, fields, { from, to, search }) {

  const limit = 10000;
  let raw = [];
  let columns = [];
  let labels = {};

  if (form.source_type === 'legacy' && LEGACY_TABLES[form.legacy_table]) {
    const meta = LEGACY_TABLES[form.legacy_table];
    columns = meta.columns;
    labels = meta.labels;
    const rows = await fetchLegacySubmissions(form.legacy_table, {
      from,
      to,
      search,
      limit,
      offset: 0,
    });
    raw = rows.map((r) => normalizeLegacyRow(r, form.legacy_table));
  } else {
    const flds = fields.length ? fields : await getFormFields(form.id);
    columns = flds.map((f) => f.field_key);
    labels = Object.fromEntries(flds.map((f) => [f.field_key, f.label]));
    const rows = await fetchDynamicSubmissions(form.id, { from, to, search, limit, offset: 0 });
    raw = rows.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      page: r.page,
      payload: normalizeSubmissionPayload(
        typeof r.payload === 'object' ? r.payload : JSON.parse(r.payload || '{}')
      ),
    }));
  }

  const exportRows = buildExportRows(raw, columns, labels);
  return { exportRows, columns, labels };
}
