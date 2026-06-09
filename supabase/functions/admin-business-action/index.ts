import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsForWeb, handleCorsPreflightRequest } from '../_shared/cors.ts'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// ══════════════════════════════════
// admin-business-action — Bloquear / desbloquear / eliminar un negocio.
//
//   Solo lo puede invocar un admin activo (vylta_admins.is_active) via su JWT.
//   Acciones:
//     block   → banea la cuenta en Auth (no puede iniciar sesión) + marca bloqueado=true
//     unblock → quita el ban + bloqueado=false
//     delete  → borra TODAS las filas del usuario en las tablas del negocio
//               (no hay FKs a auth.users, así que se limpia explícitamente)
//               y al final elimina su cuenta de Auth.
//
//   Guardas: no se puede actuar sobre uno mismo ni sobre otro admin activo.
//   Se llama desde el CRM Web (app.vylta.lat) -> corsForWeb.
// ══════════════════════════════════

// Tablas con columna user_id propiedad del dueño del negocio.
const USER_ID_TABLES = [
  'appointments', 'clients', 'services', 'business_hours', 'time_blocks', 'booking_blocks',
  'booking_links', 'whatsapp_config', 'subscription_plans', 'notification_tokens',
  'email_campaigns', 'birthday_email_log', 'promo_code_redemptions', 'user_sessions',
  'export_logs', 'ai_chat_usage', 'staff_members', 'staff_accounts', 'public_business_profiles',
]
// Tablas con columna business_user_id.
const BUSINESS_USER_ID_TABLES = ['comisiones', 'pagos']
const PERMANENT_BAN = '876600h' // ~100 años

serve(async (req) => {
  const corsHeaders = corsForWeb(req)
  const preflight = handleCorsPreflightRequest(req, corsHeaders)
  if (preflight) return preflight

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // 1. Verificar admin activo via el JWT del caller.
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '').trim()
    if (!token) return json({ success: false, error: 'No autorizado' })

    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData?.user) return json({ success: false, error: 'No autorizado' })
    const callerId = userData.user.id

    const { data: adminRow } = await admin
      .from('vylta_admins').select('id').eq('user_id', callerId).eq('is_active', true).maybeSingle()
    if (!adminRow) return json({ success: false, error: 'Se requiere una cuenta de administrador.' })

    // 2. Input.
    const { action, userId } = await req.json()
    if (!action || !userId) return json({ success: false, error: 'Faltan parámetros (action, userId).' })
    if (!['block', 'unblock', 'delete'].includes(action)) return json({ success: false, error: 'Acción inválida.' })

    // 3. Guardas de seguridad.
    if (userId === callerId) return json({ success: false, error: 'No puedes bloquear ni eliminar tu propia cuenta.' })
    const { data: targetAdmin } = await admin
      .from('vylta_admins').select('id').eq('user_id', userId).eq('is_active', true).maybeSingle()
    if (targetAdmin) return json({ success: false, error: 'Ese usuario es administrador; no puede bloquearse ni eliminarse desde aquí.' })

    const { data: bp } = await admin
      .from('business_profiles').select('business_name').eq('user_id', userId).maybeSingle()
    const nombre = bp?.business_name ?? 'el negocio'

    // 4a. Bloquear / desbloquear.
    if (action === 'block' || action === 'unblock') {
      const ban_duration = action === 'block' ? PERMANENT_BAN : 'none'
      const { error: banErr } = await admin.auth.admin.updateUserById(userId, { ban_duration })
      if (banErr) return json({ success: false, error: banErr.message })
      await admin.from('business_profiles').update({ bloqueado: action === 'block' }).eq('user_id', userId)
      return json({ success: true, action, nombre })
    }

    // 4b. Eliminar por completo.
    // Desvincular embajador (si lo fuera) para conservar el historial de comisiones.
    await admin.from('embajadores').update({ user_id: null }).eq('user_id', userId)

    const warnings: string[] = []
    for (const t of USER_ID_TABLES) {
      const { error } = await admin.from(t).delete().eq('user_id', userId)
      if (error) { console.error(`[admin-business-action] delete ${t}:`, error.message); warnings.push(t) }
    }
    for (const t of BUSINESS_USER_ID_TABLES) {
      const { error } = await admin.from(t).delete().eq('business_user_id', userId)
      if (error) { console.error(`[admin-business-action] delete ${t}:`, error.message); warnings.push(t) }
    }
    {
      const { error } = await admin.from('business_profiles').delete().eq('user_id', userId)
      if (error) { console.error('[admin-business-action] delete business_profiles:', error.message); warnings.push('business_profiles') }
    }

    const { error: authDelErr } = await admin.auth.admin.deleteUser(userId)
    if (authDelErr) {
      console.error('[admin-business-action] auth delete:', authDelErr.message)
      return json({ success: true, action, nombre, warning: `Los datos se eliminaron, pero la cuenta de acceso no pudo borrarse: ${authDelErr.message}` })
    }

    return json({ success: true, action, nombre, warnings: warnings.length ? warnings : undefined })
  } catch (e: any) {
    return json({ success: false, error: e?.message ?? 'Error interno del servidor' }, 500)
  }
})
