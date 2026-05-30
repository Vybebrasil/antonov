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
  CREATE TABLE IF NOT EXISTS leads_pre_matricula (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    telefone TEXT NOT NULL,
    interesse TEXT NOT NULL,
    mensagem TEXT,
    page TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

await sql`
  CREATE TABLE IF NOT EXISTS leads_curriculos (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    telefone TEXT NOT NULL,
    area TEXT NOT NULL,
    disponibilidade TEXT,
    mensagem TEXT,
    page TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

await sql`
  CREATE TABLE IF NOT EXISTS leads_tour (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    telefone TEXT NOT NULL,
    interesse TEXT NOT NULL,
    melhor_dia TEXT,
    melhor_turno TEXT,
    mensagem TEXT,
    page TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

await sql`CREATE INDEX IF NOT EXISTS leads_pre_matricula_created_at_idx ON leads_pre_matricula (created_at DESC);`;
await sql`CREATE INDEX IF NOT EXISTS leads_curriculos_created_at_idx ON leads_curriculos (created_at DESC);`;
await sql`CREATE INDEX IF NOT EXISTS leads_tour_created_at_idx ON leads_tour (created_at DESC);`;

/* Migra dados da tabela antiga `leads`, se existir */
const legacy = await sql`
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'leads'
  ) AS exists
`;

if (legacy[0]?.exists) {
  const [{ n: preCount }] = await sql`SELECT COUNT(*)::int AS n FROM leads_pre_matricula`;
  if (preCount === 0) {
    await sql`
      INSERT INTO leads_pre_matricula (nome, email, telefone, interesse, mensagem, page, created_at)
      SELECT nome, email, telefone, COALESCE(interesse, '—'), mensagem, page, created_at
      FROM leads WHERE origem = 'pre-cadastro-inauguracao'
    `;
  }

  const [{ n: curCount }] = await sql`SELECT COUNT(*)::int AS n FROM leads_curriculos`;
  if (curCount === 0) {
    await sql`
      INSERT INTO leads_curriculos (nome, email, telefone, area, disponibilidade, mensagem, page, created_at)
      SELECT nome, email, telefone, COALESCE(interesse, '—'), melhor_turno, mensagem, page, created_at
      FROM leads WHERE origem = 'trabalhe-conosco-curriculo'
    `;
  }

  const [{ n: tourCount }] = await sql`SELECT COUNT(*)::int AS n FROM leads_tour`;
  if (tourCount === 0) {
    await sql`
      INSERT INTO leads_tour (nome, email, telefone, interesse, melhor_dia, melhor_turno, mensagem, page, created_at)
      SELECT nome, email, telefone, COALESCE(interesse, '—'), melhor_dia, melhor_turno, mensagem, page, created_at
      FROM leads WHERE origem = 'contato-tour'
    `;
  }

  console.log('Migração da tabela leads (legado) concluída, se havia registros.');
}

console.log('Tabelas leads_pre_matricula, leads_curriculos e leads_tour prontas.');
