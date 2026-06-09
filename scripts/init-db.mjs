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

/* ----- Admin panel ----- */
await sql`
  CREATE TABLE IF NOT EXISTS admin_users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

await sql`
  CREATE TABLE IF NOT EXISTS forms (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    source_type TEXT NOT NULL DEFAULT 'dynamic' CHECK (source_type IN ('dynamic', 'legacy')),
    legacy_table TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

await sql`
  CREATE TABLE IF NOT EXISTS form_fields (
    id BIGSERIAL PRIMARY KEY,
    form_id BIGINT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    field_key TEXT NOT NULL,
    label TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK (field_type IN ('text', 'email', 'tel', 'textarea', 'select', 'checkbox', 'radio', 'date', 'number')),
    required BOOLEAN NOT NULL DEFAULT false,
    options JSONB,
    description TEXT,
    placeholder TEXT,
    default_value TEXT,
    show_when JSONB,
    field_width TEXT NOT NULL DEFAULT 'full',
    sort_order INT NOT NULL DEFAULT 0,
    UNIQUE(form_id, field_key)
  );
`;

await sql`
  DO $$ BEGIN
    ALTER TABLE form_fields DROP CONSTRAINT IF EXISTS form_fields_field_type_check;
    ALTER TABLE form_fields ADD CONSTRAINT form_fields_field_type_check
      CHECK (field_type IN ('text', 'email', 'tel', 'textarea', 'select', 'checkbox', 'radio', 'date', 'number'));
  EXCEPTION WHEN undefined_table THEN NULL;
  END $$;
`;

await sql`ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS default_value TEXT;`;
await sql`
  UPDATE form_fields SET default_value = NULL
  WHERE default_value IS NOT NULL AND LOWER(TRIM(default_value)) IN ('null', 'undefined')
`;

await sql`ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS description TEXT;`;
await sql`ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS placeholder TEXT;`;
await sql`ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS show_when JSONB;`;
await sql`ALTER TABLE form_fields ADD COLUMN IF NOT EXISTS field_width TEXT NOT NULL DEFAULT 'full';`;
await sql`
  DO $$ BEGIN
    ALTER TABLE form_fields DROP CONSTRAINT IF EXISTS form_fields_field_width_check;
    ALTER TABLE form_fields ADD CONSTRAINT form_fields_field_width_check
      CHECK (field_width IN ('full', 'half', 'third'));
  EXCEPTION WHEN undefined_table THEN NULL;
  END $$;
`;

await sql`
  UPDATE form_fields SET description = NULL
  WHERE description IS NOT NULL AND LOWER(TRIM(description)) IN ('null', 'undefined')
`;
await sql`
  UPDATE form_fields SET placeholder = NULL
  WHERE placeholder IS NOT NULL AND LOWER(TRIM(placeholder)) IN ('null', 'undefined')
`;

await sql`
  CREATE TABLE IF NOT EXISTS form_submissions (
    id BIGSERIAL PRIMARY KEY,
    form_id BIGINT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    page TEXT,
    ip_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

await sql`
  CREATE TABLE IF NOT EXISTS form_rate_limits (
    ip_hash TEXT NOT NULL,
    slug TEXT NOT NULL,
    submit_count INT NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (ip_hash, slug)
  );
`;

await sql`CREATE INDEX IF NOT EXISTS form_submissions_form_id_idx ON form_submissions (form_id, created_at DESC);`;
await sql`CREATE INDEX IF NOT EXISTS form_fields_form_id_idx ON form_fields (form_id, sort_order);`;

const legacyForms = [
  {
    slug: 'contato-tour',
    name: 'Contato / Tour',
    description: 'Formulário de contato e agendamento de visita',
    legacy_table: 'leads_tour',
  },
  {
    slug: 'trabalhe-conosco',
    name: 'Trabalhe conosco',
    description: 'Envio de currículo',
    legacy_table: 'leads_curriculos',
  },
  {
    slug: 'pre-matricula',
    name: 'Pré-matrícula VIP',
    description: 'Pré-cadastro de inauguração',
    legacy_table: 'leads_pre_matricula',
  },
];

for (const f of legacyForms) {
  await sql`
    INSERT INTO forms (slug, name, description, status, source_type, legacy_table)
    VALUES (${f.slug}, ${f.name}, ${f.description}, 'active', 'legacy', ${f.legacy_table})
    ON CONFLICT (slug) DO NOTHING
  `;
}

console.log('Tabelas admin (forms, form_fields, form_submissions, admin_users) prontas.');
console.log('Formulários legados registrados no admin (se ainda não existiam).');
