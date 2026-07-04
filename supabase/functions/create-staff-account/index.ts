import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsForApp, handleCorsPreflightRequest } from '../_shared/cors.ts'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

serve(async (req) => {
  // CORS: esta función solo se llama desde la app móvil (admin del negocio).
  const corsHeaders = corsForApp(req)
  const preflight = handleCorsPreflightRequest(req, corsHeaders)
  if (preflight) return preflight

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { staffMemberId, email, password, organizationUserId } = await req.json()

    if (!staffMemberId || !email || !password || !organizationUserId) {
      return json({ error: 'Faltan campos requeridos' }, 400)
    }

    if (password.length < 8) {
      return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // ⚡ FIX SEGURIDAD (jul 2026): derivar la identidad del JWT y exigir que quien
    // llama sea el DUEÑO de la organización. Antes se confiaba en organizationUserId
    // del body → IDOR: crear una cuenta de colaborador en la organización de otro
    // negocio y leer sus citas/clientes (cross-tenant).
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace('Bearer ', '').trim()
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(jwt)
    if (authError || !caller) {
      return json({ error: 'No autorizado' }, 401)
    }
    if (caller.id !== organizationUserId) {
      return json({ error: 'No autorizado para esta organización' }, 403)
    }

    // Verificar que el staff_member pertenece a la organización
    const { data: staffMember } = await supabase
      .from('staff_members')
      .select('id, name')
      .eq('id', staffMemberId)
      .eq('user_id', organizationUserId)
      .single()

    if (!staffMember) {
      return json({ error: 'Colaborador no encontrado en esta organización' }, 404)
    }

    // Verificar que no ya existe cuenta para este colaborador
    const { data: existing } = await supabase
      .from('staff_accounts')
      .select('id')
      .eq('staff_member_id', staffMemberId)
      .single()

    if (existing) {
      return json({ error: 'Este colaborador ya tiene una cuenta de acceso' }, 409)
    }

    // Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: staffMember.name,
        is_staff_account: true,
      },
    })

    if (authError) {
      const alreadyExists =
        authError.message.toLowerCase().includes('already been registered') ||
        authError.message.toLowerCase().includes('already exists') ||
        authError.message.toLowerCase().includes('email address')
      if (alreadyExists) {
        return json({ error: 'Este correo ya está registrado en otra cuenta' }, 409)
      }
      return json({ error: authError.message }, 400)
    }

    const newUserId = authData.user.id

    // Vincular en staff_accounts
    const { error: insertError } = await supabase
      .from('staff_accounts')
      .insert({
        staff_member_id: staffMemberId,
        user_id: newUserId,
        organization_user_id: organizationUserId,
      })

    if (insertError) {
      // Rollback: eliminar el usuario de auth que se acaba de crear
      await supabase.auth.admin.deleteUser(newUserId)
      return json({ error: insertError.message }, 400)
    }

    return json({ success: true, userId: newUserId })
  } catch (e: any) {
    return json({ error: e?.message ?? 'Error interno del servidor' }, 500)
  }
})
