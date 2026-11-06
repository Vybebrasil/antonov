import { sendOpsEmail } from './resend.js';
import {
  avisoExists,
  confirmLatestPublicacao,
  noteLatestDownload,
  contractsEndingOn,
  getPlayer,
  getSettings,
  insertCallback,
  insertCaptura,
  insertComando,
  insertPublicacao,
  lastOkPublicacao,
  listPublicacoesForReport,
  markAviso,
  markIncidentAlert,
  paymentsDueOn,
  paymentsNewlyLate,
  playlistFor,
  pruneStatusLog,
  recordCheck,
  refreshOperational,
} from './telao.js';
import {
  addDays,
  airBlockReason,
  buildProgram,
  estimateFromPublications,
  pageDurationMs,
  pictureOverSpec,
  playlistHash,
  programSchedule,
  todayInBahia,
} from './telao-playlist.js';
import {
  callbackTokenOk,
  controlPlayer,
  listPlayers,
  novacloudConfigured,
  playerAccepted,
  publishProgram,
  registerProgramHook,
} from './telao-novacloud.js';

function labelsOf(pages) {
  return pages.map((page) => ({
    id: page.id,
    name: page.name,
    kind: page.kind,
    duration_ms: page.duration_ms,
    cliente_id: page.cliente_id || null,
    cliente_name: page.cliente_name || null,
    institutional: Boolean(page.institutional),
  }));
}

export function publicBase(req) {
  const configured = String(process.env.SITE_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  if (!host) return '';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

export function callbackUrl(req, kind) {
  const token = process.env.TELAO_CALLBACK_TOKEN;
  const base = publicBase(req);
  if (!token || !base) return '';
  const job = kind === 'screenshot' ? 'screenshot' : 'callback';
  // A NovaCloud não entrega o retorno quando a URL tem query string: o token vai no caminho.
  return `${base}/api/telao/${job}/${encodeURIComponent(token)}`;
}

function alertRecipients(settings) {
  const raw = settings?.alert_emails || process.env.TELAO_ALERT_EMAILS || process.env.RESEND_TO || '';
  return String(raw).split(/[,;\s]+/).map((item) => item.trim()).filter(Boolean);
}

function findByKey(value, pattern, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 6) return null;
  const list = Array.isArray(value) ? value : Object.entries(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findByKey(item, pattern, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const [key, item] of list) {
    if (pattern.test(key) && typeof item === 'string' && item) return item;
    const found = findByKey(item, pattern, depth + 1);
    if (found) return found;
  }
  return null;
}

export async function previewPlaylist() {
  const { today, pages, fallback, creatives, settings } = await playlistFor();
  const schedule = programSchedule(settings);
  const last = await lastOkPublicacao();
  const hash = playlistHash(pages, schedule);
  return {
    today,
    fallback,
    hash,
    changed: last?.program_hash !== hash,
    lastPublishedAt: last?.created_at || null,
    confirmedAt: last?.confirmado_em || null,
    cycleMs: pages.reduce((sum, page) => sum + pageDurationMs(page), 0),
    pages: labelsOf(pages),
    blocked: creatives
      .map((creative) => ({ id: creative.id, name: creative.name, reason: airBlockReason(creative, today) }))
      .filter((item) => item.reason),
  };
}

export async function publishNow({ trigger, userId = null, req = null, force = true }) {
  const player = await getPlayer();
  if (!player?.player_id) throw new Error('Player do telão não configurado.');
  const { today, pages, fallback, settings } = await playlistFor();
  if (!pages.length) {
    const error = new Error('Nenhum criativo válido para hoje. Aprove um anúncio ou um institucional.');
    error.status = 409;
    throw error;
  }
  const tooBig = pages.find((page) => page.kind === 'PICTURE' && pictureOverSpec(page.width, page.height));
  if (tooBig) {
    const error = new Error(`${tooBig.name}: ${pictureOverSpec(tooBig.width, tooBig.height)}`);
    error.status = 409;
    throw error;
  }
  const schedule = programSchedule(settings);
  const hash = playlistHash(pages, schedule);
  if (!force) {
    const last = await lastOkPublicacao();
    if (last?.program_hash === hash) return { skipped: true, hash, count: pages.length, fallback };
  }
  const program = buildProgram(pages, player.player_id, today, schedule, callbackUrl(req, 'program'));
  const request = { program, labels: labelsOf(pages) };
  let response = null;
  let ok = false;
  let error = null;
  let httpStatus = 200;
  try {
    response = await publishProgram(program);
    ok = playerAccepted(response, player.player_id);
    if (!ok) error = 'A NovaCloud não confirmou o player.';
  } catch (err) {
    httpStatus = err.status || 502;
    error = err.message;
    response = err.body || { error: err.message };
  }
  const saved = await insertPublicacao({
    trigger,
    user_id: userId,
    creatives_count: pages.length,
    program_hash: hash,
    request,
    response,
    http_status: httpStatus,
    ok,
    error,
  });
  let hookWarning = null;
  if (ok) {
    const noticeUrl = callbackUrl(req, 'program');
    if (noticeUrl) {
      try {
        await registerProgramHook(player.player_id, noticeUrl);
      } catch (err) {
        hookWarning = err.message;
      }
    } else {
      hookWarning = 'Callback não registrado: defina SITE_URL e TELAO_CALLBACK_TOKEN.';
    }
  }
  return { ok, hash, count: pages.length, fallback, error, id: saved.id, hookWarning };
}

async function maybeAlert(recorded) {
  const incident = recorded.incident;
  if (!incident) return;
  const settings = await getSettings();
  const to = alertRecipients(settings);
  if (!to.length) return;
  const minutes = (Date.now() - new Date(incident.started_at).getTime()) / 60000;
  try {
    if (!recorded.online && !incident.alerted_at && minutes >= settings.alert_after_minutes) {
      const sent = await sendOpsEmail({
        to,
        subject: 'Telão offline · Antonov',
        text: `O telão está offline há ${Math.round(minutes)} minutos.`,
        html: `<p>O telão está offline há <strong>${Math.round(minutes)} minutos</strong>.</p>`,
      });
      if (sent) await markIncidentAlert(incident.id, 'offline');
    }
    if (recorded.justClosed && incident.alerted_at && !incident.resolved_alerted_at) {
      const sent = await sendOpsEmail({
        to,
        subject: 'Telão online novamente · Antonov',
        text: 'O telão voltou a ficar online.',
        html: '<p>O telão voltou a ficar online.</p>',
      });
      if (sent) await markIncidentAlert(incident.id, 'resolved');
    }
  } catch (err) {
    console.error('telao alert', err);
  }
}

export async function runTick() {
  if (!novacloudConfigured()) return { skipped: true, reason: 'novacloud' };
  const player = await getPlayer();
  if (!player?.player_id) return { ok: false, error: 'Player não configurado.' };
  const listed = await listPlayers();
  const row = (listed?.rows || []).find((item) => item.playerId === player.player_id);
  if (!row) return { ok: false, error: 'Player não encontrado na NovaCloud.' };
  const recorded = await recordCheck({
    playerId: player.player_id,
    online: Number(row.onlineStatus) === 1,
    ip: row.ip || null,
    lastOnlineTime: row.lastOnlineTime || null,
    firmware: row.version || null,
    productName: row.productName || null,
    width: Number(row.width) || null,
    height: Number(row.height) || null,
    name: row.name || null,
    raw: row,
  });
  await maybeAlert(recorded);
  await pruneStatusLog();
  return { ok: true, online: recorded.online };
}

async function notifyOnce({ kind, refId, to, subject, text, html }) {
  if (!to.length || await avisoExists(kind, refId)) return false;
  const sent = await sendOpsEmail({ to, subject, text, html });
  if (!sent) return false;
  await markAviso(kind, refId, todayInBahia());
  return true;
}

export async function sendExpiryNotices() {
  const today = todayInBahia();
  const settings = await getSettings();
  const staff = alertRecipients(settings);
  let sent = 0;
  if (settings.contract_notices !== false) for (const days of [7, 3, 1]) {
    const rows = await contractsEndingOn(addDays(today, days));
    for (const row of rows) {
      const to = [...new Set([...staff, row.cliente_email].filter(Boolean))];
      const link = row.cliente_whatsapp
        ? ` WhatsApp: https://wa.me/55${String(row.cliente_whatsapp).replace(/\D/g, '').replace(/^55/, '')}`
        : '';
      const ok = await notifyOnce({
        kind: `contrato:${asDateSafe(row.ends_on)}:d${days}`,
        refId: Number(row.id),
        to,
        subject: `Contrato de telão encerra em ${days} dia(s) · ${row.cliente_name}`,
        text: `O contrato de ${row.cliente_name} encerra em ${asDateSafe(row.ends_on)}.${link}`,
        html: `<p>O contrato de <strong>${escapeHtml(row.cliente_name)}</strong> encerra em ${asDateSafe(row.ends_on)}.</p>`,
      });
      if (ok) sent += 1;
    }
  }
  const upcoming = await paymentsDueOn(addDays(today, 3));
  for (const row of upcoming) {
    const ok = await notifyOnce({
      kind: `pagamento:${asDateSafe(row.due_on)}`,
      refId: Number(row.id),
      to: staff,
      subject: `Cobrança de telão vence em 3 dias · ${row.cliente_name}`,
      text: `Parcela de ${row.cliente_name} vence em ${asDateSafe(row.due_on)}.`,
      html: `<p>Parcela de <strong>${escapeHtml(row.cliente_name)}</strong> vence em ${asDateSafe(row.due_on)}.</p>`,
    });
    if (ok) sent += 1;
  }
  const late = await paymentsNewlyLate();
  for (const row of late) {
    const ok = await notifyOnce({
      kind: 'pagamento-atrasado',
      refId: Number(row.id),
      to: staff,
      subject: `Cobrança de telão em atraso · ${row.cliente_name}`,
      text: `Parcela de ${row.cliente_name} com vencimento em ${asDateSafe(row.due_on)} está em atraso.`,
      html: `<p>Parcela de <strong>${escapeHtml(row.cliente_name)}</strong> vencida em ${asDateSafe(row.due_on)}.</p>`,
    });
    if (ok) sent += 1;
  }
  return sent;
}

function asDateSafe(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

export async function runDaily(req) {
  const operational = await refreshOperational();
  let notices = 0;
  let noticeError = null;
  try {
    notices = await sendExpiryNotices();
  } catch (err) {
    noticeError = err.message;
  }
  let publish = null;
  let publishError = null;
  try {
    const settings = await getSettings();
    publish = settings.auto_publish === false
      ? { skipped: true, reason: 'publicacao-automatica-desligada' }
      : await publishNow({ trigger: 'cron', req, force: false });
  } catch (err) {
    publishError = err.message;
  }
  return { operational, notices, noticeError, publish, publishError };
}

export async function receiveCallback({ token, kind, body }) {
  if (!callbackTokenOk(token)) return { unauthorized: true };
  const payload = body && typeof body === 'object' ? body : { raw: String(body || '') };
  await insertCallback(kind, payload);
  if (kind === 'screenshot') {
    const url = findByKey(payload, /screenShotUrl|screenshotUrl|screen_shot_url|^url$/i);
    if (url) {
      await insertCaptura({
        playerId: findByKey(payload, /^playerId$/i),
        url,
        playerTime: findByKey(payload, /^playerTime$/i),
        payload,
      });
    }
  } else {
    const status = Number(payload.status);
    const progress = Number(payload.precess ?? payload.progress);
    if (status === 1001 || status === 1002) {
      const detail = status === 1002
        ? 'A mídia passa do limite do player e não pode ser exibida.'
        : 'O player não conseguiu baixar a mídia.';
      await noteLatestDownload(payload.errmsg || detail);
    } else if (!Number.isFinite(status) || (status === 0 && (!Number.isFinite(progress) || progress >= 1))) {
      await confirmLatestPublicacao();
    }
  }
  return { ok: true };
}

export async function runControl({ action, value, userId, req }) {
  const player = await getPlayer();
  if (!player?.player_id) throw new Error('Player do telão não configurado.');
  const noticeUrl = action === 'capture' ? callbackUrl(req, 'screenshot') : '';
  if (action === 'capture' && !noticeUrl) {
    throw new Error('Defina SITE_URL e TELAO_CALLBACK_TOKEN para receber a captura.');
  }
  let response = null;
  let ok = false;
  let error = null;
  try {
    response = await controlPlayer(action, player.player_id, value, noticeUrl);
    ok = playerAccepted(response, player.player_id);
    if (!ok) error = 'A NovaCloud não confirmou o comando.';
  } catch (err) {
    error = err.message;
    response = err.body || { error: err.message };
  }
  await insertComando({ user_id: userId, action, request: { value: value ?? null }, response, ok });
  if (!ok) {
    const failure = new Error(error || 'Falha no comando.');
    failure.status = 502;
    throw failure;
  }
  return { ok: true, response };
}

export async function reportExhibitions({ clienteId, from, to }) {
  const settings = await getSettings();
  const publications = await listPublicacoesForReport(from, to);
  const rows = estimateFromPublications(publications, {
    from,
    to,
    openTime: settings.open_time,
    closeTime: settings.close_time,
    clienteId: clienteId || null,
  });
  return {
    from,
    to,
    open_time: settings.open_time,
    close_time: settings.close_time,
    rows,
    note: 'Estimativa pelo histórico de publicações e pelo horário de funcionamento. Vídeo sem duração conhecida usa 15 segundos.',
  };
}
