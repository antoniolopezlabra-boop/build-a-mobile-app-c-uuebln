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
// Comportamiento:
//   - Si change > 0 → flecha arriba + texto verde
//   - Si change < 0 → flecha abajo + texto rojo
//   - Si change === 0 o null → guion + texto gris
//   - Si touchable === true → se puede tocar (cursor pointer, opacidad al press)
// ══════════════════════════════════════════════════════════════════════

interface KPICardProps {
  label: string;
  value: string;             // ya formateado (ej: "$45,250", "127", "$356")
  icon: keyof typeof MaterialIcons.glyphMap;
  iconColor: string;         // color del ícono (ej: "#10B981")
  iconBg?: string;           // fondo del círculo del ícono — calculado auto si no se pasa
  change: number | null;     // % de variación vs período anterior; null = no comparar
  comparisonLabel?: string;  // "vs ant.", "vs mes ant.", etc. Default: "vs ant."
  onPress?: () => void;      // si se pasa, la card es touchable
  // Modo oscuro/claro
  surfaceColor: string;      // bg de la card (ej: tc.surface)
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
  // Calcular el fondo del ícono si no se pasó: usar el mismo color con 15% opacidad
  // Convierte "#10B981" → "rgba(16,185,129,0.15)" — útil para mantener consistencia visual
  const computedIconBg = iconBg || hexToRgba(iconColor, 0.15);

  // Determinar color y flecha del badge de variación
  const isPositive   = change !== null && change > 0;
  const isNegative   = change !== null && change < 0;
  const isFlat       = change !== null && change === 0;

  const changeColor =
    isPositive ? '#10B981' :
    isNegative ? '#EF4444' :
    '#94A3B8'; // flat o null

  const changeIcon: keyof typeof MaterialIcons.glyphMap =
    isPositive ? 'trending-up' :
    isNegative ? 'trending-down' :
    'trending-flat';

  // Texto del badge: "18%" o "-12%" o "0%" o "—"
  const changeText =
    change === null      ? '—' :
    change === 0         ? '0%' :
    change > 0           ? `${Math.round(change)}%` :
                           `${Math.round(change)}%`;  // ya viene con el menos

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
      {/* Header: label + ícono */}
      <View style={s.header}>
        <Text
          style={[s.label, { color: textMutedColor }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {label}
        </Text>
        <View style={[s.iconWrap, { backgroundColor: computedIconBg }]}>
          <MaterialIcons name={icon} size={14} color={iconColor} />
        </View>
      </View>

      {/* Valor principal */}
      <Text style={[s.value, { color: textColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>

      {/* Badge de variación */}
      <View style={s.changeRow}>
        <MaterialIcons name={changeIcon} size={11} color={changeColor} />
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

// ── Helpers ──

function hexToRgba(hex: string, alpha: number): string {
  // Convierte "#10B981" a "rgba(16,185,129,0.15)" para fondos suaves
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
    padding: 12,
    borderWidth: 0.5,
    minHeight: 92,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    flex: 1,
    marginRight: 6,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  value: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginVertical: 2,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  changeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  changeLabel: {
    fontSize: 10,
    fontWeight: '500',
    flex: 1,
  },
});
