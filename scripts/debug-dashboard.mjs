import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';
import { countAllInRange, getDailyCountsBetween, getDailyCounts } from '../api/lib/forms.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error('DATABASE_URL ausente');
  process.exit(1);
}
process.env.DATABASE_URL = url;

const sql = neon(url);

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

async function tableStats(table) {
  if (table === 'leads_tour') {
    return sql`SELECT COUNT(*)::int AS n, MIN(created_at) AS min_at, MAX(created_at) AS max_at FROM leads_tour`;
  }
  if (table === 'leads_curriculos') {
    return sql`SELECT COUNT(*)::int AS n, MIN(created_at) AS min_at, MAX(created_at) AS max_at FROM leads_curriculos`;
  }
  if (table === 'leads_pre_matricula') {
    return sql`SELECT COUNT(*)::int AS n, MIN(created_at) AS min_at, MAX(created_at) AS max_at FROM leads_pre_matricula`;
  }
  return sql`SELECT COUNT(*)::int AS n, MIN(created_at) AS min_at, MAX(created_at) AS max_at FROM form_submissions`;
}

for (const t of ['leads_tour', 'leads_curriculos', 'leads_pre_matricula', 'form_submissions']) {
  const r = await tableStats(t);
  console.log(t, r[0]);
}

const dayRow = await sql`
  SELECT DATE(created_at AT TIME ZONE 'UTC') AS day, COUNT(*)::int AS n
  FROM leads_tour
  GROUP BY 1
  ORDER BY 1 DESC
  LIMIT 3
`;
console.log('\nSample DATE rows from leads_tour:');
for (const r of dayRow) {
  console.log({ raw: r.day, type: typeof r.day, string: String(r.day), slice: String(r.day).slice(0, 10) });
}

const fromIso = daysAgo(30);
const toIso = new Date().toISOString();
console.log('\nRange:', fromIso, '->', toIso);
console.log('countAllInRange(30d):', await countAllInRange(fromIso, toIso));

const daily = await getDailyCountsBetween(fromIso, toIso);
const nonZero = daily.filter((d) => d.count > 0);
console.log('getDailyCountsBetween points:', daily.length, 'non-zero:', nonZero.length);
console.log('sample non-zero:', nonZero.slice(0, 5));

const dailyLegacy = await getDailyCounts(30);
const nonZeroLegacy = dailyLegacy.filter((d) => d.count > 0);
console.log('getDailyCounts(30) points:', dailyLegacy.length, 'non-zero:', nonZeroLegacy.length);
console.log('sample legacy non-zero:', nonZeroLegacy.slice(0, 5));
