-- ══════════════════════════════════════════════════════════════════════
-- COBROS ANTICIPADOS CON STRIPE CONNECT (Ago 2026)
--
-- El negocio conecta su PROPIA cuenta de Stripe (Connect Express). El dinero
-- del anticipo le llega DIRECTO; Stripe hace el KYC y custodia sus datos
-- bancarios. VYLTA nunca almacena CLABE ni tarjetas — solo el id de la
-- cuenta conectada (acct_...), que no es dato sensible.
--
-- FLUJO:
--   1. Dueño activa cobros anticipados y conecta Stripe (onboarding hospedado).
--   2. Define % del anticipo (25/50/75/100) y si aplica a la 1ª visita o a todas.
--   3. Cliente final agenda en book.vylta.lat -> se RESERVA el horario 10 min
--      (booking_holds) mientras paga.
--   4. Stripe confirma el pago -> se crea la cita y sale el WhatsApp de siempre.
--   5. Si no paga en 10 min, el hold expira y el horario se libera solo.
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. Configuración del negocio ────────────────────────────────────
ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS prepay_enabled          BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS prepay_percent          INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS prepay_scope            TEXT    DEFAULT 'all',   -- 'first' | 'all'
  ADD COLUMN IF NOT EXISTS stripe_connect_id       TEXT,                     -- acct_...
  ADD COLUMN IF NOT EXISTS stripe_connect_status   TEXT    DEFAULT 'none',   -- none|pending|active|restricted
  ADD COLUMN IF NOT EXISTS prepay_refund_policy    TEXT;                     -- texto libre que ve el cliente

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bp_prepay_percent_chk') THEN
    ALTER TABLE business_profiles ADD CONSTRAINT bp_prepay_percent_chk
      CHECK (prepay_percent IN (25, 50, 75, 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bp_prepay_scope_chk') THEN
    ALTER TABLE business_profiles ADD CONSTRAINT bp_prepay_scope_chk
      CHECK (prepay_scope IN ('first', 'all'));
  END IF;
END $$;

-- ─── 2. Reserva temporal del horario mientras el cliente paga ────────
CREATE TABLE IF NOT EXISTS public.booking_holds (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_link_id    UUID,
  date               TEXT NOT NULL,          -- mismo formato que appointments.date
  start_time         TEXT NOT NULL,
  end_time           TEXT NOT NULL,
  staff_id           UUID,
  client_name        TEXT NOT NULL,
  client_phone       TEXT NOT NULL,
  payload            JSONB NOT NULL,         -- datos completos para crear la cita al confirmar
  amount_total       INTEGER NOT NULL,       -- centavos: costo total del servicio
  amount_prepay      INTEGER NOT NULL,       -- centavos: lo que se cobra por anticipado
  platform_fee       INTEGER NOT NULL DEFAULT 0,
  payment_intent_id  TEXT,
  status             TEXT NOT NULL DEFAULT 'pending',  -- pending|paid|expired|cancelled
  expires_at         TIMESTAMPTZ NOT NULL,
  appointment_id     UUID REFERENCES appointments(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holds_slot   ON public.booking_holds (user_id, date, start_time) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_holds_pi     ON public.booking_holds (payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_holds_expiry ON public.booking_holds (expires_at) WHERE status = 'pending';

ALTER TABLE public.booking_holds ENABLE ROW LEVEL SECURITY;
-- Solo el dueño ve sus holds. El cliente final NUNCA lee esta tabla directo:
-- todo pasa por edge functions con service role.
DROP POLICY IF EXISTS "holds_own" ON public.booking_holds;
CREATE POLICY "holds_own" ON public.booking_holds
  FOR SELECT USING (auth.uid() = user_id);

-- ─── 3. Historial de anticipos cobrados ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.prepayments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id     UUID REFERENCES appointments(id) ON DELETE SET NULL,
  client_name        TEXT,
  client_phone       TEXT,
  amount_total       INTEGER NOT NULL,   -- centavos
  amount_prepay      INTEGER NOT NULL,   -- centavos cobrados
  platform_fee       INTEGER NOT NULL DEFAULT 0,
  currency           TEXT NOT NULL DEFAULT 'mxn',
  payment_intent_id  TEXT UNIQUE,
  receipt_url        TEXT,
  status             TEXT NOT NULL DEFAULT 'succeeded', -- succeeded|refunded|failed
  refunded_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prepayments_user ON public.prepayments (user_id, created_at DESC);

ALTER TABLE public.prepayments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prepayments_own" ON public.prepayments;
CREATE POLICY "prepayments_own" ON public.prepayments
  FOR SELECT USING (auth.uid() = user_id);

-- ─── 4. Limpieza de holds vencidos ───────────────────────────────────
-- Un horario nunca queda bloqueado si el cliente abandona el pago.
CREATE OR REPLACE FUNCTION public.expire_booking_holds()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n INTEGER;
BEGIN
  UPDATE booking_holds
     SET status = 'expired'
   WHERE status = 'pending' AND expires_at < NOW();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ─── 5. Config pública de anticipo (la lee el link de reservas) ──────
-- Expone SOLO lo necesario para pintar el aviso de pago; nunca datos bancarios.
CREATE OR REPLACE FUNCTION public.get_prepay_config_public(p_user_id UUID)
RETURNS TABLE (
  enabled        BOOLEAN,
  percent        INTEGER,
  scope          TEXT,
  refund_policy  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(bp.prepay_enabled, false)
      AND COALESCE(bp.stripe_connect_status, 'none') = 'active',   -- sin Stripe listo, no se cobra
    COALESCE(bp.prepay_percent, 50),
    COALESCE(bp.prepay_scope, 'all'),
    bp.prepay_refund_policy
  FROM business_profiles bp
  WHERE bp.user_id = p_user_id
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_prepay_config_public(UUID) TO anon, authenticated;

-- ─── 6. ¿Es la primera visita de este teléfono? (para scope='first') ──
CREATE OR REPLACE FUNCTION public.is_first_visit_public(p_user_id UUID, p_phone TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_phone TEXT := public.normalize_phone(p_phone);
  v_count INTEGER := 0;
BEGIN
  IF v_phone IS NULL THEN RETURN true; END IF;
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM appointments a
  JOIN clients c ON c.id = a.client_id
  WHERE a.user_id = p_user_id
    AND public.normalize_phone(c.phone) = v_phone
    AND a.status NOT IN ('Cancelada', 'Rechazada');
  RETURN v_count = 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_first_visit_public(UUID, TEXT) TO anon, authenticated;
