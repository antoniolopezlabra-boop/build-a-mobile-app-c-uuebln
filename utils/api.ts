import { supabase } from '@/lib/supabase';

// Helper para obtener el user_id actual
export async function getCurrentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');
  return user.id;
}

// GET genérico - mantiene compatibilidad con código existente
export async function apiGet<T>(path: string): Promise<T> {
  const userId = await getCurrentUserId();

  if (path === '/api/business-profile') {
    const { data, error } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error) throw error;
    return {
      id: data.id,
      userId: data.user_id,
      businessName: data.business_name,
      businessType: data.business_type,
      address: data.address,
      phone: data.phone,
      alternativePhone: data.alternative_phone,
      logoUrl: data.logo_url,
      weeklySchedule: data.weekly_schedule,
    } as T;
  }

  if (path === '/api/clients') {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return (data?.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      birthday: c.birthday,
      notes: c.notes,
      isActive: c.is_active,
      lastVisit: c.last_visit,
      totalVisits: c.total_visits,
    })) || []) as T;
  }

  if (path === '/api/appointments') {
    const { data, error } = await supabase
      .from('appointments')
      .select('*, client:clients(name, phone)')
      .eq('user_id', userId)
      .order('start_time');
    if (error) throw error;
    return (data?.map(a => ({
      id: a.id,
      clientId: a.client_id,
      service: a.service_name,
      date: a.date,
      time: a.start_time,
      startTime: a.start_time,
      endTime: a.end_time,
      status: a.status,
      notes: a.notes,
      client: a.client,
    })) || []) as T;
  }

  if (path === '/api/appointments/today') {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('appointments')
      .select('*, client:clients(name, phone)')
      .eq('user_id', userId)
      .eq('date', today)
      .order('start_time');
    if (error) throw error;
    return (data?.map(a => ({
      id: a.id,
      clientId: a.client_id,
      service: a.service_name,
      date: a.date,
      time: a.start_time,
      status: a.status,
      notes: a.notes,
      client: a.client,
    })) || []) as T;
  }

  if (path === '/api/stats/dashboard') {
    const today = new Date().toISOString().split('T')[0];
    const { data: todayApts } = await supabase
      .from('appointments')
      .select('status')
      .eq('user_id', userId)
      .eq('date', today);
    const { count: totalClients } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    const { count: totalAppointments } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    return {
      todayAppointments: todayApts?.length || 0,
      confirmedToday: todayApts?.filter(a => a.status === 'Confirmada').length || 0,
      unconfirmedToday: todayApts?.filter(a => a.status === 'Pendiente').length || 0,
      totalClients: totalClients || 0,
      totalAppointments: totalAppointments || 0,
    } as T;
  }

  if (path === "/api/business-hours") {
    const { data, error } = await supabase
      .from("business_hours")
      .select("*")
      .eq("user_id", userId)
      .order("day_of_week");
    if (error) throw error;
    return (data || []) as T;
  }

  if (path.startsWith("/api/clients/inactive")) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', userId)
      .lt('last_visit', ninetyDaysAgo.toISOString().split('T')[0]);
    if (error) throw error;
    return (data || []) as T;
  }

  // GET por ID de appointment
  if (path.startsWith('/api/appointments/')) {
    const id = path.split('/').pop();
    const { data, error } = await supabase
      .from('appointments')
      .select('*, client:clients(*)')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    if (error) throw error;
    return { ...data, service: data.service_name, time: data.start_time } as T;
  }

  // GET por ID de client
  if (path.startsWith('/api/clients/')) {
    const id = path.split('/').pop();
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    if (error) throw error;
    return data as T;
  }

  throw new Error(`Unknown API path: ${path}`);
}

// POST genérico
export async function apiPost<T>(path: string, body: any): Promise<T> {
  const userId = await getCurrentUserId();

  if (path === '/api/appointments') {
    const startTime = body.time;
    const [h, m] = startTime.split(':').map(Number);
    const endMinutes = h * 60 + m + 30;
    const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('appointments')
      .insert({
        user_id: userId,
        client_id: body.clientId,
        service_name: body.service,
        date: body.date,
        start_time: startTime,
        end_time: endTime,
        status: 'Pendiente',
        notes: body.notes || null,
        whatsapp_notification: body.sendWhatsApp || false,
      })
      .select()
      .single();
    if (error) throw error;
    return { ...data, service: data.service_name, time: data.start_time } as T;
  }

  if (path === '/api/clients') {
    const { data, error } = await supabase
      .from('clients')
      .insert({ user_id: userId, ...body })
      .select()
      .single();
    if (error) throw error;
    return data as T;
  }

  throw new Error(`Unknown API path: ${path}`);
}

// PATCH genérico
export async function apiPatch<T>(path: string, body: any): Promise<T> {
  const userId = await getCurrentUserId();

  if (path.includes('/status')) {
    const id = path.split('/')[3];
    const { data, error } = await supabase
      .from('appointments')
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return data as T;
  }

  if (path.includes('/reschedule')) {
    const id = path.split('/')[3];
    const { data, error } = await supabase
      .from('appointments')
      .update({ date: body.date, start_time: body.time, status: 'Reagendada', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return data as T;
  }

  if (path.startsWith('/api/clients/')) {
    const id = path.split('/').pop();
    const { data, error } = await supabase
      .from('clients')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return data as T;
  }

  if (path === '/api/business-profile') {
    const { data, error } = await supabase
      .from('business_profiles')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return data as T;
  }

  throw new Error(`Unknown API path: ${path}`);
}

// DELETE genérico
export async function apiDelete<T>(path: string): Promise<T> {
  const userId = await getCurrentUserId();

  if (path.startsWith('/api/appointments/')) {
    const id = path.split('/').pop();
    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
    return { success: true } as T;
  }

  if (path.startsWith('/api/clients/')) {
    const id = path.split('/').pop();
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
    return { success: true } as T;
  }

  throw new Error(`Unknown API path: ${path}`);
}

// Mantener compatibilidad con código que usa getBearerToken
export async function getBearerToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

export const BACKEND_URL = 'https://nhjmwmkaduiaifgztymi.supabase.co';

// PUT genérico
export async function apiPut<T>(path: string, body: any): Promise<T> {
  const userId = await getCurrentUserId();

  if (path.startsWith('/api/business-hours/')) {
    const dayOfWeek = parseInt(path.split('/').pop() || '0');
    
    const { data: existing } = await supabase
      .from('business_hours')
      .select('id')
      .eq('user_id', userId)
      .eq('day_of_week', dayOfWeek)
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from('business_hours')
        .update({
          start_time: body.startTime,
          end_time: body.endTime,
          is_open: body.isOpen,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('day_of_week', dayOfWeek)
        .select()
        .single();
      if (error) throw error;
      return data as T;
    } else {
      const { data, error } = await supabase
        .from('business_hours')
        .insert({
          user_id: userId,
          day_of_week: dayOfWeek,
          start_time: body.startTime,
          end_time: body.endTime,
          is_open: body.isOpen,
        })
        .select()
        .single();
      if (error) throw error;
      return data as T;
    }
  }

  throw new Error(`Unknown API path: ${path}`);
}
