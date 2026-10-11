import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { DEFAULT_PLACEMENTS, DEFAULT_PLANS } from '../api/_lib/parceiros-logic.js';

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

export async function ensureParceirosSchema(sql) {
  await sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS name TEXT`;
  await sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role TEXT`;
  await sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS partner_id BIGINT`;
  await sql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
  await sql`UPDATE admin_users SET role = 'super_admin' WHERE role IS NULL OR role = ''`;
  await sql`ALTER TABLE admin_users ALTER COLUMN role SET DEFAULT 'admin_antonov'`;
  await sql`
    DO $$ BEGIN
      ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
      ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check
        CHECK (role IN ('super_admin', 'admin_antonov', 'marketing', 'financeiro', 'parceiro'));
    EXCEPTION WHEN undefined_table THEN NULL;
    END $$
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_categories (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      sort_order INT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'arquivada')),
      icon TEXT,
      image_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_plans (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      sort_order INT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'arquivado')),
      priority INT NOT NULL DEFAULT 0,
      price NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `;

  await sql`ALTER TABLE partner_plans ADD COLUMN IF NOT EXISTS price NUMERIC(12,2) NOT NULL DEFAULT 0`;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_plan_benefits (
      id BIGSERIAL PRIMARY KEY,
      plan_id BIGINT NOT NULL REFERENCES partner_plans(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      sort_order INT NOT NULL DEFAULT 0
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS partners (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      trade_name TEXT,
      category_id BIGINT REFERENCES partner_categories(id) ON DELETE SET NULL,
      specialty TEXT,
      profession TEXT,
      registry TEXT,
      short_description TEXT,
      full_description TEXT,
      photo_media_id BIGINT,
      logo_media_id BIGINT,
      cover_media_id BIGINT,
      whatsapp TEXT,
      instagram TEXT,
      website TEXT,
      email TEXT,
      venue_name TEXT,
      address TEXT,
      address_complement TEXT,
      neighborhood TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      maps_url TEXT,
      status TEXT NOT NULL DEFAULT 'rascunho'
        CHECK (status IN ('rascunho', 'ativo', 'pausado', 'expirado', 'arquivado')),
      featured BOOLEAN NOT NULL DEFAULT false,
      show_on_home BOOLEAN NOT NULL DEFAULT true,
      priority INT NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_services (
      id BIGSERIAL PRIMARY KEY,
      partner_id BIGINT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_media (
      id BIGSERIAL PRIMARY KEY,
      partner_id BIGINT REFERENCES partners(id) ON DELETE SET NULL,
      kind TEXT NOT NULL DEFAULT 'photo'
        CHECK (kind IN ('photo', 'logo', 'cover', 'banner', 'creative')),
      file_name TEXT,
      file_type TEXT,
      file_data TEXT,
      width INT,
      height INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    DO $$ BEGIN
      ALTER TABLE partners DROP CONSTRAINT IF EXISTS partners_photo_media_fk;
      ALTER TABLE partners ADD CONSTRAINT partners_photo_media_fk
        FOREIGN KEY (photo_media_id) REFERENCES partner_media(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `;
  await sql`
    DO $$ BEGIN
      ALTER TABLE partners DROP CONSTRAINT IF EXISTS partners_logo_media_fk;
      ALTER TABLE partners ADD CONSTRAINT partners_logo_media_fk
        FOREIGN KEY (logo_media_id) REFERENCES partner_media(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `;
  await sql`
    DO $$ BEGIN
      ALTER TABLE partners DROP CONSTRAINT IF EXISTS partners_cover_media_fk;
      ALTER TABLE partners ADD CONSTRAINT partners_cover_media_fk
        FOREIGN KEY (cover_media_id) REFERENCES partner_media(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `;
  await sql`
    DO $$ BEGIN
      ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_partner_id_fk;
      ALTER TABLE admin_users ADD CONSTRAINT admin_users_partner_id_fk
        FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_contracts (
      id BIGSERIAL PRIMARY KEY,
      partner_id BIGINT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      plan_id BIGINT REFERENCES partner_plans(id) ON DELETE SET NULL,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      starts_on DATE NOT NULL,
      ends_on DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('ativo', 'pendente', 'vencendo', 'vencido', 'cancelado')),
      payment_method TEXT,
      notes TEXT,
      created_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
      updated_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `;

  await sql`ALTER TABLE partner_contracts ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL`;
  await sql`ALTER TABLE partner_contracts ADD COLUMN IF NOT EXISTS updated_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL`;
  await sql`ALTER TABLE partner_contracts ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE partner_contracts ADD COLUMN IF NOT EXISTS cycle_months INT NOT NULL DEFAULT 12`;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_contract_events (
      id BIGSERIAL PRIMARY KEY,
      contract_id BIGINT NOT NULL REFERENCES partner_contracts(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      message TEXT,
      admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS partner_contract_events_contract_idx ON partner_contract_events (contract_id, created_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_contract_attachments (
      id BIGSERIAL PRIMARY KEY,
      contract_id BIGINT NOT NULL REFERENCES partner_contracts(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_type TEXT,
      file_data TEXT NOT NULL,
      file_size INT NOT NULL DEFAULT 0,
      uploaded_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS partner_contract_attachments_contract_idx ON partner_contract_attachments (contract_id, created_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_contract_notifications (
      id BIGSERIAL PRIMARY KEY,
      contract_id BIGINT NOT NULL REFERENCES partner_contracts(id) ON DELETE CASCADE,
      warn_days INT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payload TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      UNIQUE (contract_id, warn_days, channel)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS partner_contract_notifications_status_idx ON partner_contract_notifications (status, warn_days)`;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    INSERT INTO partner_settings (key, value)
    VALUES
      ('contract_notify_channels', 'admin,whatsapp,email'),
      ('contract_notify_enabled', 'true'),
      ('finance_monthly_goal', '15000')
    ON CONFLICT (key) DO NOTHING
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_placements (
      id BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'arquivado')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_creatives (
      id BIGSERIAL PRIMARY KEY,
      partner_id BIGINT REFERENCES partners(id) ON DELETE SET NULL,
      kind TEXT NOT NULL DEFAULT 'image'
        CHECK (kind IN ('image', 'logo', 'banner', 'text')),
      media_id BIGINT REFERENCES partner_media(id) ON DELETE SET NULL,
      headline TEXT,
      body TEXT,
      cta_label TEXT,
      cta_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_campaigns (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      partner_id BIGINT REFERENCES partners(id) ON DELETE SET NULL,
      starts_on DATE,
      ends_on DATE,
      status TEXT NOT NULL DEFAULT 'rascunho'
        CHECK (status IN ('rascunho', 'agendada', 'ativa', 'pausada', 'finalizada')),
      placement_id BIGINT REFERENCES partner_placements(id) ON DELETE SET NULL,
      creative_id BIGINT REFERENCES partner_creatives(id) ON DELETE SET NULL,
      link_url TEXT,
      priority INT NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_campaign_placements (
      id BIGSERIAL PRIMARY KEY,
      campaign_id BIGINT NOT NULL REFERENCES partner_campaigns(id) ON DELETE CASCADE,
      placement_id BIGINT NOT NULL REFERENCES partner_placements(id) ON DELETE CASCADE,
      UNIQUE (campaign_id, placement_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_payments (
      id BIGSERIAL PRIMARY KEY,
      contract_id BIGINT REFERENCES partner_contracts(id) ON DELETE SET NULL,
      partner_id BIGINT REFERENCES partners(id) ON DELETE SET NULL,
      contracted_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      received_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      due_on DATE,
      status TEXT NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pago', 'pendente', 'atrasado', 'cancelado')),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS partner_analytics_events (
      id BIGSERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      partner_id BIGINT REFERENCES partners(id) ON DELETE SET NULL,
      campaign_id BIGINT REFERENCES partner_campaigns(id) ON DELETE SET NULL,
      placement_id BIGINT REFERENCES partner_placements(id) ON DELETE SET NULL,
      category_id BIGINT REFERENCES partner_categories(id) ON DELETE SET NULL,
      session_id TEXT,
      page TEXT,
      referrer TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS partners_status_idx ON partners (status, deleted_at, sort_order)`;
  await sql`CREATE INDEX IF NOT EXISTS partners_category_idx ON partners (category_id, status)`;
  await sql`CREATE INDEX IF NOT EXISTS partners_home_idx ON partners (show_on_home, status, category_id)`;
  await sql`CREATE INDEX IF NOT EXISTS partner_services_partner_idx ON partner_services (partner_id, sort_order)`;
  await sql`CREATE INDEX IF NOT EXISTS partner_contracts_partner_idx ON partner_contracts (partner_id, status)`;
  await sql`CREATE INDEX IF NOT EXISTS partner_contracts_ends_idx ON partner_contracts (ends_on, status)`;
  await sql`CREATE INDEX IF NOT EXISTS partner_campaigns_dates_idx ON partner_campaigns (status, starts_on, ends_on)`;
  await sql`CREATE INDEX IF NOT EXISTS partner_analytics_type_idx ON partner_analytics_events (event_type, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS partner_analytics_partner_idx ON partner_analytics_events (partner_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS partner_analytics_campaign_idx ON partner_analytics_events (campaign_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS partner_analytics_session_idx ON partner_analytics_events (session_id, event_type, partner_id)`;

  await sql`
    INSERT INTO partner_settings (key, value)
    VALUES ('contract_warn_days', '30,15,7'), ('home_carousel_limit', '12')
    ON CONFLICT (key) DO NOTHING
  `;

  for (const p of DEFAULT_PLACEMENTS) {
    await sql`
      INSERT INTO partner_placements (code, name, description, status)
      VALUES (${p.code}, ${p.name}, ${p.description}, 'ativo')
      ON CONFLICT (code) DO NOTHING
    `;
  }

  for (const [i, plan] of DEFAULT_PLANS.entries()) {
    const price = Number(plan.price) || 0;
    const rows = await sql`
      INSERT INTO partner_plans (name, slug, description, sort_order, status, priority, price)
      VALUES (${plan.name}, ${plan.slug}, ${plan.description}, ${i}, 'ativo', ${plan.priority}, ${price})
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        priority = EXCLUDED.priority,
        price = CASE
          WHEN partner_plans.price IS NULL OR partner_plans.price = 0 THEN EXCLUDED.price
          ELSE partner_plans.price
        END
      RETURNING id
    `;
    const planId = rows[0].id;
    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM partner_plan_benefits WHERE plan_id = ${planId}`;
    if (n === 0) {
      for (const [j, benefit] of plan.benefits.entries()) {
        await sql`
          INSERT INTO partner_plan_benefits (plan_id, name, sort_order)
          VALUES (${planId}, ${benefit}, ${j})
        `;
      }
    }
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
  await ensureParceirosSchema(sql);
  console.log('Schema Parceiros Antonov pronto.');
}
