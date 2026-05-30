import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
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

loadEnv();

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error('Defina DATABASE_URL no .env ou nas variáveis do Vercel.');
  process.exit(1);
}

const sql = neon(url);

await sql`
  CREATE TABLE IF NOT EXISTS leads (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    telefone TEXT NOT NULL,
    interesse TEXT,
    mensagem TEXT,
    origem TEXT NOT NULL,
    page TEXT,
    melhor_dia TEXT,
    melhor_turno TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

await sql`CREATE INDEX IF NOT EXISTS leads_origem_idx ON leads (origem);`;
await sql`CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC);`;

console.log('Tabela leads criada/verificada com sucesso.');
