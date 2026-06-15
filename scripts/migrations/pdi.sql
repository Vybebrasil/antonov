-- Módulo RH / PDI — migrations Supabase/PostgreSQL
-- Adaptado para Neon Postgres (RLS opcional; o admin usa auth JWT própria)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS colaboradores_perfis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  cargo_atual TEXT,
  cargo_almejado TEXT,
  pontos_fortes TEXT[],
  budget_anual NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS colaboradores_perfis_email_idx ON colaboradores_perfis (LOWER(email));

CREATE TABLE IF NOT EXISTS pdis_ciclos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES colaboradores_perfis(id) ON DELETE CASCADE,
  lider_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  objetivo_principal_smart TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'ativo', 'concluido', 'cancelado')),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  gaps_tecnicos TEXT[],
  gaps_comportamentais TEXT[],
  budget_limite NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (data_fim > data_inicio)
);

CREATE TABLE IF NOT EXISTS pdis_planos_acao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id UUID NOT NULL REFERENCES pdis_ciclos(id) ON DELETE CASCADE,
  dimensao_70_20_10 TEXT NOT NULL
    CHECK (dimensao_70_20_10 IN ('pratico_70', 'social_20', 'formal_10')),
  acao_descricao TEXT NOT NULL,
  prazo_limite DATE,
  mentor_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  evidencia_aprendizado TEXT,
  investimento_estimado NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'nao_iniciado'
    CHECK (status IN ('nao_iniciado', 'em_andamento', 'concluido')),
  anotacoes_colaborador TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pdis_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id UUID NOT NULL REFERENCES pdis_ciclos(id) ON DELETE CASCADE,
  data_reuniao DATE NOT NULL,
  anotacoes_lider TEXT,
  anotacoes_liderado TEXT,
  proximos_passos TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pdis_ciclos_colaborador_idx ON pdis_ciclos (colaborador_id, status);
CREATE INDEX IF NOT EXISTS pdis_planos_acao_ciclo_idx ON pdis_planos_acao (ciclo_id);
CREATE INDEX IF NOT EXISTS pdis_checkpoints_ciclo_idx ON pdis_checkpoints (ciclo_id, data_reuniao DESC);

-- RLS (Supabase): habilitar se usar auth.uid() vinculado a admin_users
-- ALTER TABLE colaboradores_perfis ENABLE ROW LEVEL SECURITY;
-- Exemplo: gestor vê equipe onde lider_id = auth.uid()
