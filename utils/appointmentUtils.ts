// Utilidades compartidas para citas — evita duplicación en 4+ archivos

export const STATUS_COLORS: Record<string, string> = {
  'Confirmada': '#10B981',
  'Pendiente':  '#F59E0B',
  'Cancelada':  '#EF4444',
  'Completada': '#6B7280',
  'Pagado':     '#10B981',
  'No asistió': '#F97316',
  'Reagendada': '#3B82F6',
  'En espera':  '#8B5CF6',
};

export const STATUS_BG: Record<string, string> = {
  'Confirmada': '#ECFDF5',
  'Pendiente':  '#FFFBEB',
  'Cancelada':  '#FEF2F2',
  'Completada': '#F9FAFB',
  'Pagado':     '#ECFDF5',
  'No asistió': '#FFF7ED',
  'Reagendada': '#EFF6FF',
  'En espera':  '#F5F3FF',
};

export const STATUS_LABELS: Record<string, string> = {
  'Confirmada': 'Confirmada',
  'Pendiente':  'Pendiente',
  'Cancelada':  'Cancelada',
  'Completada': 'Completada',
  'Pagado':     'Pagado',
  'No asistió': 'No asistió',
  'Reagendada': 'Reagendada',
  'En espera':  'En espera',
};

export function getStatusColor(status: string): string {
  return STATUS_COLORS[status] ?? '#94A3B8';
}

export function getStatusBg(status: string): string {
  return STATUS_BG[status] ?? '#F8FAFC';
}

// Constantes de plan para evitar strings hardcodeados
export const PLAN = {
  GRATUITO: 'Gratuito',
  BASICO: 'Basico',
  BASICO_ACCENT: 'Básico',
  PREMIUM: 'Premium',
} as const;

export type PlanType = typeof PLAN[keyof typeof PLAN];
