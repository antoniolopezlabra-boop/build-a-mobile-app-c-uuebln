import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

// Aceptar ambas variantes: con y sin acento, para tolerar inconsistencias en BD
export type PlanType = 'Gratuito' | 'Básico' | 'Basico' | 'Premium';
export type PlanStatus = 'active' | 'trial' | 'expired' | 'cancelled';

interface PlanData {
  planType: string; // string amplio para no fallar con variantes de BD
  status: PlanStatus;
  trialEndsAt: string | null;
  price: string;
}

interface PlanContextType {
  plan: PlanData;
  loading: boolean;
  canSchedule: boolean;
  canViewReports: boolean;
  canUseWhatsApp: boolean;
  canUseOwnNumber: boolean;
  canOverlap: boolean;
  canUseCollaborators: boolean;
  canRunCampaigns: boolean;
  canExportCSV: boolean;
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

// Helper: normalizar plan_type de BD — tolera acentos y mayúsculas
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
    console.log('[PlanContext] Loading plan for user:', userId);
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
          console.log('[PlanContext] No plan found, creating Gratuito');
          await supabase.from('subscription_plans').insert({
            user_id: userId,
            plan_type: 'Gratuito',
            price: '0',
            status: 'active',
          });
          setPlan(defaultPlan);
        } else {
          console.warn('[PlanContext] Error fetching plan:', error.message);
          setPlan(defaultPlan);
        }
        return;
      }

      if (!data) {
        setPlan(defaultPlan);
        return;
      }

      const normalized = normalizePlanType(data.plan_type);
      console.log('[PlanContext] Plan loaded (raw):', data.plan_type, '→ normalized:', normalized, '| status:', data.status);

      setPlan({
        planType: normalized,
        status: data.status as PlanStatus,
        trialEndsAt: data.trial_ends_at,
        price: data.price,
      });
    } catch (e) {
      console.error('[PlanContext] Error loading plan:', e);
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

  // Comparaciones normalizadas — funciona con o sin acento
  const isGratuito = plan.planType === 'Gratuito';
  const isBasico = plan.planType === 'Basico' || plan.planType === 'Básico';
  const isPremium = plan.planType === 'Premium';

  const daysLeftInTrial = plan.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(plan.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  const isTrialActive = plan.status === 'trial' && daysLeftInTrial > 0;

  console.log('[PlanContext] Feature flags — isBasico:', isBasico, 'isPremium:', isPremium, 'canViewReports:', isBasico || isPremium || isTrialActive);

  const canSchedule = isBasico || isPremium || isTrialActive;
  const canViewReports = isBasico || isPremium || isTrialActive;
  const canUseWhatsApp = isBasico || isPremium || isTrialActive;
  const canUseOwnNumber = isPremium;
  const canOverlap = isPremium;
  const canUseCollaborators = isPremium;
  const canRunCampaigns = isPremium;
  const canExportCSV = isPremium;

  return (
    <PlanContext.Provider value={{
      plan, loading,
      canSchedule, canViewReports, canUseWhatsApp,
      canUseOwnNumber, canOverlap, canUseCollaborators,
      canRunCampaigns, canExportCSV,
      isGratuito, isBasico, isPremium,
      isTrialActive, daysLeftInTrial,
      refreshPlan: () => user?.id ? loadPlan(user.id) : Promise.resolve(),
    }}>
      {children}
    </PlanContext.Provider>
  );
}

export const usePlan = () => useContext(PlanContext);
