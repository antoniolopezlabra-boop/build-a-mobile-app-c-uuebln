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
  canUseWhatsApp: boolean;       // Básico+ — recordatorios salientes número VYLTA
  canOverlap: boolean;           // Premium — citas simultáneas
  canUseCollaborators: boolean;  // Premium
  canRunCampaigns: boolean;      // Premium — email marketing + reactivación
  canExportCSV: boolean;         // Premium
  canUseBookingLink: boolean;    // Básico+ — link público de citas
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

const ADMIN_USER_IDS = [
  '406d3777-edab-410c-8807-5d21228bb27b',
];

const PlanContext = createContext<PlanContextType>({} as PlanContextType);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [plan, setPlan] = useState<PlanData>(defaultPlan);
  const [loading, setLoading] = useState(true);
  const lastLoadedUserId = useRef<string | null>(null);

  const loadPlan = async (userId: string) => {
    if (ADMIN_USER_IDS.includes(userId)) {
      logger.log('[PlanContext] Admin user — skipping plan check');
      setPlan({ planType: 'Premium', status: 'active', trialEndsAt: null, price: '0' });
      setLoading(false);
      return;
    }
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

  // Permisos por plan — arquitectura simplificada Mar 2026
  const canSchedule         = isBasico || isPremium || isTrialActive;
  const canViewReports      = isBasico || isPremium || isTrialActive;
  const canUseWhatsApp      = isBasico || isPremium || isTrialActive; // recordatorios salientes
  const canOverlap          = isPremium;   // citas simultáneas
  const canUseCollaborators = isPremium;
  const canRunCampaigns     = isPremium;   // email marketing + reactivación inactivos
  const canExportCSV        = isPremium;
  const canUseBookingLink   = isBasico || isPremium || isTrialActive;

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
