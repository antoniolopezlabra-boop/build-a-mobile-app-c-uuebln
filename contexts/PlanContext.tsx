import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { logger } from '@/utils/logger';

export type PlanType = 'Gratuito' | 'Básico' | 'Basico' | 'Premium' | 'VipBasico' | 'VipPremium';
export type PlanStatus = 'active' | 'trial' | 'expired' | 'cancelled';
export type BillingCycle = 'monthly' | 'annual';

interface PlanData {
  planType: string;
  status: PlanStatus;
  trialEndsAt: string | null;
  price: string;
  // ─── Campos VIP (May 2026) ───────────────────────
  billingCycle: BillingCycle;
  isVip: boolean;
  vipExpiresAt: string | null;
  onboardingCallScheduledAt: string | null;
  onboardingCompletedAt: string | null;
}

interface PlanContextType {
  plan: PlanData;
  loading: boolean;
  // Permisos por feature
  canSchedule: boolean;
  canViewReports: boolean;
  canUseWhatsApp: boolean;
  canOverlap: boolean;
  canUseCollaborators: boolean;
  canRunCampaigns: boolean;
  canExportCSV: boolean;
  canUseBookingLink: boolean;
  // Flags de plan (compat con código existente)
  isGratuito: boolean;
  isBasico: boolean;
  isPremium: boolean;
  // Flags VIP (nuevos)
  isVip: boolean;
  isVipBasico: boolean;
  isVipPremium: boolean;
  // El plan VIP equivale a su contraparte mensual para permisos
  // (isPaidPlan = tiene cualquier plan pagado, sea mensual o anual)
  isPaidPlan: boolean;
  daysUntilVipExpiry: number | null;
  hasScheduledOnboarding: boolean;
  // Trial
  isTrialActive: boolean;
  daysLeftInTrial: number;
  refreshPlan: () => Promise<void>;
}

const defaultPlan: PlanData = {
  planType: 'Gratuito',
  status: 'active',
  trialEndsAt: null,
  price: '0',
  billingCycle: 'monthly',
  isVip: false,
  vipExpiresAt: null,
  onboardingCallScheduledAt: null,
  onboardingCompletedAt: null,
};

function normalizePlanType(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (lower === 'basico' || lower === 'básico') return 'Basico';
  if (lower === 'premium') return 'Premium';
  if (lower === 'vipbasico' || lower === 'vip_basico' || lower === 'vipbásico') return 'VipBasico';
  if (lower === 'vippremium' || lower === 'vip_premium') return 'VipPremium';
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
        .select('plan_type, status, trial_ends_at, price, billing_cycle, is_vip, vip_expires_at, onboarding_call_scheduled_at, onboarding_completed_at')
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
      logger.log('[PlanContext] Plan loaded:', normalized, '| status:', data.status, '| vip:', data.is_vip);
      setPlan({
        planType: normalized,
        status: data.status as PlanStatus,
        trialEndsAt: data.trial_ends_at,
        price: data.price,
        billingCycle: (data.billing_cycle as BillingCycle) || 'monthly',
        isVip: !!data.is_vip,
        vipExpiresAt: data.vip_expires_at,
        onboardingCallScheduledAt: data.onboarding_call_scheduled_at,
        onboardingCompletedAt: data.onboarding_completed_at,
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

  // ─── Plan derivados básicos ───────────────────────
  const isGratuito = plan.planType === 'Gratuito';
  const isVipBasico  = plan.planType === 'VipBasico';
  const isVipPremium = plan.planType === 'VipPremium';
  const isVip = plan.isVip || isVipBasico || isVipPremium;

  // IMPORTANTE: VipBasico tiene los MISMOS permisos que Basico (Premium mensual)
  //             VipPremium tiene los MISMOS permisos que Premium (Luxury mensual)
  // Por eso isBasico y isPremium consideran sus equivalentes VIP.
  const isBasico  = plan.planType === 'Basico' || plan.planType === 'Básico' || isVipBasico;
  const isPremium = plan.planType === 'Premium' || isVipPremium;

  const isPaidPlan = !isGratuito;

  // ─── Trial ───────────────────────
  const daysLeftInTrial = plan.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(plan.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  const isTrialActive = plan.status === 'trial' && daysLeftInTrial > 0;

  // ─── VIP expiry tracking ───────────────────────
  const daysUntilVipExpiry = plan.vipExpiresAt
    ? Math.max(0, Math.ceil((new Date(plan.vipExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const hasScheduledOnboarding = !!plan.onboardingCallScheduledAt;

  // ══════════════════════════════════════════════════════════
  // Permisos por plan — rebranding visual Abr 2026 (Camino A)
  // Los NOMBRES INTERNOS siguen igual (Gratuito/Basico/Premium)
  // pero ahora Gratuito tiene acceso a más funciones, limitado a 10 citas/mes
  // (límite enforced server-side en create-booking-request + apiPost /appointments)
  //
  // Los VIP heredan los permisos de su contraparte mensual (ya integrado en
  // isBasico / isPremium arriba), pero además tienen flags adicionales para
  // mostrar widgets premium en la UI.
  // ══════════════════════════════════════════════════════════
  const canSchedule         = true;
  const canUseWhatsApp      = true;
  const canUseBookingLink   = true;
  const canViewReports      = isBasico || isPremium || isTrialActive;
  // ⚡ Citas simultáneas (empalme): habilitado para Premium (Basico) y Luxury
  // (Premium), más sus equivalentes VIP. Gratuito NO. isBasico ya incluye
  // VipBasico e isPremium ya incluye VipPremium, así que esto cubre los 4
  // planes pagados. El segundo gate real (toggle allow_overlapping ON +
  // validación server-side en utils/api.ts) sigue aplicando.
  const canOverlap          = isBasico || isPremium;
  const canUseCollaborators = isPremium;
  const canRunCampaigns     = isPremium;
  const canExportCSV        = isPremium;

  return (
    <PlanContext.Provider value={{
      plan, loading,
      canSchedule, canViewReports, canUseWhatsApp,
      canOverlap, canUseCollaborators,
      canRunCampaigns, canExportCSV, canUseBookingLink,
      isGratuito, isBasico, isPremium,
      isVip, isVipBasico, isVipPremium, isPaidPlan,
      daysUntilVipExpiry, hasScheduledOnboarding,
      isTrialActive, daysLeftInTrial,
      refreshPlan: () => user?.id ? loadPlan(user.id) : Promise.resolve(),
    }}>
      {children}
    </PlanContext.Provider>
  );
}

export const usePlan = () => useContext(PlanContext);
