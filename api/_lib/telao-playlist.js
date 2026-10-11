import { createHash } from 'crypto';

export const TELAO_TZ = 'America/Bahia';
const VIDEO_FALLBACK_MS = 15000;

export function todayInBahia(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TELAO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function asDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function addDays(dateStr, days) {
  const [year, month, day] = asDate(dateStr).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function addMonths(dateStr, months) {
  const [year, month, day] = asDate(dateStr).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + Number(months || 0), day)).toISOString().slice(0, 10);
}

function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function airBlockReason(creative, today) {
  if (creative.deleted_at) return 'excluído';
  if (!creative.active) return 'inativo';
  if (!creative.approved) return 'aguardando aprovação';
  if (creative.starts_on && creative.starts_on > today) return 'ainda não começou';
  if (creative.ends_on && creative.ends_on < today) return 'período do criativo encerrado';
  if (creative.institutional) return null;
  if (!creative.contrato_id) return 'sem contrato';
  if (creative.contrato_deleted) return 'contrato excluído';
  if (creative.contrato_status !== 'ativo') return `contrato ${creative.contrato_status || 'indefinido'}`;
  if (creative.contrato_starts && creative.contrato_starts > today) return 'contrato ainda não começou';
  if (creative.contrato_ends && creative.contrato_ends < today) return 'contrato encerrado';
  return null;
}

export function parseWeekDays(value) {
  const days = [...new Set(String(value ?? '0,1,2,3,4,5,6')
    .split(',')
    .map((part) => Number(String(part).trim()))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
  return days.sort((a, b) => a - b);
}

export function programSchedule(settings = {}) {
  const start = String(settings.open_time || '00:00:00');
  const end = String(settings.close_time || '23:59:59');
  return {
    weekDays: parseWeekDays(settings.week_days),
    startTime: start.length === 5 ? `${start}:00` : start.slice(0, 8),
    endTime: end.length === 5 ? `${end}:00` : end.slice(0, 8),
  };
}

const HOUR_MS = 3_600_000;
const MAX_HOLD_MS = 600_000;

function byPosition(a, b) {
  return (Number(a.position) - Number(b.position)) || String(a.id).localeCompare(String(b.id));
}

function fillGap(gapMs, fillers) {
  const pictures = fillers.filter((item) => item.kind !== 'VIDEO');
  const pool = pictures.length ? pictures : fillers;
  const pages = [];
  let left = gapMs;
  let index = 0;
  while (left >= 1000 && pages.length < 24) {
    const creative = pool[index % pool.length];
    index += 1;
    if (creative.kind === 'VIDEO') {
      pages.push(creative);
      left -= pageDurationMs(creative);
      continue;
    }
    const duration = Math.min(left, MAX_HOLD_MS);
    pages.push({ ...creative, duration_ms: duration });
    left -= duration;
  }
  return pages;
}

function commercialGroups(creatives) {
  const groups = [];
  const byContract = new Map();
  for (const creative of creatives) {
    const key = String(creative.contrato_id || creative.id);
    if (!byContract.has(key)) {
      const group = {
        perHour: clampInt(creative.insercoes_por_ciclo, 1, 120),
        creatives: [],
      };
      byContract.set(key, group);
      groups.push(group);
    }
    byContract.get(key).creatives.push(creative);
  }
  for (const group of groups) group.creatives.sort(byPosition);
  return groups;
}

function spreadHour(groups) {
  const events = [];
  for (const group of groups) {
    for (let i = 0; i < group.perHour; i += 1) {
      events.push({
        at: Math.round(((i + 0.5) * HOUR_MS) / group.perHour),
        creative: group.creatives[i % group.creatives.length],
      });
    }
  }
  events.sort((a, b) => a.at - b.at || byPosition(a.creative, b.creative));
  const placed = [];
  let cursor = 0;
  let saturated = false;
  for (const event of events) {
    const dur = pageDurationMs(event.creative);
    const start = Math.max(event.at, cursor);
    if (start > event.at) saturated = true;
    if (start >= HOUR_MS) {
      saturated = true;
      break;
    }
    placed.push({ start, creative: event.creative, dur });
    cursor = start + dur;
  }
  return { placed, saturated };
}

export function selectOnAir(creatives, today, options = {}) {
  const fillHour = options.institutionalFallback !== false;
  const sorted = [...creatives].sort(byPosition);
  const commercial = sorted.filter((creative) => !creative.institutional && !airBlockReason(creative, today));
  const institutional = sorted.filter((creative) => creative.institutional && !airBlockReason(creative, today));
  if (!commercial.length) {
    const pages = [];
    for (const creative of (fillHour ? institutional : sorted.filter((creative) => !airBlockReason(creative, today)))) {
      pages.push(creative);
    }
    return { pages, fallback: fillHour && pages.length > 0, note: '' };
  }
  const { placed, saturated } = spreadHour(commercialGroups(commercial));
  const fillers = fillHour ? institutional : [];
  const pages = [];
  let clock = 0;
  for (const spot of placed) {
    if (fillers.length && spot.start > clock) pages.push(...fillGap(spot.start - clock, fillers));
    pages.push(spot.creative);
    clock = spot.start + spot.dur;
  }
  if (fillers.length && clock < HOUR_MS) pages.push(...fillGap(HOUR_MS - clock, fillers));
  if (!fillHour) pages.push(...institutional);
  let note = '';
  if (saturated) note = 'A soma das inserções não cabe em uma hora. A grade foi apertada.';
  else if (!fillers.length) {
    const cycle = pages.reduce((sum, page) => sum + pageDurationMs(page), 0);
    if (cycle > 0 && cycle < HOUR_MS * 0.9) {
      note = 'Sem institucional para completar a hora, os anúncios repetem mais do que a meta.';
    }
  }
  return { pages, fallback: false, note };
}

export function buildProgram(pages, playerId, today, schedule = {}, noticeUrl = '') {
  const weekDays = schedule.weekDays?.length ? schedule.weekDays : [0, 1, 2, 3, 4, 5, 6];
  return {
    playerIds: [playerId],
    ...(noticeUrl ? { noticeUrl } : {}),
    schedule: {
      startDate: today,
      endDate: '2060-12-31',
      plans: [{
        weekDays,
        startTime: schedule.startTime || '00:00:00',
        endTime: schedule.endTime || '23:59:59',
      }],
    },
    pages: pages.map((creative, index) => ({
      name: `${index + 1}-${creative.name}`.slice(0, 40),
      repeatCount: 1,
      widgets: [
        {
          zIndex: 1,
          type: creative.kind,
          size: Number(creative.size_bytes),
          md5: creative.md5,
          duration: widgetDurationMs(creative),
          url: creative.public_url,
          layout: { x: '0%', y: '0%', width: '100%', height: '100%' },
          ...(creative.kind === 'PICTURE' ? { inAnimation: { type: 'NONE', duration: 1000 } } : {}),
        },
      ],
    })),
  };
}

export function playlistHash(pages, schedule) {
  const raw = pages.map((page, index) => [
    index,
    page.id,
    page.md5,
    page.kind,
    widgetDurationMs(page),
    page.public_url,
  ].join(':')).join('|');
  const extra = schedule
    ? `|${(schedule.weekDays || []).join(',')}|${schedule.startTime || ''}|${schedule.endTime || ''}`
    : '';
  return createHash('sha256').update(`${raw}${extra}`).digest('hex');
}

export function widgetDurationMs(page) {
  if (page.kind === 'VIDEO') return Number(page.duration_ms) > 0 ? Number(page.duration_ms) : 0;
  return Number(page.duration_ms);
}

export function pageDurationMs(label) {
  if (label.kind === 'VIDEO') return Number(label.duration_ms) > 0 ? Number(label.duration_ms) : VIDEO_FALLBACK_MS;
  return Number(label.duration_ms) > 0 ? Number(label.duration_ms) : 10000;
}

function zonedMs(dateStr, timeStr) {
  const time = String(timeStr || '00:00:00');
  const normalized = time.length === 5 ? `${time}:00` : time.slice(0, 8);
  return Date.parse(`${dateStr}T${normalized}-03:00`);
}

export function operatingMs(fromMs, toMs, openTime = '06:00:00', closeTime = '23:00:00') {
  if (!(toMs > fromMs)) return 0;
  const open = String(openTime);
  const close = String(closeTime);
  if (close <= open) return 0;
  let cursor = todayInBahia(new Date(fromMs));
  const endDate = todayInBahia(new Date(toMs));
  let total = 0;
  for (let guard = 0; guard < 400 && cursor <= endDate; guard += 1) {
    const a = Math.max(zonedMs(cursor, open), fromMs);
    const b = Math.min(zonedMs(cursor, close), toMs);
    if (b > a) total += b - a;
    cursor = addDays(cursor, 1);
  }
  return total;
}

export function estimateFromPublications(publications, {
  from,
  to,
  openTime = '06:00:00',
  closeTime = '23:00:00',
  clienteId = null,
  now = Date.now(),
} = {}) {
  const rangeFrom = Date.parse(`${from}T00:00:00-03:00`);
  const rangeTo = Date.parse(`${to}T23:59:59-03:00`);
  const sorted = [...publications].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const totals = new Map();

  sorted.forEach((publication, index) => {
    const labels = publication.labels || publication.request?.labels || [];
    if (!labels.length) return;
    const start = new Date(publication.created_at).getTime();
    const next = sorted[index + 1] ? new Date(sorted[index + 1].created_at).getTime() : now;
    const windowFrom = Math.max(start, rangeFrom);
    const windowTo = Math.min(next, rangeTo, now);
    const ms = operatingMs(windowFrom, windowTo, openTime, closeTime);
    const cycle = labels.reduce((sum, label) => sum + pageDurationMs(label), 0);
    if (!ms || !cycle) return;
    const cycles = ms / cycle;
    for (const label of labels) {
      if (clienteId && String(label.cliente_id || '') !== String(clienteId)) continue;
      const key = String(label.id);
      const row = totals.get(key) || {
        id: label.id,
        name: label.name,
        kind: label.kind,
        cliente_id: label.cliente_id || null,
        cliente_name: label.cliente_name || null,
        insertions: 0,
        seconds: 0,
        approximate: false,
      };
      row.insertions += cycles;
      row.seconds += (cycles * pageDurationMs(label)) / 1000;
      if (label.kind === 'VIDEO' && !(Number(label.duration_ms) > 0)) row.approximate = true;
      totals.set(key, row);
    }
  });

  return [...totals.values()].map((row) => ({
    ...row,
    insertions: Math.round(row.insertions),
    seconds: Math.round(row.seconds),
  }));
}

export function uptimePct(checks, sinceMs) {
  const rows = checks.filter((check) => new Date(check.checked_at).getTime() >= sinceMs);
  if (!rows.length) return null;
  const online = rows.filter((check) => check.online).length;
  return Math.round((online / rows.length) * 1000) / 10;
}

export function whatsappHref(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const full = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

export const PLAYER_MAX_WIDTH = 2160;
export const PLAYER_MAX_HEIGHT = 4096;

export function pictureOverSpec(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (!w || !h) return '';
  if (w <= PLAYER_MAX_WIDTH && h <= PLAYER_MAX_HEIGHT) return '';
  return `A imagem tem ${w}×${h}. O player só exibe até ${PLAYER_MAX_WIDTH}×${PLAYER_MAX_HEIGHT} e não troca a tela.`;
}

export function aspectWarning(width, height, expectedWidth = 400, expectedHeight = 400) {
  const w = Number(width);
  const h = Number(height);
  const expectedW = Number(expectedWidth) || 400;
  const expectedH = Number(expectedHeight) || 400;
  if (!w || !h) return '';
  const expectedRatio = expectedW / expectedH;
  if (Math.abs(w / h - expectedRatio) > 0.02) return `Proporção ${w}×${h}. O telão é ${expectedW}×${expectedH}.`;
  if (w !== expectedW || h !== expectedH) return `Tamanho ${w}×${h}. O ideal é ${expectedW}×${expectedH}.`;
  return '';
}
