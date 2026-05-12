import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

// ══════════════════════════════════════════════════════════════════════
// InsightsCard — Recomendaciones accionables rule-based (sin LLM)
//
// ── AJUSTE TIPOGRÁFICO MAY 2026 ──
// Subidos los tamaños para sinergia con resto de app:
//   - header title 13px → 15px (alineado con resto de cards)
//   - insightTitle 12px → 14px
//   - insightSubtitle 11px → 12px
//   - barra de acento 3px → 4px (más visible)
//   - padding interno 8px → 12px (más respiración)
// ══════════════════════════════════════════════════════════════════════

export type InsightAccent = 'green' | 'amber' | 'blue' | 'purple' | 'rose';

export interface Insight {
  id: string;
  accent: InsightAccent;
  title: string;
  subtitle: string;
  onPress?: () => void;
}

interface InsightsCardProps {
  insights: Insight[];
  surfaceColor: string;
  textColor: string;
  textMutedColor: string;
  borderColor: string;
  isDark: boolean;
}

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

  if (insights.length === 0) {
    return null;
  }

  return (
    <View style={[s.card, { backgroundColor: surfaceColor, borderColor }]}>
      <View style={s.header}>
        <View style={s.headerIconWrap}>
          <MaterialIcons name="bolt" size={16} color="#F59E0B" />
        </View>
        <Text style={[s.title, { color: textColor }]}>Insights de tu negocio</Text>
      </View>

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
              <View style={[s.accentBar, { backgroundColor: colors.solid }]} />

              <View style={s.insightContent}>
                <Text style={[s.insightTitle, { color: textColor }]} numberOfLines={2}>
                  {insight.title}
                </Text>
                <Text style={[s.insightSubtitle, { color: textMutedColor }]} numberOfLines={2}>
                  {insight.subtitle}
                </Text>
              </View>

              {insight.onPress && (
                <MaterialIcons name="chevron-right" size={20} color={colors.solid} />
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
    padding: 16,
    borderWidth: 0.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  headerIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(245,158,11,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  list: {
    gap: 10,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingRight: 12,
    borderRadius: 10,
    overflow: 'hidden',
  },
  accentBar: {
    width: 4,
    alignSelf: 'stretch',
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
    marginRight: 6,
  },
  insightContent: {
    flex: 1,
    gap: 2,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  insightSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
});
