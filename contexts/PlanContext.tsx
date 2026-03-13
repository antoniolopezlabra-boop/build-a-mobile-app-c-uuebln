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
  // Fix: loading inicia en true — nunca mostrar paywall antes de saber el plan real
  const [loading, setLoading] = useState(true);

  const loadPlan = async (userId: string) => {
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
          // Usuario nuevo — crear plan Gratuito
          await supabase.from('subscription_plans').insert({
            user_id: userId,
            plan_type: 'Gratuito',
            price: '0',
            status: 'active',
          });
          setPlan(defaultPlan);
        } else {
          console.warn('[PlanContext] Error al obtener plan:', error.message);
          setPlan(defaultPlan);
        }
        return;
      }

      if (!data) {
        setPlan(defaultPlan);
        return;
      }

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

  // Fix: dependencia por user?.id (string primitivo) en lugar de user (objeto)
  // Evita re-renders innecesarios y re-cargas del plan
  useEffect(() => {
    if (authLoading) return; // Esperar a que Auth termine antes de cargar plan
    if (!user?.id) {
      setPlan(defaultPlan);
      setLoading(false);
      return;
    }
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
