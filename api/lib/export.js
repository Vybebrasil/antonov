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

function buildPdfHeaders(columns, labels) {
  return ['ID', 'Data', ...columns.map((c) => labels[c] || c)];
}

function pdfRowCells(row, columns, labels) {
  return [
    String(row.ID ?? ''),
    String(row.Data ?? ''),
    ...columns.map((c) => String(row[labels[c] || c] ?? '').trim()),
  ].map((v) => v || '—');
}

function computeColumnWidths(doc, headers, rows, columns, labels, contentWidth) {
  const cellPad = 5;
  const sample = rows.slice(0, 25);
  const weights = headers.map((header, index) => {
    if (header === 'ID') return 0.55;
    if (header === 'Data') return 1.15;

    let maxChars = header.length;
    for (const row of sample) {
      const cells = pdfRowCells(row, columns, labels);
      maxChars = Math.max(maxChars, Math.min(String(cells[index] ?? '').length, 80));
    }
    return Math.min(2.8, Math.max(1, maxChars / 14));
  });

  const minWidth = 42;
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let widths = weights.map((w) => Math.max(minWidth, (w / totalWeight) * contentWidth));

  const sum = widths.reduce((a, b) => a + b, 0);
  if (sum > contentWidth) {
    const scale = contentWidth / sum;
    widths = widths.map((w) => w * scale);
  } else if (sum < contentWidth) {
    const extra = (contentWidth - sum) / widths.length;
    widths = widths.map((w) => w + extra);
  }

  return { widths, cellPad };
}

function measureRowHeight(doc, cells, widths, cellPad, font, fontSize) {
  doc.font(font).fontSize(fontSize);
  const heights = cells.map((cell, i) =>
    doc.heightOfString(String(cell ?? ''), {
      width: Math.max(12, widths[i] - cellPad * 2),
      lineGap: 1,
    }),
  );
  return Math.max(16, ...heights.map((h) => h + cellPad * 2));
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

    const headers = buildPdfHeaders(columns, labels);
    const { widths, cellPad } = computeColumnWidths(doc, headers, rows, columns, labels, contentWidth);

    function drawTitleBlock() {
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#111111')
        .text(title, tableLeft, PDF_MARGIN, { width: contentWidth, lineBreak: true });

      const period = formatPeriodLabel(meta.from, meta.to);
      doc.font('Helvetica').fontSize(8.5).fillColor('#555555');
      if (period) doc.text(period, { width: contentWidth, lineBreak: true });
      doc.text(`Gerado em ${formatDate(new Date())} · ${rows.length} registro(s)`, {
        width: contentWidth,
        lineBreak: true,
      });
      doc.moveDown(0.5);
      return doc.y + 4;
    }

    function drawTableHeader(y) {
      const rowHeight = measureRowHeight(doc, headers, widths, cellPad, 'Helvetica-Bold', 8);
      let x = tableLeft;

      doc.save();
      for (let i = 0; i < headers.length; i++) {
        doc.rect(x, y, widths[i], rowHeight).fill('#ececec');
        x += widths[i];
      }
      doc.restore();

      x = tableLeft;
      for (let i = 0; i < headers.length; i++) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#222222')
          .text(String(headers[i]), x + cellPad, y + cellPad, {
            width: widths[i] - cellPad * 2,
            lineGap: 1,
          });
        x += widths[i];
      }

      doc.strokeColor('#bbbbbb').lineWidth(0.75)
        .moveTo(tableLeft, y + rowHeight)
        .lineTo(tableLeft + contentWidth, y + rowHeight)
        .stroke();

      return y + rowHeight;
    }

    function drawTableRow(cells, y, stripe) {
      const rowHeight = measureRowHeight(doc, cells, widths, cellPad, 'Helvetica', 7.5);
      let x = tableLeft;

      if (stripe) {
        doc.save();
        doc.rect(tableLeft, y, contentWidth, rowHeight).fill('#f8f8f8');
        doc.restore();
      }

      for (let i = 0; i < cells.length; i++) {
        doc.font('Helvetica').fontSize(7.5).fillColor('#111111')
          .text(String(cells[i] ?? ''), x + cellPad, y + cellPad, {
            width: widths[i] - cellPad * 2,
            lineGap: 1,
          });
        x += widths[i];
      }

      doc.strokeColor('#dddddd').lineWidth(0.5)
        .moveTo(tableLeft, y + rowHeight)
        .lineTo(tableLeft + contentWidth, y + rowHeight)
        .stroke();

      return y + rowHeight;
    }

    let y = drawTitleBlock();

    if (!rows.length) {
      doc.font('Helvetica').fontSize(10).fillColor('#444444')
        .text('Nenhum registro no período selecionado.', tableLeft, y, {
          width: contentWidth,
          lineBreak: true,
        });
      doc.end();
      return;
    }

    const headerHeight = measureRowHeight(doc, headers, widths, cellPad, 'Helvetica-Bold', 8);
    if (y + headerHeight > bottomLimit()) {
      doc.addPage();
      y = drawTitleBlock();
    }
    y = drawTableHeader(y);

    const slice = rows.slice(0, PDF_MAX_ROWS);
    for (let i = 0; i < slice.length; i++) {
      const cells = pdfRowCells(slice[i], columns, labels);
      const rowHeight = measureRowHeight(doc, cells, widths, cellPad, 'Helvetica', 7.5);

      if (y + rowHeight > bottomLimit()) {
        doc.addPage();
        y = drawTitleBlock();
        y = drawTableHeader(y);
      }

      y = drawTableRow(cells, y, i % 2 === 1);
    }

    if (rows.length > PDF_MAX_ROWS) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#666666')
        .text(
          `… e mais ${rows.length - PDF_MAX_ROWS} registros. Use a exportação XLSX para o arquivo completo.`,
          tableLeft,
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
          tableLeft,
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
