import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { logger } from '@/utils/logger';

export type PlanType = 'Gratuito' | 'Básico' | 'Basico' | 'Premium';
export type PlanStatus = 'active' | 'trial' | 'expired' | 'cancelled';

interface PlanData {
  planType: string;
  status: PlanStatus;
  trialEndsAt: string | null;
  price: string;
}

interface PlanContextType {
  plan: PlanData;
  loading: boolean;
  canSchedule: boolean;
  canViewReports: boolean;
  canUseWhatsApp: boolean;       // Todos los planes — recordatorios salientes número VYLTA
  canOverlap: boolean;           // Luxury (ex-Premium) — citas simultáneas
  canUseCollaborators: boolean;  // Luxury (ex-Premium)
  canRunCampaigns: boolean;      // Luxury (ex-Premium) — email marketing + reactivación
  canExportCSV: boolean;         // Luxury (ex-Premium)
  canUseBookingLink: boolean;    // Todos los planes — link público de citas
  isGratuito: boolean;
  isBasico: boolean;
  isPremium: boolean;
  isTrialActive: boolean;
  daysLeftInTrial: number;
  refreshPlan: () => Promise<void>;
}

const defaultPlan: PlanData = {
  planType: 'Gratuito',
  status: 'active',
  trialEndsAt: null,
  price: '0',
};

function normalizePlanType(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (lower === 'basico' || lower === 'básico') return 'Basico';
  if (lower === 'premium') return 'Premium';
  return 'Gratuito';
}

const PlanContext = createContext<PlanContextType>({} as PlanContextType);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [plan, setPlan] = useState<PlanData>(defaultPlan);
  const [loading, setLoading] = useState(true);
  const lastLoadedUserId = useRef<string | null>(null);

  const loadPlan = async (userId: string) => {
    logger.log('[PlanContext] Loading plan for user:', userId);
    setLoading(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('plan_type, status, trial_ends_at, price')
        .eq('user_id', userId)
        .single();
      if (error) {
        if (error.code === 'PGRST116') {
          logger.log('[PlanContext] No plan found, creating Gratuito');
          await supabase.from('subscription_plans').insert({
            user_id: userId, plan_type: 'Gratuito', price: '0', status: 'active',
          });
          setPlan(defaultPlan);
        } else {
          logger.warn('[PlanContext] Error fetching plan:', error.message);
          setPlan(defaultPlan);
        }
        return;
      }
      if (!data) { setPlan(defaultPlan); return; }
      const normalized = normalizePlanType(data.plan_type);
      logger.log('[PlanContext] Plan loaded:', normalized, '| status:', data.status);
      setPlan({
        planType: normalized,
        status: data.status as PlanStatus,
        trialEndsAt: data.trial_ends_at,
        price: data.price,
      });
    } catch (e) {
      logger.error('[PlanContext] Error loading plan:', e);
      setPlan(defaultPlan);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      lastLoadedUserId.current = null;
      setPlan(defaultPlan);
      setLoading(false);
      return;
    }
    if (lastLoadedUserId.current === user.id) return;
    lastLoadedUserId.current = user.id;
    loadPlan(user.id);
  }, [user?.id, authLoading]);

  const isGratuito = plan.planType === 'Gratuito';
  const isBasico   = plan.planType === 'Basico' || plan.planType === 'Básico';
  const isPremium  = plan.planType === 'Premium';

  const daysLeftInTrial = plan.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(plan.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  const isTrialActive = plan.status === 'trial' && daysLeftInTrial > 0;

  // ══════════════════════════════════════════════════════════
  // Permisos por plan — rebranding visual Abr 2026 (Camino A)
  // Los NOMBRES INTERNOS siguen igual (Gratuito/Basico/Premium)
  // pero ahora Gratuito tiene acceso a más funciones, limitado a 10 citas/mes
  // (límite enforced server-side en create-booking-request + apiPost /appointments)
  // ══════════════════════════════════════════════════════════
  const canSchedule         = true;  // Todos pueden agendar (Gratuito limitado a 10/mes server-side)
  const canUseWhatsApp      = true;  // Todos pueden usar recordatorios WhatsApp
  const canUseBookingLink   = true;  // Todos tienen link público
  const canViewReports      = isBasico || isPremium || isTrialActive; // Básico+ only
  const canOverlap          = isPremium;   // Luxury (ex-Premium) — citas simultáneas
  const canUseCollaborators = isPremium;   // Luxury (ex-Premium)
  const canRunCampaigns     = isPremium;   // Luxury (ex-Premium) — email marketing + reactivación
  const canExportCSV        = isPremium;   // Luxury (ex-Premium)

  return (
    <PlanContext.Provider value={{
      plan, loading,
      canSchedule, canViewReports, canUseWhatsApp,
      canOverlap, canUseCollaborators,
      canRunCampaigns, canExportCSV, canUseBookingLink,
      isGratuito, isBasico, isPremium,
      isTrialActive, daysLeftInTrial,
      refreshPlan: () => user?.id ? loadPlan(user.id) : Promise.resolve(),
    }}>
      {children}
    </PlanContext.Provider>
  );
}

export const usePlan = () => useContext(PlanContext);
