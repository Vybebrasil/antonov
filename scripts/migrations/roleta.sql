-- Roleta de premiação — Neon Postgres

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS roleta_premios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  weight NUMERIC NOT NULL DEFAULT 1 CHECK (weight >= 0),
  stock INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#FFC20E',
  instruction TEXT NOT NULL DEFAULT 'Retire seu prêmio no balcão.',
  pity_every INTEGER CHECK (pity_every IS NULL OR pity_every > 0),
  pity_counter INTEGER NOT NULL DEFAULT 0 CHECK (pity_counter >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roleta_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS roleta_leads_whatsapp_idx ON roleta_leads (whatsapp);

CREATE TABLE IF NOT EXISTS roleta_spins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES roleta_leads (id) ON DELETE CASCADE,
  prize_id UUID NOT NULL REFERENCES roleta_premios (id),
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS roleta_spins_lead_id_idx ON roleta_spins (lead_id);
CREATE INDEX IF NOT EXISTS roleta_spins_created_at_idx ON roleta_spins (created_at DESC);

CREATE TABLE IF NOT EXISTS roleta_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  whatsapp_cooldown_hours INTEGER NOT NULL DEFAULT 24,
  result_timeout_seconds INTEGER NOT NULL DEFAULT 15,
  allow_repeat_spin BOOLEAN NOT NULL DEFAULT FALSE,
  layout_name TEXT,
  layout_type TEXT,
  layout_data TEXT
);

INSERT INTO roleta_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Prêmios: cadastrar pelo admin (sem seed fixo)
