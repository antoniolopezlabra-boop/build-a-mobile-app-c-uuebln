-- ═══════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Tabla vendor_payments para calendario de pagos a proveedores
--
-- FECHA:    22 de mayo de 2026
-- AUTOR:    Antonio López Labra
-- MOTIVO:   El Control Center admin requiere un calendario de pagos
--           próximos a proveedores (Supabase, Vercel, 360dialog, n8n,
--           Resend, Stripe fees, etc) para tener visibilidad financiera
--           total desde un solo lugar.
--
-- ⚡ FIX (May 22 2026 - 2da versión):
--   Corregido nombre de tabla admin: `admin_users` → `vylta_admins`
--   (es el nombre real en este proyecto, validado en lib/admin-server.ts)
--
-- ESTRUCTURA:
--   • id           UUID PK
--   • vendor_name  TEXT NOT NULL
--   • category     TEXT NOT NULL CHECK (infraestructura, comunicaciones, etc)
--   • amount_mxn   NUMERIC(10,2) NOT NULL
--   • currency     TEXT NOT NULL DEFAULT 'MXN'
--   • due_date     DATE NOT NULL
--   • status       TEXT ('pending'|'paid'|'overdue'|'cancelled')
--   • frequency    TEXT ('one-time'|'monthly'|'quarterly'|'annual')
--   • notes, paid_at, created_at, updated_at
--
-- RLS:
--   Solo administradores activos (vylta_admins.is_active=true) pueden
--   ver, insertar, actualizar y borrar registros.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.vendor_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_name  TEXT NOT NULL,
  category     TEXT NOT NULL CHECK (category IN (
    'infraestructura',     -- Supabase, Vercel, Cloudflare
    'comunicaciones',      -- 360dialog, Twilio, Resend
    'automatizacion',      -- n8n, Zapier
    'pagos',               -- Stripe fees
    'desarrollo',          -- GitHub, dominio, expo
    'marketing',           -- ads, herramientas
    'legal',               -- contadora, abogados, IMPI
    'otro'
  )),
  amount_mxn   NUMERIC(10,2) NOT NULL CHECK (amount_mxn >= 0),
  currency     TEXT NOT NULL DEFAULT 'MXN' CHECK (currency IN ('MXN', 'USD', 'EUR')),
  due_date     DATE NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'paid', 'overdue', 'cancelled'
  )),
  frequency    TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN (
    'one-time', 'monthly', 'quarterly', 'annual'
  )),
  notes        TEXT,
  paid_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Índices para queries del Control Center ───
CREATE INDEX IF NOT EXISTS idx_vendor_payments_due_date
  ON public.vendor_payments (due_date)
  WHERE status IN ('pending', 'overdue');

CREATE INDEX IF NOT EXISTS idx_vendor_payments_status
  ON public.vendor_payments (status);

CREATE INDEX IF NOT EXISTS idx_vendor_payments_category
  ON public.vendor_payments (category);

-- ─── Trigger para updated_at automático ───
CREATE OR REPLACE FUNCTION public.set_vendor_payments_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendor_payments_updated_at ON public.vendor_payments;
CREATE TRIGGER trg_vendor_payments_updated_at
  BEFORE UPDATE ON public.vendor_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_vendor_payments_updated_at();

-- ─── RLS: solo admins (tabla vylta_admins) ───
ALTER TABLE public.vendor_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendor_payments_admin_all" ON public.vendor_payments;
CREATE POLICY "vendor_payments_admin_all" ON public.vendor_payments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.vylta_admins
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- ─── Comentarios de documentación ───
COMMENT ON TABLE public.vendor_payments IS
  'Calendario de pagos a proveedores. Solo visible para admins (vylta_admins). Usado por el Control Center para mostrar próximos pagos, reportes de gastos y cashflow.';

COMMENT ON COLUMN public.vendor_payments.frequency IS
  'one-time = pago único; monthly = mensual recurrente; quarterly = trimestral; annual = anual';

-- ─── Función helper: marcar pagos vencidos automáticamente ───
CREATE OR REPLACE FUNCTION public.mark_overdue_vendor_payments()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.vendor_payments
  SET status = 'overdue'
  WHERE status = 'pending' AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.mark_overdue_vendor_payments() IS
  'Marca pagos pendientes vencidos como overdue. Idempotente. Ejecutar diariamente via cron.';

-- ─── Datos iniciales: proveedores conocidos de VYLTA ───
INSERT INTO public.vendor_payments (vendor_name, category, amount_mxn, currency, due_date, status, frequency, notes)
VALUES
  ('Supabase Pro',     'infraestructura', 500.00,  'MXN', DATE_TRUNC('month', NOW())::DATE + INTERVAL '1 month', 'pending', 'monthly', 'Plan Pro de Supabase para producción'),
  ('Vercel Pro',       'infraestructura', 400.00,  'MXN', DATE_TRUNC('month', NOW())::DATE + INTERVAL '1 month', 'pending', 'monthly', 'Hosting del CRM Web y landing'),
  ('360dialog',        'comunicaciones',  980.00,  'MXN', DATE_TRUNC('month', NOW())::DATE + INTERVAL '1 month', 'pending', 'monthly', 'WhatsApp Business API (€49/mes ≈ 980 MXN)'),
  ('n8n Cloud',        'automatizacion',  400.00,  'MXN', DATE_TRUNC('month', NOW())::DATE + INTERVAL '1 month', 'pending', 'monthly', 'Workflows automatizados'),
  ('Resend',           'comunicaciones',  0.00,    'MXN', DATE_TRUNC('month', NOW())::DATE + INTERVAL '1 month', 'pending', 'monthly', 'Email transaccional (free tier por ahora)'),
  ('Cloudflare',       'infraestructura', 0.00,    'MXN', DATE_TRUNC('month', NOW())::DATE + INTERVAL '1 month', 'pending', 'monthly', 'DNS y proxy (free tier)'),
  ('Expo EAS',         'infraestructura', 0.00,    'MXN', DATE_TRUNC('month', NOW())::DATE + INTERVAL '1 month', 'pending', 'monthly', 'Builds Android/iOS (free tier por ahora)'),
  ('Apple Developer',  'desarrollo',      2200.00, 'MXN', (CURRENT_DATE + INTERVAL '11 months'),                  'pending', 'annual',  'Membresía anual Apple Developer Program ($99 USD)'),
  ('Google Play',      'desarrollo',      550.00,  'MXN', (CURRENT_DATE + INTERVAL '1 year'),                     'pending', 'one-time','Tarifa única registro Google Play Console ($25 USD)'),
  ('Dominio vylta.lat','desarrollo',      350.00,  'MXN', (CURRENT_DATE + INTERVAL '11 months'),                  'pending', 'annual',  'Renovación anual dominio .lat')
ON CONFLICT DO NOTHING;
