import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

export type PlanType = 'Gratuito' | 'Básico' | 'Premium';
export type PlanStatus = 'active' | 'trial' | 'expired' | 'cancelled';

interface PlanData {
  planType: PlanType;
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

      console.log('[PlanContext] Plan loaded:', data.plan_type, data.status);
      setPlan({
        planType: data.plan_type as PlanType,
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
    // Esperar a que Auth termine de cargar
    if (authLoading) {
      console.log('[PlanContext] Waiting for auth...');
      return;
    }

    // Sin usuario — resetear plan
    if (!user?.id) {
      console.log('[PlanContext] No user, resetting plan');
      lastLoadedUserId.current = null;
      setPlan(defaultPlan);
      setLoading(false);
      return;
    }

    // Evitar recargar el mismo usuario dos veces
    if (lastLoadedUserId.current === user.id) {
      console.log('[PlanContext] Plan already loaded for this user, skipping');
      return;
    }

    lastLoadedUserId.current = user.id;
    loadPlan(user.id);
  }, [user?.id, authLoading]);

  const isGratuito = plan.planType === 'Gratuito';
  const isBasico = plan.planType === 'Básico';
  const isPremium = plan.planType === 'Premium';

  const daysLeftInTrial = plan.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(plan.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  const isTrialActive = plan.status === 'trial' && daysLeftInTrial > 0;

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
