import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { usePlan } from '@/contexts/PlanContext';
import { useAuth } from '@/contexts/AuthContext';
import { getMonthStartString, getMonthEndString } from '@/utils/dateUtils';

// ══════════════════════════════════════════════════════════════════
// useGratuitoUsage — Contador de citas del mes para usuarios Gratuito
// Devuelve { used, limit, remaining, percentage, isAtLimit, isNearLimit, refresh }
// Solo activa el conteo cuando el usuario es Gratuito (para no consumir queries innecesarias).
// El límite (10) debe coincidir con GRATUITO_MONTHLY_LIMIT en utils/api.ts.
//
// IMPORTANTE: La suscripción Realtime usa una ref para acceder a loadUsage,
// y el canal se crea UNA SOLA VEZ por user.id+isGratuito. Esto evita el error
// "cannot add postgres_changes callbacks after subscribe" que se da en Android
// con Hermes cuando el useEffect re-ejecuta con loadUsage como dependencia.
// ══════════════════════════════════════════════════════════════════

const GRATUITO_MONTHLY_LIMIT = 10;
const EXCLUDED_STATUSES = ['Cancelada', 'No asistió', 'Rechazada'];

interface UsageData {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
  isAtLimit: boolean;
  isNearLimit: boolean; // 80%+ usado
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useGratuitoUsage(): UsageData {
  const { user } = useAuth();
  const { isGratuito } = usePlan();
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(true);

  // Ref a la función de carga: la suscripción realtime usará esta ref
  // para llamar a la versión más reciente sin necesidad de recrear el canal
  const loadUsageRef = useRef<() => Promise<void>>(async () => {});

  const loadUsage = useCallback(async () => {
    if (!user?.id || !isGratuito) {
      setUsed(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const now = new Date();
      const monthStart = getMonthStartString(now.getFullYear(), now.getMonth());
      const monthEnd   = getMonthEndString(now.getFullYear(), now.getMonth());

      const { count } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .not('status', 'in', `("${EXCLUDED_STATUSES.join('","')}")`);

      setUsed(count ?? 0);
    } catch (e) {
      console.warn('[useGratuitoUsage] Error:', e);
      setUsed(0);
    } finally {
      setLoading(false);
    }
  }, [user?.id, isGratuito]);

  // Mantener la ref actualizada con la versión más reciente de loadUsage
  useEffect(() => {
    loadUsageRef.current = loadUsage;
  }, [loadUsage]);

  // Carga inicial cuando cambia user/plan
  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  // ── Suscripción Realtime ──
  // Solo depende de user.id e isGratuito (NO de loadUsage).
  // Esto asegura que el canal se cree UNA sola vez por usuario y no se
  // intente "modificar" después de subscribe (lo que crashea en Android).
  useEffect(() => {
    if (!user?.id || !isGratuito) return;

    const channelName = `gratuito-usage-${user.id}-${Date.now()}`;
    let channel: any = null;
    let isMounted = true;

    try {
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'appointments' },
          (payload: any) => {
            if (!isMounted) return;
            const row = (payload?.new ?? payload?.old) as any;
            if (row?.user_id !== user.id) return;
            // Llamar via ref a la versión más reciente sin que la suscripción dependa de loadUsage
            loadUsageRef.current?.();
          }
        )
        .subscribe();
    } catch (e) {
      // Defensa: si subscribe falla por cualquier razón (ej. red caída, websocket bloqueado),
      // NO debe crashear el hook. Solo loggear y seguir adelante con polling silencioso.
      console.warn('[useGratuitoUsage] Realtime subscribe error:', e);
    }

    return () => {
      isMounted = false;
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch (e) {
          console.warn('[useGratuitoUsage] removeChannel error:', e);
        }
      }
    };
  }, [user?.id, isGratuito]); // ← NOTA: loadUsage NO está aquí (intencional)

  const remaining = Math.max(0, GRATUITO_MONTHLY_LIMIT - used);
  const percentage = Math.min(100, (used / GRATUITO_MONTHLY_LIMIT) * 100);
  const isAtLimit = used >= GRATUITO_MONTHLY_LIMIT;
  const isNearLimit = percentage >= 80 && !isAtLimit;

  return {
    used,
    limit: GRATUITO_MONTHLY_LIMIT,
    remaining,
    percentage,
    isAtLimit,
    isNearLimit,
    loading,
    refresh: loadUsage,
  };
}
