-- ============================================================
-- VYLTA: Cuentas de Colaborador
-- Ejecuta este script en el SQL Editor de Supabase
-- ============================================================

-- Tabla que vincula un staff_member con una cuenta de usuario real (Auth)
CREATE TABLE IF NOT EXISTS staff_accounts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_member_id      uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_user_id uuid NOT NULL,  -- user_id del dueño del negocio
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(staff_member_id),
  UNIQUE(user_id)
);

ALTER TABLE staff_accounts ENABLE ROW LEVEL SECURITY;

-- Dueño puede ver los accesos de sus colaboradores
CREATE POLICY "owner_select_staff_accounts"
  ON staff_accounts FOR SELECT
  USING (organization_user_id = auth.uid());

-- Dueño puede crear accesos
CREATE POLICY "owner_insert_staff_accounts"
  ON staff_accounts FOR INSERT
  WITH CHECK (organization_user_id = auth.uid());

-- Dueño puede revocar accesos
CREATE POLICY "owner_delete_staff_accounts"
  ON staff_accounts FOR DELETE
  USING (organization_user_id = auth.uid());

-- El colaborador puede ver su propio registro
CREATE POLICY "staff_select_own_account"
  ON staff_accounts FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================
-- RLS adicionales: colaboradores pueden leer datos del negocio
-- ============================================================

-- Citas: leer
CREATE POLICY "staff_select_appointments"
  ON appointments FOR SELECT
  USING (
    user_id IN (
      SELECT organization_user_id FROM staff_accounts WHERE user_id = auth.uid()
    )
  );

-- Citas: insertar (staff crea citas a nombre del negocio)
CREATE POLICY "staff_insert_appointments"
  ON appointments FOR INSERT
  WITH CHECK (
    user_id IN (
      SELECT organization_user_id FROM staff_accounts WHERE user_id = auth.uid()
    )
  );

-- Citas: actualizar estado y notas (no puede eliminar)
CREATE POLICY "staff_update_appointments"
  ON appointments FOR UPDATE
  USING (
    user_id IN (
      SELECT organization_user_id FROM staff_accounts WHERE user_id = auth.uid()
    )
  );

-- Clientes: leer
CREATE POLICY "staff_select_clients"
  ON clients FOR SELECT
  USING (
    user_id IN (
      SELECT organization_user_id FROM staff_accounts WHERE user_id = auth.uid()
    )
  );

-- Clientes: insertar nuevos
CREATE POLICY "staff_insert_clients"
  ON clients FOR INSERT
  WITH CHECK (
    user_id IN (
      SELECT organization_user_id FROM staff_accounts WHERE user_id = auth.uid()
    )
  );

-- Servicios: leer catálogo del negocio
CREATE POLICY "staff_select_services"
  ON services FOR SELECT
  USING (
    user_id IN (
      SELECT organization_user_id FROM staff_accounts WHERE user_id = auth.uid()
    )
  );

-- Colaboradores: leer equipo del negocio
CREATE POLICY "staff_select_staff_members"
  ON staff_members FOR SELECT
  USING (
    user_id IN (
      SELECT organization_user_id FROM staff_accounts WHERE user_id = auth.uid()
    )
  );

-- Perfil del negocio: leer
CREATE POLICY "staff_select_business_profile"
  ON business_profiles FOR SELECT
  USING (
    user_id IN (
      SELECT organization_user_id FROM staff_accounts WHERE user_id = auth.uid()
    )
  );
