-- Achados e Perdidos — Neon Postgres

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS achados_perdidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_produto TEXT NOT NULL,
  data_cadastro DATE NOT NULL,
  foto_name TEXT,
  foto_type TEXT,
  foto_data TEXT,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'entregue')),
  data_entrega DATE,
  entregue_a TEXT,
  entregue_por TEXT,
  criado_por BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS achados_perdidos_status_idx
  ON achados_perdidos (status, data_cadastro DESC);
