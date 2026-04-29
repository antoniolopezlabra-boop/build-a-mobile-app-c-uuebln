import { getTodayString, getTomorrowString, getDateStringDaysFromNow, toLocalDateString, addDays, getMonthStartString, getMonthEndString } from '@/utils/dateUtils';
import { supabase } from '@/lib/supabase';
import { logger } from '@/utils/logger';

// Estados que NO cuentan como "cita del día/semana/mes" (citas descartadas)
const EXCLUDED_STATUSES = ['Cancelada', 'No asistió', 'Rechazada'];

// Estados que SÍ cuentan como "ocupando el slot" (para availability check)
const ACTIVE_STATUSES = ['Pendiente', 'Confirmada', 'Completada', 'Pagado', 'Reagendada', 'En espera', 'Solicitud'];

// Límite mensual del plan Gratuito (debe coincidir con create-booking-request Edge Function)
const GRATUITO_MONTHLY_LIMIT = 10;

export async function getCurrentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');
  return user.id;
}

const mapAppointment = (a: any) => ({
  id: a.id,
  clientId: a.client_id,
  service: a.service_name,
  date: a.date,
  time: a.start_time,
  startTime: a.start_time,
  endTime: a.end_time,
  status: a.status,
  isRescheduled: a.is_rescheduled || false,
  notes: a.notes,
  client: a.client,
  clientNameTemp: a.client_name_temp || null,
  clientPhone: a.client_phone_temp || null,
  source: a.source || null,
  staff_id: a.staff_id || null,
  serviceCost: a.service_cost || null,
});

function calcEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const totalMin = h * 60 + m + durationMinutes;
  return `${Math.floor(totalMin/60).toString().padStart(2,'0')}:${(totalMin%60).toString().padStart(2,'0')}`;
}

function calcDurationMinutes(startTime: string | null | undefined, endTime: string | null | undefined, fallback = 30): number {
  if (!startTime || !endTime) return fallback;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : fallback;
}

function extractIdFromPath(path: string): string {
  const id = path.split('/').pop();
  if (!id || id.trim() === '') {
    throw new Error(`Invalid path: missing ID in ${path}`);
  }
  return id;
}

// Valida si un usuario Gratuito ha alcanzado su límite mensual.
async function enforceGratuitoMonthlyLimit(userId: string): Promise<void> {
  const { data: sub } = await supabase
    .from('subscription_plans')
    .select('plan_type')
    .eq('user_id', userId)
    .single();

  const planType = sub?.plan_type?.toLowerCase() ?? 'gratuito';
  if (planType !== 'gratuito') return;

  const now = new Date();
  const monthStart = getMonthStartString(now.getFullYear(), now.getMonth());
  const monthEnd   = getMonthEndString(now.getFullYear(), now.getMonth());

  const { count } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('date', monthStart)
    .lte('date', monthEnd)
    .not('status', 'in', `("${EXCLUDED_STATUSES.join('","')}")`);

  if ((count ?? 0) >= GRATUITO_MONTHLY_LIMIT) {
    const err: any = new Error(
      `Alcanzaste el límite de ${GRATUITO_MONTHLY_LIMIT} citas del plan Gratuito este mes. Actualiza al Plan Premium para citas ilimitadas.`
    );
    err.code = 'PLAN_LIMIT_REACHED';
    throw err;
  }
}

// ────────────────────────────────────────────────────────────────────
// SEGURIDAD: Valida que el usuario tenga plan Premium (Luxury visible)
// para crear citas con isOverlapping=true (citas simultáneas).
// Sin esta validación, un cliente manipulado podría enviar isOverlapping
// y obtener la feature de Luxury sin pagarla.
// ────────────────────────────────────────────────────────────────────
async function validateOverlappingPermission(userId: string, isOverlapping: boolean): Promise<void> {
  if (!isOverlapping) return;

  const { data: sub } = await supabase
    .from('subscription_plans')
    .select('plan_type, status')
    .eq('user_id', userId)
    .single();

  // Solo plan Premium (interno) = Luxury (visible) puede usar citas simultáneas
  const planType = sub?.plan_type?.toLowerCase() ?? 'gratuito';
  const status   = sub?.status?.toLowerCase() ?? '';
  const isPremium = planType === 'premium' && (status === 'active' || status === 'pending_cancellation');

  if (!isPremium) {
    const err: any = new Error(
      'Las citas simultáneas solo están disponibles en el Plan Luxury. Actualiza tu plan para activar esta función.'
    );
    err.code = 'OVERLAP_NOT_ALLOWED';
    throw err;
  }

  const { data: bp } = await supabase
    .from('business_profiles')
    .select('allow_overlapping')
    .eq('user_id', userId)
    .single();

  if (!bp?.allow_overlapping) {
    const err: any = new Error(
      'El toggle de "Citas simultáneas" no está activado en tu configuración. Actívalo desde Ajustes > Mi Negocio.'
    );
    err.code = 'OVERLAP_TOGGLE_OFF';
    throw err;
  }
}

// ────────────────────────────────────────────────────────────────────
// SEGURIDAD: Valida que NO haya conflicto de horario antes de crear/reagendar.
// Resuelve dos riesgos:
//   1. Race condition: 2 personas agendando el mismo slot al mismo tiempo
//   2. Cliente manipulado: usuario sin Luxury enviando isOverlapping=false
//      pero con slot ya ocupado.
//
// Lógica:
//   - Si allowOverlap=true (Luxury con toggle ON), solo bloquea conflictos del MISMO staff_id.
//     Diferentes colaboradores pueden tener citas al mismo tiempo (es lo correcto).
//   - Si allowOverlap=false, bloquea cualquier conflicto del usuario en ese rango.
// ────────────────────────────────────────────────────────────────────
async function validateNoTimeConflict(
  userId: string,
  date: string,
  startTime: string,
  endTime: string,
  staffId: string | null,
  allowOverlap: boolean,
  excludeAppointmentId?: string
): Promise<void> {
  let query = supabase
    .from('appointments')
    .select('id, start_time, end_time, staff_id')
    .eq('user_id', userId)
    .eq('date', date)
    .not('status', 'in', `("${EXCLUDED_STATUSES.join('","')}")`)
    .lt('start_time', endTime)
    .gt('end_time', startTime);

  if (excludeAppointmentId) {
    query = query.neq('id', excludeAppointmentId);
  }

  // Si tiene Luxury con overlap, solo verificar conflictos del MISMO colaborador.
  if (allowOverlap && staffId) {
    query = query.eq('staff_id', staffId);
  }

  const { data: conflicts, error } = await query.limit(1);

  if (error) {
    console.error('[validateNoTimeConflict] DB error:', error);
    throw new Error('Error al validar disponibilidad del horario');
  }

  if (conflicts && conflicts.length > 0) {
    const err: any = new Error(
      'Ese horario acaba de ocuparse. Por favor elige otro horario.'
    );
    err.code = 'SLOT_TAKEN';
    throw err;
  }
}

async function getAllowOverlapping(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('business_profiles')
    .select('allow_overlapping')
    .eq('user_id', userId)
    .single();
  return data?.allow_overlapping ?? false;
}

export async function apiGet<T>(path: string): Promise<T> {
  const userId = await getCurrentUserId();

  if (path === '/api/business-profile') {
    const { data, error } = await supabase.from('business_profiles').select('*').eq('user_id', userId).single();
    if (error) throw error;
    return { id: data.id, userId: data.user_id, businessName: data.business_name, businessType: data.business_type, address: data.address, phone: data.phone, alternativePhone: data.alternative_phone, logoUrl: data.logo_url, weeklySchedule: data.weekly_schedule } as T;
  }

  if (path === '/api/clients') {
    const { data, error } = await supabase.from('clients').select('*').eq('user_id', userId).order('name');
    if (error) throw error;
    return (data?.map(c => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, birthday: c.birthday, notes: c.notes, isActive: c.is_active, lastVisit: c.last_visit, totalVisits: c.total_visits })) || []) as T;
  }

  if (path === '/api/services') {
    const { data, error } = await supabase.from('services').select('*').eq('user_id', userId).eq('is_active', true).order('name');
    if (error) throw error;
    return (data?.map(s => ({ id: s.id, name: s.name, description: s.description, price: s.price, durationMinutes: s.duration_minutes, isActive: s.is_active })) || []) as T;
  }

  if (path === '/api/appointments') {
    const fromDate = getDateStringDaysFromNow(-90);
    const toDate   = getDateStringDaysFromNow(180);
    const { data, error } = await supabase
      .from('appointments')
      .select('*, client:clients(name, phone)')
      .eq('user_id', userId)
      .gte('date', fromDate)
      .lte('date', toDate)
      .order('start_time');
    if (error) throw error;
    return (data?.map(mapAppointment) || []) as T;
  }

  if (path === '/api/appointments/today') {
    const today = getTodayString();
    const { data, error } = await supabase
      .from('appointments')
      .select('*, client:clients(name, phone)')
      .eq('user_id', userId)
      .eq('date', today)
      .order('start_time');
    if (error) throw error;
    return (data?.map(mapAppointment) || []) as T;
  }

  if (path === '/api/appointments/week') {
    const tomorrowStr = getTomorrowString();
    const weekEndStr  = getDateStringDaysFromNow(7);
    const { data, error } = await supabase
      .from('appointments')
      .select('*, client:clients(name, phone)')
      .eq('user_id', userId)
      .gte('date', tomorrowStr)
      .lte('date', weekEndStr)
      .order('date')
      .order('start_time');
    if (error) throw error;
    return (data?.map(mapAppointment) || []) as T;
  }

  if (path.startsWith('/api/appointments/date/')) {
    const dateStr = path.split('/api/appointments/date/')[1];
    const { data, error } = await supabase
      .from('appointments')
      .select('*, client:clients(name, phone)')
      .eq('user_id', userId)
      .eq('date', dateStr)
      .not('status', 'in', `("${EXCLUDED_STATUSES.join('","')}")`)
      .order('start_time');
    if (error) throw error;
    return (data?.map(mapAppointment) || []) as T;
  }

  if (path === '/api/stats/dashboard') {
    const today       = getTodayString();
    const tomorrowStr = getTomorrowString();
    const weekEndStr  = getDateStringDaysFromNow(7);
    const [{ data: todayApts }, { data: weekApts }, { count: totalClients }, { count: totalAppointments }] = await Promise.all([
      supabase.from('appointments').select('status').eq('user_id', userId).eq('date', today),
      supabase.from('appointments').select('status').eq('user_id', userId).gte('date', tomorrowStr).lte('date', weekEndStr),
      supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    ]);
    const activeTodayApts = (todayApts || []).filter((a: any) => !EXCLUDED_STATUSES.includes(a.status));
    const activeWeekApts  = (weekApts  || []).filter((a: any) => !EXCLUDED_STATUSES.includes(a.status));
    return {
      todayAppointments:  activeTodayApts.length,
      confirmedToday:     activeTodayApts.filter((a: any) => a.status === 'Confirmada').length,
      unconfirmedToday:   activeTodayApts.filter((a: any) => a.status === 'Pendiente').length,
      weekAppointments:   activeWeekApts.length,
      confirmedWeek:      activeWeekApts.filter((a: any) => a.status === 'Confirmada').length,
      unconfirmedWeek:    activeWeekApts.filter((a: any) => a.status === 'Pendiente').length,
      totalClients:       totalClients || 0,
      totalAppointments:  totalAppointments || 0,
    } as T;
  }

  if (path === '/api/business-hours') {
    const { data, error } = await supabase.from('business_hours').select('*').eq('user_id', userId).order('day_of_week');
    if (error) throw error;
    return ((data || []).map((d: any) => ({ id: d.id, dayOfWeek: d.day_of_week, startTime: d.start_time, endTime: d.end_time, isOpen: d.is_open }))) as T;
  }

  if (path.startsWith('/api/clients/inactive')) {
    const ninetyDaysAgoStr = getDateStringDaysFromNow(-90);
    const { data, error } = await supabase.from('clients').select('*').eq('user_id', userId).lt('last_visit', ninetyDaysAgoStr);
    if (error) throw error;
    return (data || []) as T;
  }

  const statsMatch = path.match(/^\/api\/clients\/([^/]+)\/stats$/);
  if (statsMatch) {
    const clientId = statsMatch[1];
    const { data: apts, error } = await supabase.from('appointments').select('id, status, date').eq('user_id', userId).eq('client_id', clientId).order('date', { ascending: false });
    if (error) throw error;
    const total = apts?.length || 0;
    const attended = apts?.filter((a: any) => ['Confirmada', 'Completada', 'Pagado'].includes(a.status)).length || 0;
    const noShows = apts?.filter((a: any) => a.status === 'No asistió').length || 0;
    const attendanceRate = total > 0 ? Math.round((attended / total) * 100) : 0;
    const lastVisit = apts && apts.length > 0 ? apts[0].date : null;
    return { totalAppointments: total, attendanceRate, lastVisit, noShowCount: noShows } as T;
  }

  const clientApptsMatch = path.match(/^\/api\/clients\/([^/]+)\/appointments$/);
  if (clientApptsMatch) {
    const clientId = clientApptsMatch[1];
    const { data, error } = await supabase.from('appointments').select('id, date, start_time, end_time, service_name, status, notes').eq('user_id', userId).eq('client_id', clientId).order('date', { ascending: false }).order('start_time', { ascending: false });
    if (error) throw error;
    return ((data || []).map((a: any) => ({ id: a.id, date: a.date, startTime: a.start_time, endTime: a.end_time, service: a.service_name, status: a.status, notes: a.notes }))) as T;
  }

  if (path.startsWith('/api/appointments/')) {
    const id = extractIdFromPath(path);
    const { data, error } = await supabase
      .from('appointments')
      .select('*, client:clients(*)')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    if (error) throw error;
    return {
      ...data,
      service: data.service_name,
      time: data.start_time,
      clientNameTemp: data.client_name_temp || null,
      clientPhone: data.client_phone_temp || null,
      source: data.source || null,
      staff_id: data.staff_id || null,
    } as T;
  }

  if (path.startsWith('/api/clients/')) {
    const id = extractIdFromPath(path);
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
    // ── 1. Validar límite del plan Gratuito ──
    await enforceGratuitoMonthlyLimit(userId);

    const startTime = body.time;
    const endTime = body.endTime || calcEndTime(startTime, 30);
    const requestedOverlap = !!body.isOverlapping;

    // ── 2. SEGURIDAD: Validar que el plan permite citas simultáneas ──
    await validateOverlappingPermission(userId, requestedOverlap);

    // ── 3. SEGURIDAD: Validar conflicto de horario en BD ──
    await validateNoTimeConflict(
      userId,
      body.date,
      startTime,
      endTime,
      body.staff_id || null,
      requestedOverlap
    );

    const { data, error } = await supabase.from('appointments').insert({
      user_id: userId,
      client_id: body.clientId,
      service_name: body.service,
      date: body.date,
      start_time: startTime,
      end_time: endTime,
      status: requestedOverlap ? 'En espera' : 'Pendiente',
      notes: body.notes || null,
      service_cost: body.service_cost || 0,
      whatsapp_notification: body.sendWhatsApp || false,
      staff_id: body.staff_id || null,
    }).select().single();
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
    const id = extractIdFromPath(path);
    const { data, error } = await supabase.from('clients').update({ name: body.name, phone: body.phone, email: body.email || null, notes: body.notes || null, birthday: body.birthday || null, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw error;
    return data as T;
  }

  throw new Error(`Unknown API path: ${path}`);
}

export async function apiPatch<T>(path: string, body: any): Promise<T> {
  const userId = await getCurrentUserId();

  if (path.includes('/reschedule')) {
    const parts = path.split('/');
    const id = parts[3];
    if (!id) throw new Error(`Invalid path: missing ID in ${path}`);
    const { data, error } = await supabase.from('appointments').update({ date: body.date, start_time: body.time, status: 'Reagendada', updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw error;
    return data as T;
  }

  if (path.includes('/status')) {
    const parts = path.split('/');
    const id = parts[3];
    if (!id) throw new Error(`Invalid path: missing ID in ${path}`);
    const { data, error } = await supabase.from('appointments').update({ status: body.status, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw error;
    return data as T;
  }

  if (path.startsWith('/api/appointments/')) {
    const id = extractIdFromPath(path);
    const updateFields: any = { updated_at: new Date().toISOString() };
    if (body.status !== undefined)   updateFields.status   = body.status;
    if (body.staff_id !== undefined) updateFields.staff_id = body.staff_id;
    const { data, error } = await supabase.from('appointments').update(updateFields).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw error;
    return data as T;
  }

  if (path.startsWith('/api/services/')) {
    const id = extractIdFromPath(path);
    const { data, error } = await supabase.from('services').update({ name: body.name, description: body.description || null, price: body.price, duration_minutes: body.durationMinutes, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw error;
    return { id: data.id, name: data.name, description: data.description, price: data.price, durationMinutes: data.duration_minutes, isActive: data.is_active } as T;
  }

  if (path.startsWith('/api/clients/')) {
    const id = extractIdFromPath(path);
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
    const id = extractIdFromPath(path);
    const { error } = await supabase.from('appointments').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
    return { success: true } as T;
  }

  if (path.startsWith('/api/clients/')) {
    const id = extractIdFromPath(path);
    const { error } = await supabase.from('clients').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
    return { success: true } as T;
  }

  if (path.startsWith('/api/services/')) {
    const id = extractIdFromPath(path);
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
    const id = extractIdFromPath(path);
    const { data: existing, error: fetchErr } = await supabase
      .from('appointments')
      .select('start_time, end_time, status, staff_id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    if (fetchErr) throw fetchErr;

    const duration = calcDurationMinutes(existing.start_time, existing.end_time, 30);
    const newStartTime = body.time;
    const newEndTime  = newStartTime ? calcEndTime(newStartTime, duration) : existing.end_time;

    // ── SEGURIDAD: Validar conflicto al reagendar ──
    if (newStartTime && body.date) {
      const allowOverlap = await getAllowOverlapping(userId);
      await validateNoTimeConflict(
        userId,
        body.date,
        newStartTime,
        newEndTime,
        existing.staff_id || null,
        allowOverlap,
        id
      );
    }

    const updateFields: any = {
      date: body.date,
      start_time: newStartTime,
      end_time: newEndTime,
      updated_at: new Date().toISOString(),
    };
    if (['Pendiente', 'Confirmada', 'En espera', 'Solicitud'].includes(existing.status)) {
      updateFields.status = 'Reagendada';
    }

    const { data, error } = await supabase.from('appointments')
      .update(updateFields)
      .eq('id', id).eq('user_id', userId)
      .select().single();
    if (error) throw error;
    return data as T;
  }

  if (path === '/api/business-profile') {
    const { data, error } = await supabase.from('business_profiles').upsert({ user_id: userId, business_name: body.businessName, business_type: body.businessType, address: body.address || null, phone: body.phone || null, alternative_phone: body.alternativePhone || null, logo_url: body.logoUrl || null, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select().single();
    if (error) throw error;
    return data as T;
  }

  if (path.startsWith('/api/clients/')) {
    const id = extractIdFromPath(path);
    const { data, error } = await supabase.from('clients').update({ name: body.name, phone: body.phone, email: body.email || null, notes: body.notes || null, birthday: body.birthday || null, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw error;
    return data as T;
  }

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
