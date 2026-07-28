/** Gabarito PNG 1080×1920 — zonas do totem (espelha o layout real). */
const ROLETA_GUIDE = {
  canvasW: 1080,
  canvasH: 1920,
  margin: 40,
  wheel: { x: 180, y: 96, diameter: 720 },
  /** Logo abaixo da roleta */
  cta: { x: 140, y: 840, w: 800, h: 280 },
  /** Parte inferior — arte livre */
  free: { x: 120, y: 1200, w: 840, h: 640 },
};

function roletaGuideRoundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function roletaDownloadGuidePng() {
  const { canvasW: W, canvasH: H, margin: M, wheel, cta, free } = ROLETA_GUIDE;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const YELLOW = '#FFC20E';
  const BLUE = '#009CDE';
  const GREEN = '#2ECC71';
  const WHITE = '#FFFFFF';
  const cx = wheel.x + wheel.diameter / 2;
  const cy = wheel.y + wheel.diameter / 2;
  const r = wheel.diameter / 2;

  // Fundo escuro semitransparente (bom como overlay no Figma/PS)
  ctx.fillStyle = 'rgba(8, 8, 10, 0.58)';
  ctx.fillRect(0, 0, W, H);

  // Grid 40px
  ctx.strokeStyle = 'rgba(255,255,255,0.055)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }

  // Marcas de corte
  const crop = (x1, y1, x2, y2) => {
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y1);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1, y2);
    ctx.stroke();
  };
  const C = 52;
  crop(0, 0, C, 0);
  crop(0, 0, 0, C);
  crop(W, 0, W - C, 0);
  crop(W, 0, W, C);
  crop(0, H, C, H);
  crop(0, H, 0, H - C);
  crop(W, H, W - C, H);
  crop(W, H, W, H - C);

  // Header
  ctx.fillStyle = 'rgba(0,0,0,0.84)';
  ctx.fillRect(0, 0, W, 96);
  ctx.fillStyle = YELLOW;
  ctx.font = '800 34px "Segoe UI", Arial, sans-serif';
  ctx.fillText('GABARITO TOTEM ROLETA', 44, 44);
  ctx.fillStyle = WHITE;
  ctx.font = '500 20px "Segoe UI", Arial, sans-serif';
  ctx.fillText('1080 × 1920 px   ·   PNG RGB   ·   Antonov Center', 44, 76);

  // Margem segura
  ctx.setLineDash([14, 10]);
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 2;
  ctx.strokeRect(M + 0.5, M + 0.5, W - M * 2, H - M * 2);
  ctx.setLineDash([]);

  // Terços
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.setLineDash([8, 10]);
  ;[1, 2].forEach((i) => {
    const x = (W / 3) * i;
    const y = (H / 3) * i;
    ctx.beginPath();
    ctx.moveTo(x, 96);
    ctx.lineTo(x, H - 56);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // Eixo central
  ctx.strokeStyle = 'rgba(255,194,14,0.5)';
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(cx + 0.5, 100);
  ctx.lineTo(cx + 0.5, H - 56);
  ctx.stroke();
  ctx.setLineDash([]);

  const dimH = (x1, x2, y, text, color) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.moveTo(x1, y - 8);
    ctx.lineTo(x1, y + 8);
    ctx.moveTo(x2, y - 8);
    ctx.lineTo(x2, y + 8);
    ctx.stroke();
    ctx.font = '700 20px "Segoe UI", Arial, sans-serif';
    const tw = ctx.measureText(text).width;
    const tx = (x1 + x2) / 2 - tw / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(tx - 8, y - 30, tw + 16, 28);
    ctx.fillStyle = color;
    ctx.fillText(text, tx, y - 10);
  };

  const dimV = (x, y1, y2, text, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
    ctx.moveTo(x - 8, y1);
    ctx.lineTo(x + 8, y1);
    ctx.moveTo(x - 8, y2);
    ctx.lineTo(x + 8, y2);
    ctx.stroke();
    ctx.font = '700 20px "Segoe UI", Arial, sans-serif';
    const tw = ctx.measureText(text).width;
    const ty = (y1 + y2) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(x + 12, ty - 14, tw + 16, 28);
    ctx.fillStyle = color;
    ctx.fillText(text, x + 20, ty + 6);
  };

  const badge = (letter, x, y, color, title, lines) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = '800 24px "Segoe UI", Arial, sans-serif';
    const lw = ctx.measureText(letter).width;
    ctx.fillText(letter, x - lw / 2, y + 8);

    ctx.font = '700 22px "Segoe UI", Arial, sans-serif';
    const titleW = ctx.measureText(title).width;
    ctx.font = '500 18px "Segoe UI", Arial, sans-serif';
    const lineWs = lines.map((t) => ctx.measureText(t).width);
    const pad = 16;
    const boxW = Math.max(titleW, ...lineWs) + pad * 2;
    const boxH = 30 + lines.length * 24 + pad;
    const bx = x + 36;
    const by = y - 24;
    ctx.fillStyle = 'rgba(0,0,0,0.86)';
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);
    ctx.fillStyle = color;
    ctx.font = '700 22px "Segoe UI", Arial, sans-serif';
    ctx.fillText(title, bx + pad, by + 28);
    ctx.fillStyle = WHITE;
    ctx.font = '500 18px "Segoe UI", Arial, sans-serif';
    lines.forEach((t, i) => ctx.fillText(t, bx + pad, by + 54 + i * 24));
  };

  // === A — Roleta ===
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(255, 194, 14, 0.18)';
  ctx.fillRect(wheel.x, wheel.y, wheel.diameter, wheel.diameter);
  ctx.strokeStyle = 'rgba(255, 194, 14, 0.4)';
  ctx.lineWidth = 2;
  for (let i = -wheel.diameter; i < wheel.diameter * 2; i += 26) {
    ctx.beginPath();
    ctx.moveTo(wheel.x + i, wheel.y);
    ctx.lineTo(wheel.x + i + wheel.diameter, wheel.y + wheel.diameter);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = YELLOW;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([12, 8]);
  ctx.strokeStyle = 'rgba(255,194,14,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Crosshair
  ctx.strokeStyle = YELLOW;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 30, cy);
  ctx.lineTo(cx + 30, cy);
  ctx.moveTo(cx, cy - 30);
  ctx.lineTo(cx, cy + 30);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fillStyle = YELLOW;
  ctx.fill();

  dimH(wheel.x, wheel.x + wheel.diameter, wheel.y - 22, '720 px', YELLOW);
  dimV(wheel.x - 22, wheel.y, wheel.y + wheel.diameter, '720 px', YELLOW);

  badge('A', wheel.x + 40, wheel.y + 52, YELLOW, 'ROLETA · RESERVADA', [
    'Não coloque arte importante aqui',
    `Posição  x ${wheel.x}   y ${wheel.y}`,
    `Tamanho  ${wheel.diameter} × ${wheel.diameter} px`,
    `Centro   ${cx} , ${cy}`,
  ]);

  // === B — CTA (logo abaixo da roleta) ===
  ctx.fillStyle = 'rgba(0, 156, 222, 0.15)';
  ctx.fillRect(cta.x, cta.y, cta.w, cta.h);
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 4;
  ctx.strokeRect(cta.x + 0.5, cta.y + 0.5, cta.w - 1, cta.h - 1);

  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(cta.x + 170, cta.y + 48, 460, 34);
  ctx.fillStyle = 'rgba(255,194,14,0.9)';
  roletaGuideRoundRect(ctx, cta.x + 210, cta.y + 110, 380, 92, 46);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = '800 36px "Segoe UI", Arial, sans-serif';
  ctx.fillText('GIRAR', cta.x + 330, cta.y + 170);

  dimH(cta.x, cta.x + cta.w, cta.y - 20, `${cta.w} px`, BLUE);

  badge('B', cta.x + 40, cta.y + 44, BLUE, 'UI / CTA · RESERVADA', [
    'Botão Girar e textos do app',
    'Logo abaixo da roleta',
    `Área  ${cta.w} × ${cta.h} px   ·   y ${cta.y}`,
  ]);

  // === C — Arte livre (inferior) ===
  ctx.fillStyle = 'rgba(46, 204, 113, 0.11)';
  ctx.fillRect(free.x, free.y, free.w, free.h);
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 3;
  ctx.strokeRect(free.x + 0.5, free.y + 0.5, free.w - 1, free.h - 1);
  ctx.setLineDash([]);

  dimH(free.x, free.x + free.w, free.y - 18, `${free.w} px`, GREEN);
  dimV(free.x - 18, free.y, free.y + free.h, `${free.h} px`, GREEN);

  badge('C', free.x + 40, free.y + 48, GREEN, 'ARTE LIVRE · INFERIOR', [
    'Logo, título, patrocínios, texto',
    `Área  ${free.w} × ${free.h} px`,
    `Faixa  y ${free.y} → ${free.y + free.h}`,
  ]);

  // Callout margem (canto da arte livre)
  ctx.fillStyle = 'rgba(0,0,0,0.84)';
  ctx.fillRect(free.x + 16, free.y + free.h - 120, 400, 96);
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 2;
  ctx.strokeRect(free.x + 16.5, free.y + free.h - 119.5, 399, 95);
  ctx.fillStyle = BLUE;
  ctx.font = '700 20px "Segoe UI", Arial, sans-serif';
  ctx.fillText('MARGEM SEGURA', free.x + 32, free.y + free.h - 86);
  ctx.fillStyle = WHITE;
  ctx.font = '500 18px "Segoe UI", Arial, sans-serif';
  ctx.fillText('40 px em todos os lados', free.x + 32, free.y + free.h - 58);
  ctx.fillText('Textos e logos dentro da margem', free.x + 32, free.y + free.h - 32);

  // Footer
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fillRect(0, H - 56, W, 56);
  ctx.font = '600 17px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = YELLOW;
  ctx.fillText('A Roleta', 36, H - 22);
  ctx.fillStyle = BLUE;
  ctx.fillText('B UI/CTA', 160, H - 22);
  ctx.fillStyle = GREEN;
  ctx.fillText('C Arte livre', 300, H - 22);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '500 16px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Importe como camada superior  ·  oculte ao exportar o layout final', 460, H - 22);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gabarito-roleta-totem-1080x1920.png';
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
