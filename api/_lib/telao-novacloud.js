import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const DEFAULT_BASE = 'https://open-us.vnnox.com';

export function novacloudConfigured() {
  return Boolean(process.env.NOVACLOUD_APP_KEY && process.env.NOVACLOUD_APP_SECRET);
}

function authHeaders() {
  const secret = process.env.NOVACLOUD_APP_SECRET;
  const key = process.env.NOVACLOUD_APP_KEY;
  if (!secret || !key) {
    throw new Error('NovaCloud não configurada. Defina NOVACLOUD_APP_KEY e NOVACLOUD_APP_SECRET.');
  }
  const nonce = randomBytes(12).toString('hex');
  const curTime = Math.floor(Date.now() / 1000).toString();
  const checkSum = createHash('sha256').update(secret + nonce + curTime).digest('hex');
  return { AppKey: key, Nonce: nonce, CurTime: curTime, CheckSum: checkSum };
}

export async function nova(method, path, body) {
  const base = (process.env.NOVACLOUD_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
  const res = await fetch(base + path, {
    method,
    headers: {
      ...authHeaders(),
      ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const detail = data?.error?.code || text.slice(0, 300);
    const error = new Error(`NovaCloud ${res.status}: ${detail}`);
    error.status = res.status;
    error.body = data;
    throw error;
  }
  return data;
}

export function listPlayers() {
  return nova('GET', '/v2/player/list?count=100&start=0');
}

export function publishProgram(program) {
  return nova('POST', '/v2/player/program/normal', program);
}

export function registerProgramHook(playerId, noticeUrl) {
  return nova('POST', '/v2/notification-hooks/program-updates', {
    playerIds: [playerId],
    noticeUrl,
  });
}

export function playerAccepted(response, playerId) {
  const success = Array.isArray(response?.success) ? response.success : [];
  const fail = Array.isArray(response?.fail) ? response.fail : [];
  return success.includes(playerId) && fail.length === 0;
}

export async function controlPlayer(action, playerId, value, noticeUrl) {
  if (action === 'brightness' || action === 'volume') {
    const level = Number(value);
    if (!Number.isInteger(level) || level < 0 || level > 100) {
      throw new Error('Informe um valor inteiro de 0 a 100.');
    }
    const path = action === 'brightness'
      ? '/v2/player/real-time-control/brightness'
      : '/v2/player/real-time-control/volume';
    return nova('POST', path, { playerIds: [playerId], value: level });
  }
  if (action === 'screen') {
    if (value !== 'OPEN' && value !== 'CLOSE') throw new Error('Status de tela inválido.');
    return nova('POST', '/v2/player/real-time-control/screen-status', { playerIds: [playerId], status: value });
  }
  if (action === 'reboot') {
    return nova('POST', '/v2/player/real-time-control/reboot', { playerIds: [playerId] });
  }
  if (action === 'capture') {
    if (!noticeUrl) throw new Error('URL de retorno da captura não configurada.');
    return nova('POST', '/v2/player/real-time-control/screen-capture', { playerIds: [playerId], noticeUrl });
  }
  throw new Error('Comando inválido.');
}

export function callbackTokenOk(given) {
  const expected = String(process.env.TELAO_CALLBACK_TOKEN || '');
  const received = String(given || '');
  if (!expected || !received || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export function cronAuthorized(req) {
  const secret = process.env.TELAO_CRON_SECRET || process.env.CRON_SECRET;
  const auth = String(req.headers?.authorization || '');
  return Boolean(secret) && auth === `Bearer ${secret}`;
}
