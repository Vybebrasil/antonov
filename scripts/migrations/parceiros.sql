-- Módulo Parceiros Antonov
-- Neon Postgres. Idempotente. Não apaga dados existentes.

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS partner_id BIGINT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS modules TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS report_forms TEXT;

UPDATE admin_users SET role = 'super_admin' WHERE role IS NULL OR role = '';

ALTER TABLE admin_users ALTER COLUMN role SET DEFAULT 'admin_antonov';

DO $$ BEGIN
  ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
  ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check
    CHECK (role IN ('super_admin', 'admin_antonov', 'marketing', 'financeiro', 'parceiro'));
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

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
);

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
);

ALTER TABLE partner_plans ADD COLUMN IF NOT EXISTS price NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS partner_plan_benefits (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES partner_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0
);

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
);

CREATE TABLE IF NOT EXISTS partner_services (
  id BIGSERIAL PRIMARY KEY,
  partner_id BIGINT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

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
);

DO $$ BEGIN
  ALTER TABLE partners
    ADD CONSTRAINT partners_photo_media_fk
    FOREIGN KEY (photo_media_id) REFERENCES partner_media(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE partners
    ADD CONSTRAINT partners_logo_media_fk
    FOREIGN KEY (logo_media_id) REFERENCES partner_media(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE partners
    ADD CONSTRAINT partners_cover_media_fk
    FOREIGN KEY (cover_media_id) REFERENCES partner_media(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE admin_users
    ADD CONSTRAINT admin_users_partner_id_fk
    FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
);

ALTER TABLE partner_contracts ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE partner_contracts ADD COLUMN IF NOT EXISTS updated_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE partner_contracts ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE partner_contracts ADD COLUMN IF NOT EXISTS cycle_months INT NOT NULL DEFAULT 12;

CREATE TABLE IF NOT EXISTS partner_contract_events (
  id BIGSERIAL PRIMARY KEY,
  contract_id BIGINT NOT NULL REFERENCES partner_contracts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  message TEXT,
  admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_contract_events_contract_idx ON partner_contract_events (contract_id, created_at DESC);

CREATE TABLE IF NOT EXISTS partner_contract_attachments (
  id BIGSERIAL PRIMARY KEY,
  contract_id BIGINT NOT NULL REFERENCES partner_contracts(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_data TEXT NOT NULL,
  file_size INT NOT NULL DEFAULT 0,
  uploaded_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_contract_attachments_contract_idx ON partner_contract_attachments (contract_id, created_at DESC);

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
);

CREATE INDEX IF NOT EXISTS partner_contract_notifications_status_idx ON partner_contract_notifications (status, warn_days);

CREATE TABLE IF NOT EXISTS partner_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partner_placements (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'arquivado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

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
);

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
);

CREATE TABLE IF NOT EXISTS partner_campaign_placements (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES partner_campaigns(id) ON DELETE CASCADE,
  placement_id BIGINT NOT NULL REFERENCES partner_placements(id) ON DELETE CASCADE,
  UNIQUE (campaign_id, placement_id)
);

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
);

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
);

CREATE INDEX IF NOT EXISTS partners_status_idx ON partners (status, deleted_at, sort_order);
CREATE INDEX IF NOT EXISTS partners_category_idx ON partners (category_id, status);
CREATE INDEX IF NOT EXISTS partners_home_idx ON partners (show_on_home, status, category_id);
CREATE INDEX IF NOT EXISTS partner_services_partner_idx ON partner_services (partner_id, sort_order);
CREATE INDEX IF NOT EXISTS partner_contracts_partner_idx ON partner_contracts (partner_id, status);
CREATE INDEX IF NOT EXISTS partner_contracts_ends_idx ON partner_contracts (ends_on, status);
CREATE INDEX IF NOT EXISTS partner_campaigns_dates_idx ON partner_campaigns (status, starts_on, ends_on);
CREATE INDEX IF NOT EXISTS partner_analytics_type_idx ON partner_analytics_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_analytics_partner_idx ON partner_analytics_events (partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_analytics_campaign_idx ON partner_analytics_events (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_analytics_session_idx ON partner_analytics_events (session_id, event_type, partner_id);

INSERT INTO partner_settings (key, value)
VALUES
  ('contract_warn_days', '30,15,7'),
  ('home_carousel_limit', '12'),
  ('contract_notify_channels', 'admin,whatsapp,email'),
  ('contract_notify_enabled', 'true'),
  ('finance_monthly_goal', '15000')
ON CONFLICT (key) DO NOTHING;
