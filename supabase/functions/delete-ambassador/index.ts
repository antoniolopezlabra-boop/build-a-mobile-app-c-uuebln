import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsForWeb, handleCorsPreflightRequest } from '../_shared/cors.ts'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// ═════════════════════════════════════════════
// delete-ambassador — Elimina un embajador por completo (solo admins).
//
//   1. Verifica que el caller es un admin activo (vylta_admins.is_active)
//      usando su JWT.
//   2. Borra la fila de embajadores: comisiones y cortes caen por CASCADE;
//      business_profiles.referido_por queda en NULL (los clientes referidos
//      conservan su cuenta, solo pierden la atribucion).
//   3. Si el embajador tenia cuenta de acceso (user_id), la borra de Auth.
//
// Se llama desde el CRM Web (app.vylta.lat) -> corsForWeb.
// ══════════════════════════════════════════════

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

    const { data: adminRow } = await admin
      .from('vylta_admins')
      .select('id')
      .eq('user_id', userData.user.id)
      .eq('is_active', true)
      .maybeSingle()
    if (!adminRow) return json({ success: false, error: 'Se requiere una cuenta de administrador.' })

    // 2. Validar input.
    const { embajadorId } = await req.json()
    if (!embajadorId) return json({ success: false, error: 'Falta el id del embajador.' })

    // 3. Buscar el embajador (para su user_id de acceso, si lo tiene).
    const { data: emb, error: embErr } = await admin
      .from('embajadores')
      .select('id, user_id, nombre')
      .eq('id', embajadorId)
      .single()
    if (embErr || !emb) return json({ success: false, error: 'No se encontró el embajador.' })

    // 4. Borrar el registro (cascade -> comisiones, cortes; set null -> referido_por).
    const { error: delErr } = await admin
      .from('embajadores')
      .delete()
      .eq('id', emb.id)
    if (delErr) return json({ success: false, error: delErr.message })

    // 5. Borrar su cuenta de acceso si existe.
    let warning: string | undefined
    if (emb.user_id) {
      const { error: authDelErr } = await admin.auth.admin.deleteUser(emb.user_id)
      if (authDelErr) {
        console.error('[delete-ambassador] Auth deletion failed:', authDelErr.message)
        warning = 'El embajador se eliminó, pero su cuenta de acceso no pudo borrarse.'
      }
    }

    return json({ success: true, nombre: emb.nombre, warning })
  } catch (e: any) {
    return json({ success: false, error: e?.message ?? 'Error interno del servidor' }, 500)
  }
})
