import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { staffMemberId, email, password, organizationUserId } = await req.json()

    if (!staffMemberId || !email || !password || !organizationUserId) {
      return json({ error: 'Faltan campos requeridos' }, 400)
    }

    if (password.length < 8) {
      return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

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
