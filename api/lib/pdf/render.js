import {
  PDF_HEADER_FONT,
  PDF_CELL_FONT,
  PDF_CELL_PAD,
  PDF_LINE_GAP,
  PDF_MAX_ROWS,
} from './constants.js';
import {
  wrapTextAtWords,
  measureRowHeight,
  buildSegmentSubtitle,
  segmentRowCells,
} from './layout.js';

export function drawColumnGrid(doc, tableLeft, y, rowHeight, widths, color, lineWidth) {
  doc.strokeColor(color).lineWidth(lineWidth);
  let x = tableLeft;
  for (let i = 0; i <= widths.length; i++) {
    doc.moveTo(x, y).lineTo(x, y + rowHeight).stroke();
    if (i < widths.length) x += widths[i];
  }
}

export function drawCellText(doc, cell, x, y, width, cellPad, font, fontSize) {
  doc.font(font).fontSize(fontSize);
  const inner = Math.max(10, width - cellPad * 2);
  const lines = wrapTextAtWords(doc, cell, inner);
  const lineHeight = doc.currentLineHeight(false) + PDF_LINE_GAP;
  const textX = x + cellPad;
  let cy = y + cellPad;

  for (const line of lines) {
    doc.text(line, textX, cy, { lineBreak: false });
    cy += lineHeight;
  }
}

export function drawTableHeader(doc, tableLeft, y, headers, widths, cellPad, segWidth) {
  const rowHeight = measureRowHeight(doc, headers, widths, cellPad, 'Helvetica-Bold', PDF_HEADER_FONT);
  let x = tableLeft;

  doc.save();
  doc.strokeColor('#bbbbbb').lineWidth(0.75)
    .moveTo(tableLeft, y)
    .lineTo(tableLeft + segWidth, y)
    .stroke();

  for (let i = 0; i < headers.length; i++) {
    doc.rect(x, y, widths[i], rowHeight).fill('#ececec');
    x += widths[i];
  }
  doc.restore();

  x = tableLeft;
  for (let i = 0; i < headers.length; i++) {
    doc.fillColor('#222222');
    drawCellText(doc, headers[i], x, y, widths[i], cellPad, 'Helvetica-Bold', PDF_HEADER_FONT);
    x += widths[i];
  }

  const bottom = y + rowHeight;
  doc.strokeColor('#bbbbbb').lineWidth(0.75)
    .moveTo(tableLeft, bottom)
    .lineTo(tableLeft + segWidth, bottom)
    .stroke();
  doc.strokeColor('#999999').lineWidth(0.35)
    .moveTo(tableLeft, bottom + 1.2)
    .lineTo(tableLeft + segWidth, bottom + 1.2)
    .stroke();

  drawColumnGrid(doc, tableLeft, y, rowHeight, widths, '#bbbbbb', 0.5);

  return { y: bottom + 1.2, rowHeight: bottom + 1.2 - y };
}

export function drawTableRow(doc, tableLeft, cells, y, stripe, widths, cellPad, segWidth) {
  const rowHeight = measureRowHeight(doc, cells, widths, cellPad, 'Helvetica', PDF_CELL_FONT);
  let x = tableLeft;

  for (let i = 0; i < cells.length; i++) {
    if (stripe) {
      doc.save();
      doc.rect(x, y, widths[i], rowHeight).fill('#f8f8f8');
      doc.restore();
    }
    doc.fillColor('#111111');
    drawCellText(doc, cells[i], x, y, widths[i], cellPad, 'Helvetica', PDF_CELL_FONT);
    x += widths[i];
  }

  doc.strokeColor('#dddddd').lineWidth(0.5)
    .moveTo(tableLeft, y + rowHeight)
    .lineTo(tableLeft + segWidth, y + rowHeight)
    .stroke();

  drawColumnGrid(doc, tableLeft, y, rowHeight, widths, '#e0e0e0', 0.5);

  return y + rowHeight;
}

export function drawTitleBlock(doc, {
  tableLeft,
  contentWidth,
  pdfMargin,
  title,
  segmentIndex,
  segmentCount,
  segment,
  totalFieldColumns,
  labels,
  period,
  generatedAt,
  rowCount,
}) {
  const partLabel = segmentCount > 1
    ? `${title} (parte ${segmentIndex + 1}/${segmentCount})`
    : title;

  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111')
    .text(partLabel, tableLeft, pdfMargin, { width: contentWidth, lineBreak: true });

  const subtitle = buildSegmentSubtitle(segment, totalFieldColumns, labels);
  if (subtitle) {
    doc.font('Helvetica').fontSize(7).fillColor('#666666')
      .text(subtitle, { width: contentWidth, lineBreak: true });
  }

  doc.font('Helvetica').fontSize(7.5).fillColor('#555555');
  if (period) doc.text(period, { width: contentWidth, lineBreak: true });
  doc.text(`Gerado em ${generatedAt} · ${rowCount} registro(s)`, {
    width: contentWidth,
    lineBreak: true,
  });
  doc.moveDown(0.5);
  return doc.y + 4;
}

export function drawTruncationNotice(doc, tableLeft, contentWidth, totalRows) {
  if (totalRows <= PDF_MAX_ROWS) return;
  doc.moveDown(0.5);
  doc.font('Helvetica-Oblique').fontSize(7).fillColor('#666666')
    .text(
      `… e mais ${totalRows - PDF_MAX_ROWS} registros. Use a exportação XLSX para o arquivo completo.`,
      tableLeft,
      doc.y,
      { width: contentWidth, lineBreak: true },
    );
}

export function drawPageFooters(doc, {
  tableLeft,
  contentWidth,
  footerY,
  pageSegmentMap,
  segmentCount,
}) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const pageIndex = i - range.start;
    const segmentIndex = pageSegmentMap[pageIndex] ?? 0;
    const partSuffix = segmentCount > 1 ? ` · Parte ${segmentIndex + 1}/${segmentCount}` : '';
    doc.font('Helvetica').fontSize(7).fillColor('#999999')
      .text(
        `Página ${pageIndex + 1} de ${range.count}${partSuffix}`,
        tableLeft,
        footerY,
        { width: contentWidth, align: 'center', lineBreak: false },
      );
  }
}

export function renderPdfTable(doc, {
  tableLeft,
  contentWidth,
  pdfMargin,
  footerY,
  bottomLimit,
  title,
  rows,
  columns,
  labels,
  segments,
  period,
  generatedAt,
}) {
  const pageSegmentMap = [0];
  let started = false;
  const slice = rows.slice(0, PDF_MAX_ROWS);
  const totalFieldColumns = columns.length;

  const addPageForSegment = (segmentIndex) => {
    if (started) {
      doc.addPage();
      pageSegmentMap.push(segmentIndex);
    }
    started = true;
  };

  const drawSegmentTitle = (segmentIndex, segment) =>
    drawTitleBlock(doc, {
      tableLeft,
      contentWidth,
      pdfMargin,
      title,
      segmentIndex,
      segmentCount: segments.length,
      segment,
      totalFieldColumns,
      labels,
      period,
      generatedAt,
      rowCount: rows.length,
    });

  const drawHeader = (y, segment) =>
    drawTableHeader(
      doc,
      tableLeft,
      y,
      segment.headers,
      segment.widths,
      segment.cellPad,
      segment.segWidth,
    ).y;

  for (let s = 0; s < segments.length; s++) {
    const segment = segments[s];

    addPageForSegment(s);
    let y = drawSegmentTitle(s, segment);

    const headerHeight = measureRowHeight(
      doc,
      segment.headers,
      segment.widths,
      segment.cellPad,
      'Helvetica-Bold',
      PDF_HEADER_FONT,
    );

    if (y + headerHeight > bottomLimit()) {
      addPageForSegment(s);
      y = drawSegmentTitle(s, segment);
    }
    y = drawHeader(y, segment);

    for (let i = 0; i < slice.length; i++) {
      const cells = segmentRowCells(slice[i], segment, labels);
      const rowHeight = measureRowHeight(
        doc,
        cells,
        segment.widths,
        segment.cellPad,
        'Helvetica',
        PDF_CELL_FONT,
      );

      if (y + rowHeight > bottomLimit()) {
        addPageForSegment(s);
        y = drawSegmentTitle(s, segment);
        y = drawHeader(y, segment);
      }

      y = drawTableRow(
        doc,
        tableLeft,
        cells,
        y,
        i % 2 === 1,
        segment.widths,
        segment.cellPad,
        segment.segWidth,
      );
    }

    drawTruncationNotice(doc, tableLeft, contentWidth, rows.length);
  }

  drawPageFooters(doc, {
    tableLeft,
    contentWidth,
    footerY,
    pageSegmentMap,
    segmentCount: segments.length,
  });

  return pageSegmentMap;
}
