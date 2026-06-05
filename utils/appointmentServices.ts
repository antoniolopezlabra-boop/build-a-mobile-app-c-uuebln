import { supabase } from '@/lib/supabase';

// ═══════════════════════════════════════════════════════════════════════
// utils/appointmentServices.ts — Multi-servicio (Jun 2026)
//
// Helper para manejar varios servicios en una misma cita. La tabla
// appointment_services guarda el DESGLOSE (un renglón por servicio) con
// precio y duración CONGELADOS al momento de agendar.
//
// IMPORTANTE: las columnas resumen de appointments (service_name combinado,
// service_cost total, end_time según duración total) siguen siendo la fuente
// autoritativa para agenda, empalmes, bloques, los 5 flujos de WhatsApp y
// reportes. Por eso el motor de horarios NO se reescribe: solo recibe el
// end_time correcto (inicio + duración total). appointment_services es el
// detalle fino (para el desglose en el detalle de la cita y reportes por
// servicio en el futuro).
// ═══════════════════════════════════════════════════════════════════════

export interface SelectedService {
  serviceId?: string | null;   // id del catalogo (null si llegara a ser texto libre)
  name: string;                // nombre del servicio
  price: number;               // precio CONGELADO al agendar
  durationMinutes: number;     // duracion CONGELADA al agendar
}

export interface ServicesSummary {
  combinedName: string;        // "Corte + Cejas"
  totalCost: number;           // suma de precios
  totalDurationMin: number;    // suma de duraciones (minutos)
  count: number;               // cuantos servicios
}

// Calcula nombre combinado, costo total y duracion total a partir de los
// servicios seleccionados. Alimenta las columnas RESUMEN de appointments.
export function computeServicesSummary(services: SelectedService[]): ServicesSummary {
  const list = (services || []).filter(Boolean);
  const combinedName = list.map((s) => s.name).filter(Boolean).join(' + ');
  const totalCost = list.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
  const totalDurationMin = list.reduce((sum, s) => sum + (Number(s.durationMinutes) || 0), 0);
  return { combinedName, totalCost, totalDurationMin, count: list.length };
}

// Escribe el desglose de servicios de una cita en appointment_services.
// Reemplaza el desglose previo (util al editar). En creacion no hay filas aun.
// Devuelve { error } para que el llamador decida: la cita ya tiene su resumen
// correcto en appointments, asi que si esto falla conviene loguear y seguir.
export async function writeAppointmentServices(
  appointmentId: string,
  services: SelectedService[],
): Promise<{ error: any | null }> {
  if (!appointmentId) return { error: new Error('appointmentId requerido') };

  const list = (services || []).filter(Boolean);
  if (list.length === 0) return { error: null };

  // Limpiar desglose previo (caso edicion). Idempotente en creacion.
  await supabase.from('appointment_services').delete().eq('appointment_id', appointmentId);

  const rows = list.map((s, i) => ({
    appointment_id: appointmentId,
    service_id: s.serviceId || null,
    service_name: s.name,
    price: Number(s.price) || 0,
    duration_minutes: Math.max(1, Math.round(Number(s.durationMinutes) || 0)),
    position: i,
  }));

  const { error } = await supabase.from('appointment_services').insert(rows);
  return { error };
}

// Lee el desglose de servicios de una cita, ordenado por position.
export async function fetchAppointmentServices(appointmentId: string): Promise<SelectedService[]> {
  if (!appointmentId) return [];
  const { data, error } = await supabase
    .from('appointment_services')
    .select('service_id, service_name, price, duration_minutes, position')
    .eq('appointment_id', appointmentId)
    .order('position', { ascending: true });
  if (error || !data) return [];
  return data.map((r: any) => ({
    serviceId: r.service_id,
    name: r.service_name,
    price: Number(r.price) || 0,
    durationMinutes: Number(r.duration_minutes) || 0,
  }));
}
