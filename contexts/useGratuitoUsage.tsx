import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { usePlan } from '@/contexts/PlanContext';
import { useAuth } from '@/contexts/AuthContext';
import { getMonthStartString, getMonthEndString } from '@/utils/dateUtils';

// ══════════════════════════════════════════════════════════════════
// useGratuitoUsage — Contador de citas del mes para usuarios Gratuito
// Devuelve { used, limit, remaining, percentage, isAtLimit, isNearLimit, refresh }
// Solo activa el conteo cuando el usuario es Gratuito (para no consumir queries innecesarias).
// El límite (10) debe coincidir con GRATUITO_MONTHLY_LIMIT en utils/api.ts.
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

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  // Suscripción en tiempo real: si se crean/actualizan citas, recalcular.
  // Solo para Gratuito (los planes pagados no tienen límite).
  useEffect(() => {
    if (!user?.id || !isGratuito) return;
    const channel = supabase
      .channel(`gratuito-usage-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, payload => {
        const row = (payload.new ?? payload.old) as any;
        if (row?.user_id !== user.id) return;
        loadUsage();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, isGratuito, loadUsage]);

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
