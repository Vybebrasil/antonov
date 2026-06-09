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

const PDF_MARGIN = 48;
const PDF_MAX_ROWS = 300;

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

function fieldEntries(row, columns, labels) {
  const entries = columns.map((col) => ({
    label: labels[col] || col,
    value: String(row[labels[col] || col] ?? '').trim(),
  }));
  if (row.Página) {
    entries.push({ label: 'Página', value: String(row.Página) });
  }
  return entries;
}

export function toPdfBuffer(title, rows, columns, labels, meta = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: PDF_MARGIN,
      size: 'A4',
      layout: 'portrait',
      bufferPages: true,
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const contentWidth = doc.page.width - PDF_MARGIN * 2;
    const innerX = PDF_MARGIN + 12;
    const innerWidth = contentWidth - 12;
    const footerY = doc.page.height - PDF_MARGIN + 8;

    function drawDocumentHeader() {
      doc.font('Helvetica-Bold').fontSize(15).fillColor('#111111')
        .text(title, PDF_MARGIN, PDF_MARGIN, { width: contentWidth, lineBreak: true });

      const period = formatPeriodLabel(meta.from, meta.to);
      doc.font('Helvetica').fontSize(9).fillColor('#555555');
      if (period) {
        doc.text(period, { width: contentWidth, lineBreak: true });
      }
      doc.text(`Gerado em ${formatDate(new Date())} · ${rows.length} registro(s)`, {
        width: contentWidth,
        lineBreak: true,
      });
      doc.moveDown(0.6);
      doc.strokeColor('#dddddd').lineWidth(1)
        .moveTo(PDF_MARGIN, doc.y)
        .lineTo(doc.page.width - PDF_MARGIN, doc.y)
        .stroke();
      doc.moveDown(0.8);
    }

    function bottomLimit() {
      return doc.page.height - PDF_MARGIN - 28;
    }

    function ensureSpace(minHeight) {
      if (doc.y + minHeight > bottomLimit()) {
        doc.addPage();
        drawDocumentHeader();
      }
    }

    function drawField(label, value) {
      const safeValue = value || '—';
      const labelHeight = doc.heightOfString(label.toUpperCase(), {
        width: innerWidth,
        lineGap: 1,
      });
      const valueHeight = doc.heightOfString(safeValue, {
        width: innerWidth,
        lineGap: 2,
      });
      ensureSpace(labelHeight + valueHeight + 14);

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#777777')
        .text(label.toUpperCase(), innerX, doc.y, { width: innerWidth, lineGap: 1 });
      doc.font('Helvetica').fontSize(10).fillColor('#111111')
        .text(safeValue, innerX, doc.y, { width: innerWidth, lineGap: 2 });
      doc.moveDown(0.35);
    }

    function drawRecord(row) {
      const entries = fieldEntries(row, columns, labels);

      const previewHeight = entries.reduce((sum, entry) => {
        doc.font('Helvetica-Bold').fontSize(8);
        const lh = doc.heightOfString(entry.label.toUpperCase(), { width: innerWidth });
        doc.font('Helvetica').fontSize(10);
        const vh = doc.heightOfString(entry.value || '—', { width: innerWidth, lineGap: 2 });
        return sum + lh + vh + 14;
      }, 48);

      ensureSpace(Math.min(previewHeight, bottomLimit() - doc.y));

      const blockTop = doc.y;
      doc.save();
      doc.rect(PDF_MARGIN, blockTop, 3, 24).fill('#fab10f');
      doc.restore();

      doc.y = blockTop;
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#111111')
        .text(`Registro #${row.ID}`, innerX, doc.y, { width: innerWidth, lineBreak: true });
      doc.font('Helvetica').fontSize(9).fillColor('#666666')
        .text(String(row.Data || ''), innerX, doc.y, { width: innerWidth, lineBreak: true });
      doc.moveDown(0.35);
      doc.strokeColor('#eeeeee').lineWidth(1)
        .moveTo(PDF_MARGIN + 12, doc.y)
        .lineTo(doc.page.width - PDF_MARGIN, doc.y)
        .stroke();
      doc.moveDown(0.45);

      for (const entry of entries) {
        drawField(entry.label, entry.value);
      }

      doc.moveDown(0.15);
      doc.strokeColor('#dddddd').lineWidth(1)
        .moveTo(PDF_MARGIN, doc.y)
        .lineTo(doc.page.width - PDF_MARGIN, doc.y)
        .stroke();
      doc.moveDown(0.85);
    }

    drawDocumentHeader();

    if (!rows.length) {
      doc.font('Helvetica').fontSize(11).fillColor('#444444')
        .text('Nenhum registro no período selecionado.', PDF_MARGIN, doc.y, {
          width: contentWidth,
          lineBreak: true,
        });
      doc.end();
      return;
    }

    const slice = rows.slice(0, PDF_MAX_ROWS);
    for (const row of slice) {
      drawRecord(row);
    }

    if (rows.length > PDF_MAX_ROWS) {
      ensureSpace(24);
      doc.font('Helvetica-Oblique').fontSize(9).fillColor('#666666')
        .text(
          `… e mais ${rows.length - PDF_MAX_ROWS} registros. Use a exportação XLSX para o arquivo completo.`,
          PDF_MARGIN,
          doc.y,
          { width: contentWidth, lineBreak: true },
        );
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(8).fillColor('#999999')
        .text(
          `Página ${i - range.start + 1} de ${range.count}`,
          PDF_MARGIN,
          footerY,
          { width: contentWidth, align: 'center', lineBreak: false },
        );
    }

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
