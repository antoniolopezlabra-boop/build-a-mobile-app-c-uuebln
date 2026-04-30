-- ════════════════════════════════════════════════════════════════════
-- VYLTA — Tabla time_blocks
-- Bloqueos de tiempo configurables por el dueño del negocio.
-- Usado para horario de comida, descansos, juntas, etc.
--
-- Lógica:
--   - Si staff_id es NULL → bloqueo del NEGOCIO COMPLETO (afecta a todos).
--   - Si staff_id no es NULL → bloqueo SOLO de ese colaborador (Luxury).
--
--   - Si is_recurring = true → se repite cada semana en el día_of_week dado.
--   - Si is_recurring = false → bloqueo único en specific_date.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS time_blocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff_members(id) ON DELETE CASCADE,

  label TEXT NOT NULL DEFAULT 'Bloqueo',          -- "Comida", "Junta semanal", etc.
  start_time TIME NOT NULL,                        -- "13:00"
  end_time TIME NOT NULL,                          -- "14:00"

  is_recurring BOOLEAN NOT NULL DEFAULT true,
  day_of_week SMALLINT,                            -- 0=Lunes…6=Domingo (cuando is_recurring=true)
  specific_date DATE,                              -- Cuando is_recurring=false

  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraint: si es recurrente, day_of_week obligatorio. Si no, specific_date obligatorio.
  CONSTRAINT time_blocks_date_or_dow_check CHECK (
    (is_recurring = true AND day_of_week IS NOT NULL AND day_of_week BETWEEN 0 AND 6 AND specific_date IS NULL)
    OR
    (is_recurring = false AND specific_date IS NOT NULL AND day_of_week IS NULL)
  ),
  CONSTRAINT time_blocks_time_check CHECK (start_time < end_time)
);

-- Índices para performance en queries de validación de citas
CREATE INDEX IF NOT EXISTS idx_time_blocks_user ON time_blocks(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_time_blocks_staff ON time_blocks(staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_time_blocks_recurring ON time_blocks(user_id, day_of_week) WHERE is_recurring = true AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_time_blocks_specific ON time_blocks(user_id, specific_date) WHERE is_recurring = false AND is_active = true;

-- RLS (Row Level Security)
ALTER TABLE time_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own time_blocks"
  ON time_blocks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own time_blocks"
  ON time_blocks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own time_blocks"
  ON time_blocks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own time_blocks"
  ON time_blocks FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_time_blocks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS time_blocks_updated_at ON time_blocks;
CREATE TRIGGER time_blocks_updated_at
  BEFORE UPDATE ON time_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_time_blocks_updated_at();
