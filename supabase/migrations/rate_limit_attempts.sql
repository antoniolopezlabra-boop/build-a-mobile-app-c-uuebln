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
-- Patrón de uso desde Edge Function:
--   SELECT increment_rate_limit('ip:1.2.3.4:minute:2026-05-10T20:30',
--                               '2026-05-10T20:30:00Z');
--   -> devuelve el count actualizado (1, 2, 3, ...)
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
-- RPC: increment_rate_limit
--
-- Hace UPSERT atómico: si la key no existe la crea con count=1;
-- si existe, incrementa count en 1. Devuelve el count resultante.
--
-- Es atómico porque PostgreSQL bloquea la row durante el INSERT ON CONFLICT.
-- Esto evita race conditions cuando llegan múltiples requests al mismo tiempo.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_key TEXT,
  p_window_start TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  INSERT INTO public.rate_limit_attempts (key, count, window_start)
  VALUES (p_key, 1, p_window_start)
  ON CONFLICT (key) DO UPDATE
    SET count = public.rate_limit_attempts.count + 1
  RETURNING count INTO new_count;

  RETURN new_count;
END;
$$;

-- Permitir solo a service_role ejecutarla (Edge Functions)
REVOKE ALL ON FUNCTION public.increment_rate_limit(TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(TEXT, TIMESTAMPTZ) TO service_role;

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
-- NOTAS OPERATIVAS:
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
--
-- 4. Para test manual desde SQL:
--    SELECT increment_rate_limit('test:foo', NOW());  -- devuelve 1
--    SELECT increment_rate_limit('test:foo', NOW());  -- devuelve 2
--    SELECT increment_rate_limit('test:foo', NOW());  -- devuelve 3
-- ════════════════════════════════════════════════════════════════════════
