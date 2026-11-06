import { getSql } from '../db.js';
import { json } from '../admin-http.js';
import { ensureColaboradoresSchema } from '../pdi.js';

export { getSql, json };

export function segments(req) {
  const raw = req.query?.path;
  if (typeof raw === 'string') return raw.split('/').filter(Boolean);
  if (Array.isArray(raw)) return raw.filter(Boolean);
  const pathname = String(req.url || '').split('?')[0];
  const prefix = '/api/admin/rh/';
  if (pathname.startsWith(prefix)) return pathname.slice(prefix.length).split('/').filter(Boolean);
  return [];
}

/**
 * Cria uma função idempotente de schema: roda `fn(sql)` uma vez por instância
 * e tenta de novo na próxima chamada se falhar.
 */
export function createEnsure(fn) {
  let ready = null;
  return function ensure() {
    if (!ready) {
      ready = (async () => {
        await ensureColaboradoresSchema();
        await fn(getSql());
      })().catch((err) => {
        ready = null;
        throw err;
      });
    }
    return ready;
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_RE.test(String(value ?? ''));
}

export async function getColaboradorAtivo(id) {
  if (!isUuid(id)) return null;
  await ensureColaboradoresSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM colaboradores_perfis
    WHERE id = ${String(id)} AND deleted_at IS NULL
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function listColaboradoresAtivos() {
  await ensureColaboradoresSchema();
  const sql = getSql();
  return sql`
    SELECT id, nome, email, cargo_atual, cargo_almejado, admin_user_id, created_at
    FROM colaboradores_perfis
    WHERE deleted_at IS NULL
    ORDER BY nome ASC
  `;
}

export function str(value, max = 5000) {
  const s = String(value ?? '').trim();
  return s ? s.slice(0, max) : null;
}

export function int(value, { min = -Infinity, max = Infinity } = {}) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

export function dateOnly(value) {
  const s = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

const FEMININOS = /(ção|são|dade|agem|ade|trilha|reunião|integração|avaliação|checagem|ação|meta)$/i;

export function notFound(res, what = 'Registro') {
  const genero = FEMININOS.test(String(what).trim()) ? 'encontrada' : 'encontrado';
  return json(res, 404, { error: `${what} não ${genero}.` });
}
