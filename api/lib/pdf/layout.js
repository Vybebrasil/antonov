import {
  PDF_HEADER_FONT,
  PDF_CELL_FONT,
  PDF_CELL_PAD,
  PDF_LINE_GAP,
  PDF_ID_COL_WIDTH,
  PDF_DATA_COL_WIDTH,
  PDF_TARGET_FIELDS_MAX,
  PDF_NUMERIC_CHUNK,
} from './constants.js';

export function exportRowCells(row, columns, labels) {
  return [
    String(row.ID ?? ''),
    String(row.Data ?? ''),
    ...columns.map((c) => String(row[labels[c] || c] ?? '').trim()),
  ].map((v) => v || '—');
}

function splitWords(text) {
  const words = String(text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const tokens = [];
  for (const word of words) {
    const digits = word.replace(/\D/g, '');
    if (digits.length === word.length && word.length > PDF_NUMERIC_CHUNK) {
      for (let i = 0; i < word.length; i += PDF_NUMERIC_CHUNK) {
        tokens.push(word.slice(i, i + PDF_NUMERIC_CHUNK));
      }
    } else {
      tokens.push(word);
    }
  }
  return tokens;
}

export function wrapTextAtWords(doc, text, maxWidth) {
  const raw = String(text ?? '');
  if (!raw.trim()) return [''];

  const fits = (candidate) => doc.widthOfString(candidate) <= maxWidth - 0.5;
  const lines = [];

  for (const paragraph of raw.split(/\r?\n/)) {
    const normalized = paragraph.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const word of splitWords(normalized)) {
      const candidate = current ? `${current} ${word}` : word;
      if (fits(candidate)) {
        current = candidate;
        continue;
      }

      if (current) {
        lines.push(current);
        current = word;
      } else {
        lines.push(word);
      }
    }

    if (current) lines.push(current);
  }

  return lines;
}

export function widestTokenWidth(doc, text) {
  const s = String(text ?? '').trim();
  if (!s) return 0;
  let max = 0;
  for (const token of splitWords(s.replace(/\s+/g, ' '))) {
    max = Math.max(max, doc.widthOfString(token));
  }
  return max;
}

function minWidthForText(doc, text, cellPad, maxLines = 4) {
  const pad = cellPad * 2;
  const s = String(text ?? '').trim() || '—';
  const full = doc.widthOfString(s) + pad;
  const word = widestTokenWidth(doc, s) + pad;

  if (full <= 72) return Math.max(word, full);

  let lo = word;
  let hi = Math.min(full, 160);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const lines = wrapTextAtWords(doc, s, mid - pad);
    if (lines.length <= maxLines) hi = mid - 1;
    else lo = mid;
  }
  return Math.max(word, lo + pad, 28);
}

function absoluteColumnMin(doc, headers, rows, columns, labels, cellPad) {
  const sample = rows.slice(0, 25);
  return headers.map((header, index) => {
    if (header === 'ID') return PDF_ID_COL_WIDTH;
    if (header === 'Data') return PDF_DATA_COL_WIDTH;

    doc.font('Helvetica-Bold').fontSize(PDF_HEADER_FONT);
    let minW = widestTokenWidth(doc, header);
    doc.font('Helvetica').fontSize(PDF_CELL_FONT);
    for (const row of sample) {
      const cells = exportRowCells(row, columns, labels);
      minW = Math.max(minW, widestTokenWidth(doc, cells[index]));
    }
    return minW + cellPad * 2;
  });
}

export function computeColumnWidths(doc, headers, rows, columns, labels, contentWidth) {
  const cellPad = PDF_CELL_PAD;
  const sample = rows.slice(0, 25);

  doc.font('Helvetica-Bold').fontSize(PDF_HEADER_FONT);
  const headerNeeds = headers.map((header) => minWidthForText(doc, header, cellPad, 4));

  doc.font('Helvetica').fontSize(PDF_CELL_FONT);
  const cellNeeds = headers.map((_, index) => {
    if (index < 2) return headers[index] === 'ID' ? PDF_ID_COL_WIDTH : PDF_DATA_COL_WIDTH;
    let max = 28;
    for (const row of sample) {
      const cells = exportRowCells(row, columns, labels);
      max = Math.max(max, minWidthForText(doc, cells[index], cellPad, 6));
    }
    return max;
  });

  let needs = headers.map((_, i) => {
    if (headers[i] === 'ID') return PDF_ID_COL_WIDTH;
    if (headers[i] === 'Data') return PDF_DATA_COL_WIDTH;
    return Math.max(headerNeeds[i], cellNeeds[i]);
  });

  const floors = absoluteColumnMin(doc, headers, rows, columns, labels, cellPad);
  needs = needs.map((n, i) => Math.max(n, floors[i]));

  const fixedWidth = PDF_ID_COL_WIDTH + PDF_DATA_COL_WIDTH;
  const fieldCount = Math.max(0, headers.length - 2);
  let fieldWidths = needs.slice(2);
  const fieldSum = fieldWidths.reduce((a, b) => a + b, 0);
  const available = contentWidth - fixedWidth;

  if (fieldCount === 0) {
    return { widths: [PDF_ID_COL_WIDTH, PDF_DATA_COL_WIDTH], cellPad };
  }

  if (fieldSum > available) {
    const fieldFloors = floors.slice(2);
    const floorSum = fieldFloors.reduce((a, b) => a + b, 0);
    if (floorSum >= available) {
      fieldWidths = fieldFloors.map((f) => (f / floorSum) * available);
    } else {
      const flex = fieldWidths.map((n, i) => Math.max(0, n - fieldFloors[i]));
      const flexSum = flex.reduce((a, b) => a + b, 0);
      const extra = available - floorSum;
      fieldWidths = fieldFloors.map((f, i) => f + (flexSum ? (flex[i] / flexSum) * extra : extra / fieldCount));
    }
  } else {
    const extra = available - fieldSum;
    fieldWidths = fieldWidths.map((n) => n + (n / fieldSum) * extra);
  }

  return {
    widths: [PDF_ID_COL_WIDTH, PDF_DATA_COL_WIDTH, ...fieldWidths],
    cellPad,
  };
}

export function tableWidth(widths) {
  return widths.reduce((a, b) => a + b, 0);
}

function computeSegmentLayout(doc, segColumns, labels, rows, contentWidth) {
  const headers = ['ID', 'Data', ...segColumns.map((c) => labels[c] || c)];
  const { widths, cellPad } = computeColumnWidths(doc, headers, rows, segColumns, labels, contentWidth);
  return { headers, widths, cellPad, segWidth: tableWidth(widths) };
}

export function buildPdfSegments(doc, columns, labels, rows, contentWidth) {
  const segments = [];
  let fieldStart = 0;

  while (fieldStart < columns.length) {
    let bestEnd = fieldStart;

    for (let end = fieldStart + 1; end <= columns.length; end++) {
      const fieldCount = end - fieldStart;
      if (fieldCount > PDF_TARGET_FIELDS_MAX) break;

      const segColumns = columns.slice(fieldStart, end);
      const layout = computeSegmentLayout(doc, segColumns, labels, rows, contentWidth);
      if (layout.segWidth <= contentWidth + 0.5) bestEnd = end;
      else break;
    }

    if (bestEnd === fieldStart) bestEnd = fieldStart + 1;

    const segColumns = columns.slice(fieldStart, bestEnd);
    const layout = computeSegmentLayout(doc, segColumns, labels, rows, contentWidth);

    segments.push({
      columns: segColumns,
      headers: layout.headers,
      widths: layout.widths,
      cellPad: layout.cellPad,
      segWidth: layout.segWidth,
      fieldStart,
      fieldEnd: bestEnd,
    });

    fieldStart = bestEnd;
  }

  if (segments.length === 0) {
    const layout = computeSegmentLayout(doc, [], labels, rows, contentWidth);
    segments.push({
      columns: [],
      headers: layout.headers,
      widths: layout.widths,
      cellPad: layout.cellPad,
      segWidth: layout.segWidth,
      fieldStart: 0,
      fieldEnd: 0,
    });
  }

  return segments;
}

export function buildSegmentSubtitle(segment, totalFieldColumns, labels) {
  const from = segment.fieldStart + 1;
  const to = segment.fieldEnd;
  const rangeLabel = totalFieldColumns
    ? `Colunas ${from}–${to} de ${totalFieldColumns}`
    : '';

  const preview = segment.columns
    .slice(0, 4)
    .map((c) => labels[c] || c)
    .join(', ');

  const suffix = segment.columns.length > 4 ? '…' : '';
  if (!rangeLabel) return '';
  if (!preview) return rangeLabel;
  return `${rangeLabel}: ${preview}${suffix}`;
}

export function segmentRowCells(row, segment, labels) {
  return [
    String(row.ID ?? ''),
    String(row.Data ?? ''),
    ...segment.columns.map((col) => {
      const key = labels[col] || col;
      return String(row[key] ?? '').trim() || '—';
    }),
  ];
}

export function measureCellHeight(doc, cell, width, cellPad, font, fontSize) {
  doc.font(font).fontSize(fontSize);
  const inner = Math.max(10, width - cellPad * 2);
  const lines = wrapTextAtWords(doc, cell, inner);
  const lineHeight = doc.currentLineHeight(false) + PDF_LINE_GAP;
  return Math.max(lineHeight, lines.length * lineHeight) + cellPad * 2;
}

export function measureRowHeight(doc, cells, widths, cellPad, font, fontSize) {
  const heights = cells.map((cell, i) =>
    measureCellHeight(doc, cell, widths[i], cellPad, font, fontSize),
  );
  return Math.max(14, ...heights);
}
