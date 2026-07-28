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
  allow_repeat_spin BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO roleta_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO roleta_premios (name, slug, weight, stock, active, sort_order, color, instruction, pity_every, pity_counter)
VALUES
  ('Copo', 'copo', 10, 50, TRUE, 1, '#FFC20E', 'Retire seu prêmio no balcão da Antonov.', 10, 0),
  ('Boné', 'bone', 8, 30, TRUE, 2, '#009CDE', 'Retire seu prêmio no balcão da Antonov.', 12, 0),
  ('Coqueteleira', 'coqueteleira', 6, 20, TRUE, 3, '#FFC20E', 'Retire seu prêmio no balcão da Antonov.', 16, 0),
  (
    '20% off matrícula + 20% off 1ª mensalidade Holística',
    'desconto-holistica',
    8,
    NULL,
    TRUE,
    4,
    '#009CDE',
    'Apresente este comprovante na Holística para resgatar o desconto.',
    12,
    0
  ),
  (
    'Instalação + 1 mês grátis de internet',
    'internet-gratis',
    8,
    NULL,
    TRUE,
    5,
    '#FFC20E',
    'Fale com a equipe Antonov para ativar sua promoção.',
    12,
    0
  ),
  (
    '1 mês grátis na academia',
    'academia-gratis',
    8,
    NULL,
    TRUE,
    6,
    '#009CDE',
    'Apresente este comprovante na academia parceira.',
    12,
    0
  )
ON CONFLICT (slug) DO NOTHING;
