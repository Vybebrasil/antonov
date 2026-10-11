-- Módulo Telão (NovaStar TB40 / NovaCloud). Neon Postgres. Idempotente.

CREATE TABLE IF NOT EXISTS telao_clientes (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  document TEXT,
  contact_name TEXT,
  email TEXT,
  whatsapp TEXT,
  notes TEXT,
  partner_id BIGINT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'pausado', 'arquivado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS telao_contratos (
  id BIGSERIAL PRIMARY KEY,
  cliente_id BIGINT NOT NULL REFERENCES telao_clientes(id) ON DELETE RESTRICT,
  title TEXT,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  insercoes_por_ciclo INT NOT NULL DEFAULT 1,
  auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
  cycle_months INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'ativo', 'pausado', 'vencido', 'cancelado')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS telao_pagamentos (
  id BIGSERIAL PRIMARY KEY,
  contrato_id BIGINT NOT NULL REFERENCES telao_contratos(id) ON DELETE CASCADE,
  due_on DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  paid_on DATE,
  method TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'atrasado', 'cancelado')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telao_criativos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id BIGINT REFERENCES telao_contratos(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('PICTURE', 'VIDEO')),
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  md5 TEXT NOT NULL,
  width INT,
  height INT,
  duration_ms INT NOT NULL DEFAULT 10000,
  position INT NOT NULL DEFAULT 0,
  starts_on DATE,
  ends_on DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  institutional BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS telao_players (
  id BIGSERIAL PRIMARY KEY,
  player_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT 'Telão',
  sn TEXT,
  width INT NOT NULL DEFAULT 400,
  height INT NOT NULL DEFAULT 400,
  online BOOLEAN,
  last_seen_at TIMESTAMPTZ,
  ip TEXT,
  firmware TEXT,
  product_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telao_status_log (
  id BIGSERIAL PRIMARY KEY,
  player_id TEXT NOT NULL,
  online BOOLEAN NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip TEXT,
  last_online_time TEXT,
  raw JSONB
);

CREATE TABLE IF NOT EXISTS telao_incidentes (
  id BIGSERIAL PRIMARY KEY,
  player_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  alerted_at TIMESTAMPTZ,
  resolved_alerted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS telao_publicacoes (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'cron')),
  user_id BIGINT,
  creatives_count INT NOT NULL,
  program_hash TEXT NOT NULL,
  request JSONB NOT NULL,
  response JSONB,
  http_status INT,
  ok BOOLEAN NOT NULL,
  confirmado_em TIMESTAMPTZ,
  error TEXT
);

CREATE TABLE IF NOT EXISTS telao_callbacks (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kind TEXT NOT NULL,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS telao_capturas (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  player_id TEXT,
  url TEXT,
  player_time TEXT,
  payload JSONB
);

CREATE TABLE IF NOT EXISTS telao_comandos (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id BIGINT,
  action TEXT NOT NULL,
  request JSONB,
  response JSONB,
  ok BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS telao_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  open_time TEXT NOT NULL DEFAULT '06:00:00',
  close_time TEXT NOT NULL DEFAULT '23:00:00',
  alert_after_minutes INT NOT NULL DEFAULT 15,
  alert_emails TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telao_avisos (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  ref_id BIGINT NOT NULL,
  sent_on DATE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  UNIQUE (kind, ref_id, channel)
);

CREATE INDEX IF NOT EXISTS telao_contratos_cliente_idx ON telao_contratos (cliente_id, starts_on DESC);
CREATE INDEX IF NOT EXISTS telao_pagamentos_contrato_idx ON telao_pagamentos (contrato_id, due_on);
CREATE INDEX IF NOT EXISTS telao_criativos_position_idx ON telao_criativos (position) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS telao_status_log_player_idx ON telao_status_log (player_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS telao_publicacoes_created_idx ON telao_publicacoes (created_at DESC);
CREATE INDEX IF NOT EXISTS telao_incidentes_open_idx ON telao_incidentes (player_id) WHERE ended_at IS NULL;

ALTER TABLE telao_settings ADD COLUMN IF NOT EXISTS default_duration_ms INT NOT NULL DEFAULT 10000;
ALTER TABLE telao_settings ADD COLUMN IF NOT EXISTS institutional_fallback BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE telao_settings ADD COLUMN IF NOT EXISTS week_days TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6';
ALTER TABLE telao_settings ADD COLUMN IF NOT EXISTS contract_notices BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE telao_settings ADD COLUMN IF NOT EXISTS auto_publish BOOLEAN NOT NULL DEFAULT TRUE;

INSERT INTO telao_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

INSERT INTO telao_players (player_id, name, sn, width, height)
VALUES ('15a8cf02165316f9985afa918e935489', 'T40_00000391', '26514N000000391', 400, 400)
ON CONFLICT (player_id) DO NOTHING;
