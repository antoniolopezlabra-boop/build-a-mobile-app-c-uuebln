import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

// ════════════════════════════════════════════════════════════════════
// useTimeBlocks — Hook para gestionar bloqueos de tiempo
// Lectura, creación, edición y borrado de la tabla time_blocks
// ════════════════════════════════════════════════════════════════════

export interface TimeBlock {
  id: string;
  user_id: string;
  staff_id: string | null;       // NULL = bloqueo del negocio. Lleno = solo de ese colaborador.
  label: string;                 // "Comida", "Junta", etc.
  start_time: string;            // "HH:MM"
  end_time: string;              // "HH:MM"
  is_recurring: boolean;
  day_of_week: number | null;    // 0-6 si recurring=true
  specific_date: string | null;  // YYYY-MM-DD si recurring=false
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export type TimeBlockInput = Omit<TimeBlock, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'is_active'>;

export function useTimeBlocks() {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) {
      setBlocks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('time_blocks')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });
      if (error) throw error;
      setBlocks((data ?? []) as TimeBlock[]);
    } catch (e) {
      console.warn('[useTimeBlocks] load error:', e);
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const create = async (input: TimeBlockInput): Promise<TimeBlock | null> => {
    if (!user?.id) return null;
    const payload: any = {
      user_id: user.id,
      staff_id: input.staff_id || null,
      label: input.label.trim() || 'Bloqueo',
      start_time: input.start_time,
      end_time: input.end_time,
      is_recurring: input.is_recurring,
      day_of_week: input.is_recurring ? input.day_of_week : null,
      specific_date: !input.is_recurring ? input.specific_date : null,
      is_active: true,
    };
    const { data, error } = await supabase.from('time_blocks').insert(payload).select().single();
    if (error) {
      console.warn('[useTimeBlocks] create error:', error);
      throw error;
    }
    await load();
    return data as TimeBlock;
  };

  const update = async (id: string, patch: Partial<TimeBlockInput>): Promise<void> => {
    if (!user?.id) return;
    const payload: any = { ...patch, updated_at: new Date().toISOString() };
    if (patch.is_recurring === true) payload.specific_date = null;
    if (patch.is_recurring === false) payload.day_of_week = null;
    const { error } = await supabase.from('time_blocks').update(payload).eq('id', id).eq('user_id', user.id);
    if (error) {
      console.warn('[useTimeBlocks] update error:', error);
      throw error;
    }
    await load();
  };

  const remove = async (id: string): Promise<void> => {
    if (!user?.id) return;
    const { error } = await supabase.from('time_blocks').delete().eq('id', id).eq('user_id', user.id);
    if (error) {
      console.warn('[useTimeBlocks] remove error:', error);
      throw error;
    }
    await load();
  };

  return { blocks, loading, refresh: load, create, update, remove };
}

// ════════════════════════════════════════════════════════════════════
// Helpers para validar si un rango (start-end) cae en un bloqueo
// ════════════════════════════════════════════════════════════════════

/**
 * Convierte "HH:MM" a minutos desde medianoche.
 * Acepta también "HH:MM:SS" (Postgres TIME devuelve este formato).
 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Verifica si dos rangos [aStart,aEnd) y [bStart,bEnd) se traslapan.
 * Recibe minutos.
 */
export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Determina si un slot dado choca con algún bloqueo aplicable.
 *
 * @param slotStart  "HH:MM" inicio del slot
 * @param slotEnd    "HH:MM" fin del slot
 * @param dateStr    "YYYY-MM-DD" fecha del slot
 * @param dayOfWeek  0=Lunes ... 6=Domingo (según convención del proyecto)
 * @param staffId    Colaborador asignado al slot (o null si general)
 * @param blocks     Bloqueos a evaluar (filtrados a is_active=true)
 *
 * Reglas:
 *   - Bloqueo aplica si: (staff_id es NULL → afecta a todos) O (staff_id === slot.staffId).
 *     Si el slot no tiene staff (staffId === null), solo aplican bloqueos generales (staff_id NULL).
 *   - Si is_recurring=true → aplica si day_of_week coincide.
 *   - Si is_recurring=false → aplica si specific_date === dateStr.
 */
export function findBlockingTimeBlock(
  slotStart: string,
  slotEnd: string,
  dateStr: string,
  dayOfWeek: number,
  staffId: string | null,
  blocks: TimeBlock[]
): TimeBlock | null {
  const slotStartMin = timeToMinutes(slotStart);
  const slotEndMin = timeToMinutes(slotEnd);

  for (const b of blocks) {
    if (!b.is_active) continue;

    // Aplicabilidad por staff:
    // Si el bloqueo es por staff_id específico:
    //   - Solo aplica si el slot también tiene ese staff_id asignado.
    if (b.staff_id) {
      if (b.staff_id !== staffId) continue;
    }
    // Si b.staff_id es NULL → bloqueo del negocio, aplica a TODOS los slots
    // (con o sin staff asignado).

    // Aplicabilidad por fecha/día:
    if (b.is_recurring) {
      if (b.day_of_week !== dayOfWeek) continue;
    } else {
      if (b.specific_date !== dateStr) continue;
    }

    // Comprobar traslape de rangos
    const bStart = timeToMinutes(b.start_time);
    const bEnd = timeToMinutes(b.end_time);
    if (rangesOverlap(slotStartMin, slotEndMin, bStart, bEnd)) {
      return b;
    }
  }

  return null;
}
