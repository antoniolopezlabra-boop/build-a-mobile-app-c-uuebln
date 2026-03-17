import { getTodayString } from '@/utils/dateUtils';
import { supabase } from '@/lib/supabase';

export async function getCurrentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');
  return user.id;
}

export async function apiGet<T>(path: string): Promise<T> {
  const userId = await getCurrentUserId();

  if (path === '/api/business-profile') {
    const { data, error } = await supabase.from('business_profiles').select('*').eq('user_id', userId).single();
    if (error) throw error;
    return { id: data.id, userId: data.user_id, businessName: data.business_name, businessType: data.business_type, address: data.address, phone: data.phone, alternativePhone: data.alternative_phone, logoUrl: data.logo_url, weeklySchedule: data.weekly_schedule } as T;
  }

  if (path === '/api/clients') {
    const { data, error } = await supabase.from('clients').select('*').eq('user_id', userId).eq('is_active', true).order('name');
    if (error) throw error;
    return (data?.map(c => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, birthday: c.birthday, notes: c.notes, isActive: c.is_active, lastVisit: c.last_visit, totalVisits: c.total_visits })) || []) as T;
  }

  if (path === '/api/services') {
    const { data, error } = await supabase.from('services').select('*').eq('user_id', userId).eq('is_active', true).order('name');
    if (error) throw error;
    return (data?.map(s => ({ id: s.id, name: s.name, description: s.description, price: s.price, durationMinutes: s.duration_minutes, isActive: s.is_active })) || []) as T;
  }

  if (path === '/api/appointments') {
    const { data, error } = await supabase.from('appointments').select('*, client:clients(name, phone)').eq('user_id', userId).order('start_time');
    if (error) throw error;
    return (data?.map(a => ({ id: a.id, clientId: a.client_id, service: a.service_name, date: a.date, time: a.start_time, startTime: a.start_time, endTime: a.end_time, status: a.status, isRescheduled: a.is_rescheduled || false, notes: a.notes, client: a.client })) || []) as T;
  }

  if (path === '/api/appointments/today') {
    const today = getTodayString();
    const { data, error } = await supabase.from('appointments').select('*, client:clients(name, phone)').eq('user_id', userId).eq('date', today).order('start_time');
    if (error) throw error;
    return (data?.map(a => ({ id: a.id, clientId: a.client_id, service: a.service_name, date: a.date, time: a.start_time, status: a.status, isRescheduled: a.is_rescheduled || false, notes: a.notes, client: a.client })) || []) as T;
  }

  if (path === '/api/appointments/week') {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
    const { data, error } = await supabase.from('appointments').select('*, client:clients(name, phone)').eq('user_id', userId).gte('date', tomorrow.toISOString().split('T')[0]).lte('date', weekEnd.toISOString().split('T')[0]).order('date').order('start_time');
    if (error) throw error;
    return (data?.map(a => ({ id: a.id, clientId: a.client_id, service: a.service_name, date: a.date, time: a.start_time, status: a.status, isRescheduled: a.is_rescheduled || false, notes: a.notes, client: a.client })) || []) as T;
  }

  if (path === '/api/stats/dashboard') {
    const today = getTodayString();
    const week = new Date(); week.setDate(week.getDate() + 7);
    const weekEnd = week.toISOString().split('T')[0];
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const [{ data: todayApts }, { data: weekApts }, { count: totalClients }, { count: totalAppointments }] = await Promise.all([
      supabase.from('appointments').select('status').eq('user_id', userId).eq('date', today),
      supabase.from('appointments').select('status').eq('user_id', userId).gte('date', tomorrowStr).lte('date', weekEnd),
      supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    ]);
    return { todayAppointments: todayApts?.length || 0, confirmedToday: todayApts?.filter(a => a.status === 'Confirmada').length || 0, unconfirmedToday: todayApts?.filter(a => a.status === 'Pendiente').length || 0, weekAppointments: weekApts?.length || 0, confirmedWeek: weekApts?.filter(a => a.status === 'Confirmada').length || 0, unconfirmedWeek: weekApts?.filter(a => a.status === 'Pendiente').length || 0, totalClients: totalClients || 0, totalAppointments: totalAppointments || 0 } as T;
  }

  if (path === '/api/business-hours') {
    const { data, error } = await supabase.from('business_hours').select('*').eq('user_id', userId).order('day_of_week');
    if (error) throw error;
    return ((data || []).map((d: any) => ({ id: d.id, dayOfWeek: d.day_of_week, startTime: d.start_time, endTime: d.end_time, isOpen: d.is_open }))) as T;
  }

  if (path.startsWith('/api/clients/inactive')) {
    const ninetyDaysAgo = new Date(); ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const { data, error } = await supabase.from('clients').select('*').eq('user_id', userId).lt('last_visit', ninetyDaysAgo.toISOString().split('T')[0]);
    if (error) throw error;
    return (data || []) as T;
  }

  if (path.startsWith('/api/appointments/')) {
    const id = path.split('/').pop();
    const { data, error } = await supabase.from('appointments').select('*, client:clients(*)').eq('id', id).eq('user_id', userId).single();
    if (error) throw error;
    return { ...data, service: data.service_name, time: data.start_time } as T;
  }

  if (path.startsWith('/api/clients/')) {
    const id = path.split('/').pop();
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).eq('user_id', userId).single();
    if (error) throw error;
    return data as T;
  }

  if (path === '/api/subscription') {
    const { data, error } = await supabase.from('subscription_plans').select('*').eq('user_id', userId).single();
    if (error || !data) return { planType: 'Gratuito', price: '0', features: [] } as T;
    return { planType: data.plan_type, price: data.price, features: data.features || [] } as T;
  }

  if (path === '/api/whatsapp-config') {
    const { data } = await supabase.from('whatsapp_config').select('*').eq('user_id', userId).single();
    if (!data) return { isConnected: false, phoneNumber: null, apiKey: null, reminder24h: true, reminder2h: true, confirmationOnBooking: true, waitlistNotification: false } as T;
    return { id: data.id, isConnected: data.is_connected, phoneNumber: data.phone_number, apiKey: data.api_key, reminder24h: data.reminder_24h, reminder2h: data.reminder_2h, confirmationOnBooking: data.confirmation_on_booking, waitlistNotification: data.waitlist_notification } as T;
  }

  throw new Error(`Unknown API path: ${path}`);
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const userId = await getCurrentUserId();

  if (path === '/api/appointments') {
    const startTime = body.time;
    const endTime = body.endTime || (() => { const [h, m] = startTime.split(':').map(Number); const endMin = h * 60 + m + 30; return `${Math.floor(endMin/60).toString().padStart(2,'0')}:${(endMin%60).toString().padStart(2,'0')}`; })();
    const { data, error } = await supabase.from('appointments').insert({ user_id: userId, client_id: body.clientId, service_name: body.service, date: body.date, start_time: startTime, end_time: endTime, status: body.isOverlapping ? 'En espera' : 'Pendiente', notes: body.notes || null, service_cost: body.service_cost || 0, whatsapp_notification: body.sendWhatsApp || false }).select().single();
    if (error) throw error;
    return { ...data, service: data.service_name, time: data.start_time } as T;
  }

  if (path === '/api/clients') {
    const { data, error } = await supabase.from('clients').insert({ user_id: userId, ...body }).select().single();
    if (error) throw error;
    return data as T;
  }

  if (path === '/api/services') {
    const { data, error } = await supabase.from('services').insert({ user_id: userId, name: body.name, description: body.description || null, price: body.price, duration_minutes: body.durationMinutes, is_active: true }).select().single();
    if (error) throw error;
    return { id: data.id, name: data.name, description: data.description, price: data.price, durationMinutes: data.duration_minutes, isActive: data.is_active } as T;
  }

  if (path.startsWith('/api/clients/')) {
    const id = path.split('/').pop();
    const { data, error } = await supabase.from('clients').update({ name: body.name, phone: body.phone, email: body.email || null, notes: body.notes || null, birthday: body.birthday || null, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw error;
    return data as T;
  }

  throw new Error(`Unknown API path: ${path}`);
}

export async function apiPatch<T>(path: string, body: any): Promise<T> {
  const userId = await getCurrentUserId();

  if (path.startsWith('/api/appointments/') && !path.includes('/reschedule')) {
    const id = path.split('/').pop();
    const { data, error } = await supabase.from('appointments').update({ status: body.status, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw error;
    return data as T;
  }

  if (path.includes('/status')) {
    const id = path.split('/')[3];
    const { data, error } = await supabase.from('appointments').update({ status: body.status, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw error;
    return data as T;
  }

  if (path.includes('/reschedule')) {
    const id = path.split('/')[3];
    const { data, error } = await supabase.from('appointments').update({ date: body.date, start_time: body.time, status: 'Reagendada', updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw error;
    return data as T;
  }

  if (path.startsWith('/api/services/')) {
    const id = path.split('/').pop();
    const { data, error } = await supabase.from('services').update({ name: body.name, description: body.description || null, price: body.price, duration_minutes: body.durationMinutes, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw error;
    return { id: data.id, name: data.name, description: data.description, price: data.price, durationMinutes: data.duration_minutes, isActive: data.is_active } as T;
  }

  if (path.startsWith('/api/clients/')) {
    const id = path.split('/').pop();
    const { data, error } = await supabase.from('clients').update({ ...body, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw error;
    return data as T;
  }

  if (path === '/api/business-profile') {
    const { data, error } = await supabase.from('business_profiles').update({ ...body, updated_at: new Date().toISOString() }).eq('user_id', userId).select().single();
    if (error) throw error;
    return data as T;
  }

  throw new Error(`Unknown API path: ${path}`);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const userId = await getCurrentUserId();

  if (path.startsWith('/api/appointments/')) {
    const id = path.split('/').pop();
    const { error } = await supabase.from('appointments').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
    return { success: true } as T;
  }

  if (path.startsWith('/api/clients/')) {
    const id = path.split('/').pop();
    const { error } = await supabase.from('clients').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
    return { success: true } as T;
  }

  if (path.startsWith('/api/services/')) {
    const id = path.split('/').pop();
    const { error } = await supabase.from('services').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId);
    if (error) throw error;
    return { success: true } as T;
  }

  throw new Error(`Unknown API path: ${path}`);
}

export async function getBearerToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

export const BACKEND_URL = 'https://nhjmwmkaduiaifgztymi.supabase.co';

export async function apiPut<T>(path: string, body: any): Promise<T> {
  const userId = await getCurrentUserId();

  if (path.startsWith('/api/business-hours/')) {
    const dayOfWeek = parseInt(path.split('/').pop() || '0');
    const { data: existing } = await supabase.from('business_hours').select('id').eq('user_id', userId).eq('day_of_week', dayOfWeek).single();
    if (existing) {
      const { data, error } = await supabase.from('business_hours').update({ start_time: body.startTime, end_time: body.endTime, is_open: body.isOpen, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('day_of_week', dayOfWeek).select().single();
      if (error) throw error;
      return data as T;
    } else {
      const { data, error } = await supabase.from('business_hours').insert({ user_id: userId, day_of_week: dayOfWeek, start_time: body.startTime, end_time: body.endTime, is_open: body.isOpen }).select().single();
      if (error) throw error;
      return data as T;
    }
  }

  if (path.startsWith('/api/appointments/')) {
    const id = path.split('/').pop();
    const t = body.time ? body.time.split(':').map(Number) : [9, 0];
    const endMin = t[0] * 60 + t[1] + 30;
    const endTime = `${Math.floor(endMin/60).toString().padStart(2,'0')}:${(endMin%60).toString().padStart(2,'0')}`;
    const { data, error } = await supabase.from('appointments').update({ date: body.date, start_time: body.time, end_time: endTime, status: 'Pendiente', updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw error;
    return data as T;
  }

  if (path === '/api/business-profile') {
    const { data, error } = await supabase.from('business_profiles').upsert({ user_id: userId, business_name: body.businessName, business_type: body.businessType, address: body.address || null, phone: body.phone || null, alternative_phone: body.alternativePhone || null, logo_url: body.logoUrl || null, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select().single();
    if (error) throw error;
    return data as T;
  }

  if (path.startsWith('/api/clients/')) {
    const id = path.split('/').pop();
    const { data, error } = await supabase.from('clients').update({ name: body.name, phone: body.phone, email: body.email || null, notes: body.notes || null, birthday: body.birthday || null, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw error;
    return data as T;
  }

  // ─── WhatsApp config — upsert (crea si no existe, actualiza si ya existe) ───
  if (path === '/api/whatsapp-config') {
    const { data, error } = await supabase
      .from('whatsapp_config')
      .upsert({
        user_id: userId,
        is_connected: body.isConnected ?? false,
        phone_number: body.phoneNumber ?? null,
        api_key: body.apiKey ?? null,
        reminder_24h: body.reminder24h ?? true,
        reminder_2h: body.reminder2h ?? true,
        confirmation_on_booking: body.confirmationOnBooking ?? true,
        waitlist_notification: body.waitlistNotification ?? false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      isConnected: data.is_connected,
      phoneNumber: data.phone_number,
      apiKey: data.api_key,
      reminder24h: data.reminder_24h,
      reminder2h: data.reminder_2h,
      confirmationOnBooking: data.confirmation_on_booking,
      waitlistNotification: data.waitlist_notification,
    } as T;
  }

  throw new Error(`Unknown API path: ${path}`);
}
