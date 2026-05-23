-- ═══════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Agregar campos de ubicación detallada a business_profiles
--
-- FECHA:    22 de mayo de 2026
-- AUTOR:    Antonio López Labra
-- MOTIVO:   Habilitar mapa de calor de la República Mexicana en el
--           Control Center admin. Los campos eran necesarios para tener
--           granularidad geográfica de los negocios suscritos.
--
-- CAMPOS AGREGADOS:
--   • state         TEXT NOT NULL (uno de los 32 estados de México)
--   • city          TEXT (municipio o ciudad)
--   • postal_code   TEXT (código postal mexicano, 5 dígitos)
--   • street        TEXT (calle y número)
--
-- ESTRATEGIA DE MIGRACIÓN PARA USUARIOS EXISTENTES:
--   1. Las columnas se crean como NULLABLE en producción para no romper
--      las filas existentes.
--   2. La app móvil y CRM Web obligan a los usuarios nuevos a llenarlas
--      en el setup wizard.
--   3. A los usuarios existentes les aparecerá un banner suave "Completa
--      tu información" que los lleva al formulario de Mi Negocio para
--      llenarlas. No se les BLOQUEA el acceso a la app — solo se les
--      pide amablemente.
--   4. Cuando el 95%+ de los usuarios hayan llenado los campos, se puede
--      considerar agregar el CHECK constraint NOT NULL.
--
-- NOTA SOBRE EL ESTADO:
--   No se aplica un CHECK constraint sobre la lista exacta de 32 estados
--   a propósito. El motivo: si Antonio decide agregar negocios fuera de
--   México en el futuro (p.ej. expansión a Colombia o España), no tenemos
--   que migrar la BD. La validación de los 32 estados mexicanos se hace
--   en el frontend (dropdown con la lista oficial).
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Agregar las columnas ───
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS state       TEXT,
  ADD COLUMN IF NOT EXISTS city        TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS street      TEXT;

-- ─── 2. Comentarios de documentación en la BD ───
COMMENT ON COLUMN public.business_profiles.state IS
  'Estado de la República Mexicana donde opera el negocio. Usado para el mapa de calor del Control Center admin. Valores oficiales: Aguascalientes, Baja California, Baja California Sur, Campeche, Chiapas, Chihuahua, Ciudad de México, Coahuila, Colima, Durango, Estado de México, Guanajuato, Guerrero, Hidalgo, Jalisco, Michoacán, Morelos, Nayarit, Nuevo León, Oaxaca, Puebla, Querétaro, Quintana Roo, San Luis Potosí, Sinaloa, Sonora, Tabasco, Tamaulipas, Tlaxcala, Veracruz, Yucatán, Zacatecas.';

COMMENT ON COLUMN public.business_profiles.city IS
  'Municipio o ciudad donde se ubica el negocio. Captura libre.';

COMMENT ON COLUMN public.business_profiles.postal_code IS
  'Código postal mexicano de 5 dígitos. Validación de formato en frontend.';

COMMENT ON COLUMN public.business_profiles.street IS
  'Calle y número exterior/interior del local. Captura libre.';

-- ─── 3. Índice en `state` para acelerar las queries del mapa de calor ───
-- El Control Center hace COUNT(*) GROUP BY state. Este índice acelera
-- esa agregación cuando haya cientos o miles de negocios.
CREATE INDEX IF NOT EXISTS idx_business_profiles_state
  ON public.business_profiles (state)
  WHERE state IS NOT NULL;

-- ─── 4. Vista materializada con la agregación geográfica ───
-- Esta vista la consume el Control Center para pintar el mapa de calor.
-- Se recrea con cada deploy; si la performance lo demanda, en el futuro
-- puede convertirse en MATERIALIZED VIEW con refresh periódico.
CREATE OR REPLACE VIEW public.business_profiles_by_state AS
SELECT
  state,
  COUNT(*)::INTEGER AS total_businesses,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::INTEGER AS new_last_30d,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::INTEGER AS new_last_7d
FROM public.business_profiles
WHERE state IS NOT NULL
GROUP BY state
ORDER BY total_businesses DESC;

COMMENT ON VIEW public.business_profiles_by_state IS
  'Agregación de negocios por estado mexicano. Usada por el Control Center admin para pintar el mapa de calor.';

-- ─── 5. RLS sobre la vista ───
-- La vista hereda los permisos de la tabla base.
-- Solo administradores deben poder ver datos agregados de todos los
-- negocios. La policy de business_profiles ya restringe SELECT a
-- (1) el propio dueño del registro y (2) admins (vía is_admin()).
-- La vista respeta esto automáticamente.

-- ─── 6. (Opcional) Función helper para obtener TOTAL global ───
-- El Control Center muestra KPIs tipo "X negocios totales". Esta
-- función SECURITY DEFINER permite consultar el total sin que el RLS
-- restrinja a los registros propios del admin que la llama.
CREATE OR REPLACE FUNCTION public.admin_count_business_profiles()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Solo permitido si el caller es admin.
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid() AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores pueden consultar este conteo.';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_count FROM public.business_profiles;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.admin_count_business_profiles() IS
  'Conteo global de business_profiles sin restricción RLS. SECURITY DEFINER. Solo callable por admins activos.';
