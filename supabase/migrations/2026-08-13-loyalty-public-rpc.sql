-- ══════════════════════════════════════════════════════════════════════
-- TARJETA DE LEALTAD EN EL LINK PÚBLICO DE RESERVAS (book.vylta.lat)
--
-- El cliente final NO está autenticado (rol anon), así que necesita una
-- función propia. Diseñada con exposición mínima:
--   • Solo responde si el negocio ACTIVÓ las tarjetas de lealtad.
--   • NO devuelve el histórico total ni datos personales — solo el
--     progreso del ciclo actual, lo requerido y el % de recompensa.
--   • Si loyalty está apagado devuelve enabled=false y ceros.
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_loyalty_progress_public(
  p_user_id UUID,
  p_phone   TEXT
)
RETURNS TABLE (
  enabled          BOOLEAN,
  visits_in_cycle  INTEGER,
  visits_required  INTEGER,
  reward_percent   INTEGER,
  is_eligible      BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_phone  TEXT := public.normalize_phone(p_phone);
  v_req    INTEGER;
  v_pct    INTEGER;
  v_on     BOOLEAN;
  v_total  INTEGER := 0;
  v_redeem INTEGER := 0;
  v_cycle  INTEGER := 0;
BEGIN
  SELECT COALESCE(bp.loyalty_enabled, false),
         COALESCE(bp.loyalty_visits_required, 10),
         COALESCE(bp.loyalty_reward_percent, 100)
    INTO v_on, v_req, v_pct
  FROM business_profiles bp
  WHERE bp.user_id = p_user_id
  LIMIT 1;

  v_on  := COALESCE(v_on, false);
  v_req := COALESCE(v_req, 10);
  v_pct := COALESCE(v_pct, 100);

  -- Negocio sin lealtad activa o teléfono inválido → nada que exponer.
  IF NOT v_on OR v_phone IS NULL THEN
    RETURN QUERY SELECT false, 0, v_req, v_pct, false;
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

  v_cycle := GREATEST(0, v_total - (v_redeem * v_req));

  RETURN QUERY SELECT true, v_cycle, v_req, v_pct, (v_cycle >= v_req);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_loyalty_progress_public(UUID, TEXT) TO anon, authenticated;
