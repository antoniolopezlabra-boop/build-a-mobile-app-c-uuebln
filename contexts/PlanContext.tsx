import React, { createContext, useContext, useEffect, useState } from 'react';
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
  // Feature flags
  canSchedule: boolean;        // Básico+
  canViewReports: boolean;     // Básico+
  canUseWhatsApp: boolean;     // Básico+
  canUseOwnNumber: boolean;    // Premium
  canOverlap: boolean;         // Premium
  canUseCollaborators: boolean;// Premium
  canRunCampaigns: boolean;    // Premium
  canExportCSV: boolean;       // Premium
  // Helpers
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
  const { user } = useAuth();
  const [plan, setPlan] = useState<PlanData>(defaultPlan);
  const [loading, setLoading] = useState(true);

  const loadPlan = async () => {
    if (!user) {
      setPlan(defaultPlan);
      setLoading(false);
      return;
    }
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('plan_type, status, trial_ends_at, price')
        .eq('user_id', user.id)
        .single();

      if (error || !data) {
        // Usuario nuevo sin registro — crear plan Gratuito
        await supabase.from('subscription_plans').insert({
          user_id: user.id,
          plan_type: 'Gratuito',
          price: '0',
          status: 'active',
        });
        setPlan(defaultPlan);
      } else {
        setPlan({
          planType: data.plan_type as PlanType,
          status: data.status as PlanStatus,
          trialEndsAt: data.trial_ends_at,
          price: data.price,
        });
      }
    } catch (e) {
      console.error('[PlanContext] Error loading plan:', e);
      setPlan(defaultPlan);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlan();
  }, [user]);

  // Computed values
  const isGratuito = plan.planType === 'Gratuito';
  const isBasico = plan.planType === 'Básico';
  const isPremium = plan.planType === 'Premium';

  const daysLeftInTrial = plan.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(plan.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  const isTrialActive = plan.status === 'trial' && daysLeftInTrial > 0;

  // Feature flags
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
      refreshPlan: loadPlan,
    }}>
      {children}
    </PlanContext.Provider>
  );
}

export const usePlan = () => useContext(PlanContext);
