-- ══════════════════════════════════════════════════════════════════════
-- TARJETAS DE LEALTAD (Ago 2026)
--
-- El negocio (planes Premium/Luxury) activa la funcionalidad y define:
--   • cada cuántas visitas se gana la recompensa (loyalty_visits_required)
--   • qué descuento otorga (loyalty_reward_percent: 25 / 50 / 75 / 100)
--
-- Las visitas se acumulan por TELÉFONO del cliente (normalizado a 10 dígitos),
-- por eso un mismo teléfono acumula aunque se registre con nombres distintos.
-- El contador es POR NEGOCIO (user_id): el mismo cliente en dos negocios
-- distintos tiene tarjetas independientes.
--
-- Diseño CALCULADO (no contador incremental): el progreso se deriva de las
-- citas reales + los canjes registrados. Así nunca se desincroniza si se
-- borra/edita una cita.
--
-- Fase 2 (futuro): al alcanzar la recompensa, n8n + 360dialog enviarán la
-- promoción por WhatsApp. La RPC get_loyalty_progress ya expone lo necesario.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Configuración por negocio ────────────────────────────────────
ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS loyalty_enabled         BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS loyalty_visits_required INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS loyalty_reward_percent  INTEGER DEFAULT 100;

-- Solo se permiten los 4 descuentos definidos en producto.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_profiles_loyalty_reward_percent_chk') THEN
    ALTER TABLE business_profiles
      ADD CONSTRAINT business_profiles_loyalty_reward_percent_chk
      CHECK (loyalty_reward_percent IN (25, 50, 75, 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_profiles_loyalty_visits_required_chk') THEN
    ALTER TABLE business_profiles
      ADD CONSTRAINT business_profiles_loyalty_visits_required_chk
      CHECK (loyalty_visits_required BETWEEN 2 AND 50);
  END IF;
END $$;

-- ─── 2. Normalizador de teléfono ─────────────────────────────────────
-- '+52 442 466 2238' / '(442) 466-2238' → '4424662238'
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(p_phone, ''), '\D', '', 'g'), 10), '');
$$;

-- ─── 3. Canjes (cierra un ciclo de la tarjeta) ───────────────────────
CREATE TABLE IF NOT EXISTS public.loyalty_redemptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_phone      TEXT NOT NULL,              -- normalizado (10 dígitos)
  client_id         UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name       TEXT,
  reward_percent    INTEGER NOT NULL,
  visits_required   INTEGER NOT NULL,           -- snapshot de la config al canjear
  redeemed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  appointment_id    UUID REFERENCES appointments(id) ON DELETE SET NULL,
  notified_at       TIMESTAMPTZ,                -- fase 2: cuándo se avisó por WhatsApp
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_user_phone
  ON public.loyalty_redemptions (user_id, client_phone);

ALTER TABLE public.loyalty_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loyalty_redemptions_own" ON public.loyalty_redemptions;
CREATE POLICY "loyalty_redemptions_own" ON public.loyalty_redemptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── 4. Progreso de la tarjeta de un cliente ─────────────────────────
-- Qué cuenta como VISITA: una cita cuya fecha ya pasó (o es hoy) y que NO
-- fue cancelada / no-asistió / reagendada. Se cuentan también las que el
-- negocio dejó en "Confirmada" o "Pendiente" (muchos no marcan "Pagado"),
-- porque el cliente sí asistió.
CREATE OR REPLACE FUNCTION public.get_loyalty_progress(
  p_user_id UUID,
  p_phone   TEXT
)
RETURNS TABLE (
  total_visits     INTEGER,
  visits_in_cycle  INTEGER,
  visits_required  INTEGER,
  reward_percent   INTEGER,
  redemptions      INTEGER,
  is_eligible      BOOLEAN,
  enabled          BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_phone   TEXT := public.normalize_phone(p_phone);
  v_req     INTEGER;
  v_pct     INTEGER;
  v_on      BOOLEAN;
  v_total   INTEGER := 0;
  v_redeem  INTEGER := 0;
BEGIN
  SELECT COALESCE(bp.loyalty_visits_required, 10),
         COALESCE(bp.loyalty_reward_percent, 100),
         COALESCE(bp.loyalty_enabled, false)
    INTO v_req, v_pct, v_on
  FROM business_profiles bp
  WHERE bp.user_id = p_user_id
  LIMIT 1;

  v_req := COALESCE(v_req, 10);
  v_pct := COALESCE(v_pct, 100);
  v_on  := COALESCE(v_on, false);

  IF v_phone IS NULL THEN
    RETURN QUERY SELECT 0, 0, v_req, v_pct, 0, false, v_on;
    RETURN;
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_total
  FROM appointments a
  JOIN clients c ON c.id = a.client_id
  WHERE a.user_id = p_user_id
    AND public.normalize_phone(c.phone) = v_phone
    AND a.date::date <= (NOW() AT TIME ZONE 'America/Mexico_City')::date
    AND a.status NOT IN ('Cancelada', 'No asistió', 'Reagendada');

  SELECT COUNT(*)::INTEGER INTO v_redeem
  FROM loyalty_redemptions r
  WHERE r.user_id = p_user_id AND r.client_phone = v_phone;

  RETURN QUERY SELECT
    v_total,
    GREATEST(0, v_total - (v_redeem * v_req)),
    v_req,
    v_pct,
    v_redeem,
    (v_on AND (v_total - (v_redeem * v_req)) >= v_req),
    v_on;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_loyalty_progress(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_phone(TEXT) TO authenticated;
