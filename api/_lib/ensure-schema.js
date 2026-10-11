import { getSql } from './db.js';

let pending = null;

async function run() {
  const sql = getSql();
  const { ensureParceirosSchema } = await import('../../scripts/init-parceiros.mjs');
  const { ensureTelaoSchema } = await import('../../scripts/init-telao.mjs');
  await ensureParceirosSchema(sql);
  await ensureTelaoSchema(sql);
}

export function ensureAppSchema() {
  if (!pending) {
    pending = run().catch((err) => {
      pending = null;
      throw err;
    });
  }
  return pending;
}

export function isMissingColumn(err) {
  return err?.code === '42703' || /column .* does not exist/i.test(String(err?.message || ''));
}

export async function ensureIfNeeded() {
  const sql = getSql();
  const rows = await sql`
    SELECT to_regclass('public.telao_settings') AS telao,
           to_regclass('public.partner_settings') AS partners
  `;
  if (rows[0]?.telao && rows[0]?.partners) return;
  await ensureAppSchema();
}
