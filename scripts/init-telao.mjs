import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const envPath = join(root, name);
    if (!existsSync(envPath)) continue;
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
}

function statementsFrom(file) {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

function asTemplate(statement) {
  const strings = [statement];
  strings.raw = [statement];
  return strings;
}

export async function ensureTelaoSchema(sql) {
  const file = join(__dirname, 'migrations', 'telao.sql');
  for (const statement of statementsFrom(file)) {
    if (typeof sql.query === 'function') await sql.query(statement);
    else await sql(asTemplate(statement));
  }

  const playerId = String(process.env.NOVACLOUD_PLAYER_ID || '').trim();
  if (playerId && playerId !== '15a8cf02165316f9985afa918e935489') {
    await sql`
      INSERT INTO telao_players (player_id, name, width, height)
      VALUES (${playerId}, 'Telão', 400, 400)
      ON CONFLICT (player_id) DO NOTHING
    `;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  loadEnv();
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    console.error('Defina DATABASE_URL no .env ou nas variáveis do Vercel.');
    process.exit(1);
  }
  const sql = neon(url);
  await ensureTelaoSchema(sql);
  console.log('Schema Telão pronto.');
}
