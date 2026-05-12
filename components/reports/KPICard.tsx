import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

// ══════════════════════════════════════════════════════════════════════
// KPICard — Componente ejecutivo para el dashboard de Reportes
//
// Diseño basado en mockups de dashboards de Stripe/Bloomberg:
//   ┌────────────────────────┐
//   │ LABEL          [icono] │   ← label arriba izquierda, ícono en círculo
//   │ $45,250                │   ← valor grande
//   │ ↑ 18% vs ant.          │   ← variación con flecha y color semántico
//   └────────────────────────┘
//
// ── AJUSTE TIPOGRÁFICO MAY 2026 ──
// Antoniob reportó que los tamaños de letra eran ligeramente más chicos
// que el resto de la app, rompiendo la sinergia visual. Comparado contra
// clients.tsx (que es la pestaña referencia):
//   - label 10px → 11px
//   - value 18px → 22px (alineado con headerStatNum=20)
//   - changeText 10px → 12px
// ══════════════════════════════════════════════════════════════════════

interface KPICardProps {
  label: string;
  value: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  iconColor: string;
  iconBg?: string;
  change: number | null;
  comparisonLabel?: string;
  onPress?: () => void;
  surfaceColor: string;
  textColor: string;
  textMutedColor: string;
  borderColor: string;
}

export default function KPICard({
  label,
  value,
  icon,
  iconColor,
  iconBg,
  change,
  comparisonLabel = 'vs ant.',
  onPress,
  surfaceColor,
  textColor,
  textMutedColor,
  borderColor,
}: KPICardProps) {
  const computedIconBg = iconBg || hexToRgba(iconColor, 0.15);

  const isPositive   = change !== null && change > 0;
  const isNegative   = change !== null && change < 0;

  const changeColor =
    isPositive ? '#10B981' :
    isNegative ? '#EF4444' :
    '#94A3B8';

  const changeIcon: keyof typeof MaterialIcons.glyphMap =
    isPositive ? 'trending-up' :
    isNegative ? 'trending-down' :
    'trending-flat';

  const changeText =
    change === null      ? '—' :
    change === 0         ? '0%' :
    change > 0           ? `${Math.round(change)}%` :
                           `${Math.round(change)}%`;

  const Wrapper: any = onPress ? TouchableOpacity : View;
  const wrapperProps = onPress ? { onPress, activeOpacity: 0.75 } : {};

  return (
    <Wrapper
      {...wrapperProps}
      style={[
        s.card,
        { backgroundColor: surfaceColor, borderColor },
      ]}
    >
      <View style={s.header}>
        <Text
          style={[s.label, { color: textMutedColor }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {label}
        </Text>
        <View style={[s.iconWrap, { backgroundColor: computedIconBg }]}>
          <MaterialIcons name={icon} size={16} color={iconColor} />
        </View>
      </View>

      <Text style={[s.value, { color: textColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>

      <View style={s.changeRow}>
        <MaterialIcons name={changeIcon} size={13} color={changeColor} />
        <Text style={[s.changeText, { color: changeColor }]}>
          {changeText}
        </Text>
        <Text style={[s.changeLabel, { color: textMutedColor }]} numberOfLines={1}>
          {comparisonLabel}
        </Text>
      </View>
    </Wrapper>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const s = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    borderWidth: 0.5,
    minHeight: 104,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    flex: 1,
    marginRight: 6,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginVertical: 3,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  changeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  changeLabel: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
    marginLeft: 1,
  },
});
