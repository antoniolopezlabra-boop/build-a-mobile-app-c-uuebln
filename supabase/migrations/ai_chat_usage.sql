-- ════════════════════════════════════════════════════════════════════
-- VYLTA — Tabla ai_chat_usage
-- Rate limiting del asistente IA por usuario por día.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_chat_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_usage_user_day ON ai_chat_usage(user_id, day);

-- RLS: solo el dueño puede ver su propio uso (las escrituras las hace la Edge Function con service role)
ALTER TABLE ai_chat_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
  ON ai_chat_usage FOR SELECT
  USING (auth.uid() = user_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_ai_chat_usage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_chat_usage_updated_at ON ai_chat_usage;
CREATE TRIGGER ai_chat_usage_updated_at
  BEFORE UPDATE ON ai_chat_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_chat_usage_updated_at();
