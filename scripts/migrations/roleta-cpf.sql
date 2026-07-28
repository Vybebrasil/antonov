-- CPF confirmation + unique WhatsApp/CPF

ALTER TABLE roleta_leads
  ADD COLUMN IF NOT EXISTS cpf TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS roleta_leads_whatsapp_unique_idx
  ON roleta_leads (whatsapp);

CREATE UNIQUE INDEX IF NOT EXISTS roleta_leads_cpf_unique_idx
  ON roleta_leads (cpf)
  WHERE cpf IS NOT NULL;

ALTER TABLE roleta_spins
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending_cpf', 'confirmed', 'cancelled'));

ALTER TABLE roleta_spins
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Giros antigos sem fluxo de CPF ficam confirmados
UPDATE roleta_spins
SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, created_at)
WHERE status = 'confirmed' AND confirmed_at IS NULL;
