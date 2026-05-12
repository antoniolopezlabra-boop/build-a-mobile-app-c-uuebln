import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

// ══════════════════════════════════════════════════════════════════════
// InsightsCard — Recomendaciones accionables rule-based (sin LLM)
//
// Diseño:
//   ┌─────────────────────────────────────────┐
//   │ ⚡ Insights de tu negocio                │
//   │                                          │
//   │ ┃ Tu mejor día es viernes               │
//   │ ┃ 32% de los ingresos del mes      →    │
//   │                                          │
//   │ ┃ Horario muerto: 14h-16h               │
//   │ ┃ Considera promociones ese rango  →    │
//   │                                          │
//   │ ┃ 8 clientes inactivos 60+ días         │
//   │ ┃ Reactivar con campaña            →    │
//   └─────────────────────────────────────────┘
//
// Cada insight:
//   - Tiene un acento de color a la izquierda (verde/ámbar/azul/morado)
//   - Es tappable y ejecuta una acción concreta (navegación)
//   - El fondo es un overlay sutil del color de acento
//
// Reglas de cálculo viven en el componente padre (reports.tsx) que pasa
// un array de Insight ya procesados. Este componente solo renderiza.
// ══════════════════════════════════════════════════════════════════════

export type InsightAccent = 'green' | 'amber' | 'blue' | 'purple' | 'rose';

export interface Insight {
  id: string;                // identificador único para el key
  accent: InsightAccent;     // color del acento lateral
  title: string;             // "Tu mejor día es viernes"
  subtitle: string;          // "32% de los ingresos del mes"
  onPress?: () => void;      // acción al tappear (opcional, si no se pasa el insight es informativo)
}

interface InsightsCardProps {
  insights: Insight[];
  // Tema
  surfaceColor: string;
  textColor: string;
  textMutedColor: string;
  borderColor: string;
  isDark: boolean;
}

// Mapa de colores por accent
const ACCENT_COLORS: Record<InsightAccent, { solid: string; bg: string; bgDark: string }> = {
  green:  { solid: '#10B981', bg: 'rgba(16,185,129,0.08)',  bgDark: 'rgba(16,185,129,0.12)' },
  amber:  { solid: '#F59E0B', bg: 'rgba(245,158,11,0.08)',  bgDark: 'rgba(245,158,11,0.12)' },
  blue:   { solid: '#6366F1', bg: 'rgba(99,102,241,0.08)',  bgDark: 'rgba(99,102,241,0.12)' },
  purple: { solid: '#A855F7', bg: 'rgba(168,85,247,0.08)',  bgDark: 'rgba(168,85,247,0.12)' },
  rose:   { solid: '#F472B6', bg: 'rgba(244,114,182,0.08)', bgDark: 'rgba(244,114,182,0.12)' },
};

export default function InsightsCard({
  insights,
  surfaceColor,
  textColor,
  textMutedColor,
  borderColor,
  isDark,
}: InsightsCardProps) {

  // Si no hay insights, no renderizamos nada (no mostramos card vacío)
  if (insights.length === 0) {
    return null;
  }

  return (
    <View style={[s.card, { backgroundColor: surfaceColor, borderColor }]}>
      {/* Header con ícono y título */}
      <View style={s.header}>
        <View style={s.headerIconWrap}>
          <MaterialIcons name="bolt" size={14} color="#F59E0B" />
        </View>
        <Text style={[s.title, { color: textColor }]}>Insights de tu negocio</Text>
      </View>

      {/* Lista de insights */}
      <View style={s.list}>
        {insights.map(insight => {
          const colors = ACCENT_COLORS[insight.accent];
          const bg = isDark ? colors.bgDark : colors.bg;
          const Wrapper: any = insight.onPress ? TouchableOpacity : View;
          const wrapperProps = insight.onPress ? { onPress: insight.onPress, activeOpacity: 0.75 } : {};

          return (
            <Wrapper
              key={insight.id}
              {...wrapperProps}
              style={[s.insightRow, { backgroundColor: bg }]}
            >
              {/* Barra lateral de acento */}
              <View style={[s.accentBar, { backgroundColor: colors.solid }]} />

              {/* Contenido: título + subtítulo */}
              <View style={s.insightContent}>
                <Text style={[s.insightTitle, { color: textColor }]} numberOfLines={2}>
                  {insight.title}
                </Text>
                <Text style={[s.insightSubtitle, { color: textMutedColor }]} numberOfLines={2}>
                  {insight.subtitle}
                </Text>
              </View>

              {/* Flecha si es tappable */}
              {insight.onPress && (
                <MaterialIcons name="chevron-right" size={18} color={colors.solid} />
              )}
            </Wrapper>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 0.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  headerIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: 'rgba(245,158,11,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
  },
  list: {
    gap: 8,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingRight: 10,
    borderRadius: 8,
    overflow: 'hidden',
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
    marginRight: 4,
  },
  insightContent: {
    flex: 1,
    gap: 1,
  },
  insightTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  insightSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
});
