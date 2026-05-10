-- ════════════════════════════════════════════════════════════════════════
-- VYLTA — Migration: rate_limit_attempts
--
-- Tabla para rate limiting de endpoints públicos (especialmente
-- create-booking-request, que cualquiera puede llamar desde internet
-- sin autenticación).
--
-- Diseño:
--   - `key`: identificador de la ventana (ej. "ip:1.2.3.4:minute:2026-05-10T20:30")
--   - `count`: número de intentos en esa ventana
--   - `window_start`: timestamp del inicio de la ventana (para cleanup)
--
-- Patrón de uso:
--   INSERT INTO rate_limit_attempts (key, count, window_start)
--   VALUES ('ip:1.2.3.4:minute:2026-05-10T20:30', 1, '2026-05-10T20:30:00Z')
--   ON CONFLICT (key) DO UPDATE SET count = rate_limit_attempts.count + 1
--   RETURNING count;
--
-- Si count > límite → rechazar request con HTTP 429.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.rate_limit_attempts (
  key           TEXT PRIMARY KEY,
  count         INTEGER NOT NULL DEFAULT 1,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para cleanup eficiente de rows viejos
CREATE INDEX IF NOT EXISTS idx_rate_limit_window_start
  ON public.rate_limit_attempts (window_start);

-- ════════════════════════════════════════════════════════════════════════
-- RLS: nadie debe poder ver ni manipular esta tabla desde el cliente.
-- Solo el service_role (Edge Functions) tiene acceso.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.rate_limit_attempts ENABLE ROW LEVEL SECURITY;

-- No creamos ninguna policy: con RLS habilitado y sin policies,
-- ningún user autenticado puede leer/escribir. Service role bypassa RLS
-- automáticamente, así que las Edge Functions sí pueden operar.

-- ════════════════════════════════════════════════════════════════════════
-- Función de cleanup: elimina rows con ventanas > 24h
-- Se debe llamar periódicamente (manualmente o vía pg_cron).
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_attempts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.rate_limit_attempts
  WHERE window_start < NOW() - INTERVAL '24 hours';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Permitir que service_role la ejecute
REVOKE ALL ON FUNCTION public.cleanup_rate_limit_attempts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_attempts() TO service_role;

-- ════════════════════════════════════════════════════════════════════════
-- NOTAS:
--
-- 1. Si tienes pg_cron habilitado, puedes agendar el cleanup automático:
--    SELECT cron.schedule(
--      'cleanup-rate-limit',
--      '0 3 * * *',  -- diario a las 3am
--      $$ SELECT public.cleanup_rate_limit_attempts(); $$
--    );
--
-- 2. Si no tienes pg_cron, llama la función manualmente cada cierto tiempo
--    o crea un workflow de n8n que lo haga cada 6h.
--
-- 3. El tamaño de la tabla con tráfico normal de VYLTA debería ser pequeño
--    (<10K rows en cualquier momento), así que el cleanup es defensa contra
--    crecimiento descontrolado en caso de ataque.
-- ════════════════════════════════════════════════════════════════════════
