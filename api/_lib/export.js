import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import {
  fetchLegacySubmissions,
  fetchDynamicSubmissions,
  normalizeLegacyRow,
  getFormFields,
  formatSubmissionValue,
  normalizeSubmissionPayload,
  LEGACY_TABLES,
} from './forms.js';
import { PDF_MARGIN } from './pdf/constants.js';
import { buildPdfSegments } from './pdf/layout.js';
import { drawTitleBlock, renderPdfTable } from './pdf/render.js';

export function buildExportRows(submissions, columns, labels) {
  return submissions.map((s) => {
    const row = { ID: s.id, Data: formatDate(s.created_at) };
    for (const col of columns) {
      row[labels[col] || col] = formatSubmissionValue(s.payload[col]);
    }
    return row;
  });
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleString('pt-BR', { timeZone: 'America/Bahia' });
}

function formatPeriodLabel(from, to) {
  if (!from && !to) return '';
  const fmt = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Bahia' });
  };
  return `Período: ${fmt(from)} a ${fmt(to)}`;
}

export function toXlsxBuffer(rows, sheetName = 'Respostas') {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: 'Sem registros' }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsvBuffer(rows) {
  if (!rows.length) {
    return Buffer.from('\uFEFFInfo\r\nSem registros\r\n', 'utf8');
  }
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(',')),
  ];
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

export function toPdfBuffer(title, rows, columns, labels, meta = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: PDF_MARGIN,
      size: 'A4',
      layout: 'landscape',
      bufferPages: true,
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const tableLeft = PDF_MARGIN;
    const contentWidth = doc.page.width - PDF_MARGIN * 2;
    const footerY = doc.page.height - PDF_MARGIN + 10;
    const bottomLimit = () => doc.page.height - PDF_MARGIN - 22;
    const period = formatPeriodLabel(meta.from, meta.to);
    const generatedAt = formatDate(new Date());

    if (!rows.length) {
      drawTitleBlock(doc, {
        tableLeft,
        contentWidth,
        pdfMargin: PDF_MARGIN,
        title,
        segmentIndex: 0,
        segmentCount: 1,
        segment: { columns: [], fieldStart: 0, fieldEnd: 0 },
        totalFieldColumns: columns.length,
        labels,
        period,
        generatedAt,
        rowCount: 0,
      });
      doc.font('Helvetica').fontSize(10).fillColor('#444444')
        .text('Nenhum registro no período selecionado.', tableLeft, doc.y, {
          width: contentWidth,
          lineBreak: true,
        });
      doc.end();
      return;
    }

    const segments = buildPdfSegments(doc, columns, labels, rows, contentWidth);

    renderPdfTable(doc, {
      tableLeft,
      contentWidth,
      pdfMargin: PDF_MARGIN,
      footerY,
      bottomLimit,
      title,
      rows,
      columns,
      labels,
      segments,
      period,
      generatedAt,
    });

    doc.end();
  });
}

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
        typeof r.payload === 'object' ? r.payload : JSON.parse(r.payload || '{}'),
      ),
    }));
  }

  const exportRows = buildExportRows(raw, columns, labels);
  return { exportRows, columns, labels };
}
