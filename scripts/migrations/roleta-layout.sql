-- Layout PNG do totem (1080×1920)
ALTER TABLE roleta_settings ADD COLUMN IF NOT EXISTS layout_name TEXT;
ALTER TABLE roleta_settings ADD COLUMN IF NOT EXISTS layout_type TEXT;
ALTER TABLE roleta_settings ADD COLUMN IF NOT EXISTS layout_data TEXT;
