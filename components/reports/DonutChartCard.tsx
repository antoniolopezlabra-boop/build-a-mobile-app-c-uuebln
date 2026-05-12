import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

// ══════════════════════════════════════════════════════════════════════
// DonutChartCard — Donut con leyenda lateral para "Ingresos por servicio"
//
// Diseño:
//   ┌─────────────────────────────────────────┐
//   │ Ingresos por servicio    [Mes ▾]        │
//   │                                         │
//   │      ⬤⬤⬤      ⬤ Corte    $18,500 41% │
//   │     ⬤   ⬤      ⬤ Manicure $12,300 27% │
//   │     ⬤   ⬤      ⬤ Color    $9,500  21% │
//   │      ⬤⬤⬤      ⬤ Otros    $4,950  11% │
//   └─────────────────────────────────────────┘
//
// Implementación con SVG nativo usando stroke-dasharray para los arcos.
// ══════════════════════════════════════════════════════════════════════

export interface ServiceSlice {
  name: string;
  amount: number;
  color: string;
}

interface DonutChartCardProps {
  title: string;
  totalLabel: string;       // "Total" — texto al centro del donut
  totalValue: string;       // "$45,250" — valor al centro
  data: ServiceSlice[];     // ordenado de mayor a menor
  rangeLabel?: string;      // "Mes actual" en el pill
  // Tema
  surfaceColor: string;
  textColor: string;
  textMutedColor: string;
  borderColor: string;
  isDark: boolean;
}

const DONUT_SIZE = 100;
const STROKE_WIDTH = 14;
const RADIUS = (DONUT_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Colores rotativos para los slices (en caso de que el caller no pase colores)
const DEFAULT_COLORS = ['#10B981', '#6366F1', '#F59E0B', '#F472B6', '#3B82F6', '#A855F7', '#14B8A6'];

export default function DonutChartCard({
  title,
  totalLabel,
  totalValue,
  data,
  rangeLabel = 'Este mes',
  surfaceColor,
  textColor,
  textMutedColor,
  borderColor,
  isDark,
}: DonutChartCardProps) {

  const total = data.reduce((s, d) => s + d.amount, 0);
  const hasData = total > 0 && data.length > 0;

  // ── Calcular slices y porcentajes ──
  // Cada slice tiene:
  //   - dashLength: longitud del arco en unidades SVG (proporcional al monto)
  //   - dashOffset: offset acumulado para empezar después del anterior
  //   - percent: % para mostrar en la leyenda
  let cumulativeOffset = 0;
  const slices = data.map((d, idx) => {
    const percent = total > 0 ? (d.amount / total) * 100 : 0;
    const dashLength = (d.amount / total) * CIRCUMFERENCE;
    const dashOffset = -cumulativeOffset;
    cumulativeOffset += dashLength;
    return {
      ...d,
      color: d.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
      percent: Math.round(percent),
      dashLength,
      dashOffset,
    };
  });

  // Color del track (anillo de fondo)
  const trackColor = isDark ? '#0F172A' : '#F1F5F9';

  return (
    <View style={[s.card, { backgroundColor: surfaceColor, borderColor }]}>
      {/* Header con título y pill */}
      <View style={s.header}>
        <Text style={[s.title, { color: textColor }]}>{title}</Text>
        <View style={[s.rangePill, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor }]}>
          <Text style={[s.rangePillText, { color: textMutedColor }]}>{rangeLabel}</Text>
        </View>
      </View>

      {hasData ? (
        <View style={s.contentRow}>
          {/* Donut SVG */}
          <View style={s.donutWrap}>
            <Svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}>
              {/* Track de fondo */}
              <Circle
                cx={DONUT_SIZE / 2}
                cy={DONUT_SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={trackColor}
                strokeWidth={STROKE_WIDTH}
              />

              {/* Slices */}
              {slices.map((slice, idx) => (
                <Circle
                  key={`slice-${idx}`}
                  cx={DONUT_SIZE / 2}
                  cy={DONUT_SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={STROKE_WIDTH}
                  strokeDasharray={`${slice.dashLength} ${CIRCUMFERENCE}`}
                  strokeDashoffset={slice.dashOffset}
                  // Rotar -90deg para que empiece arriba (12 en punto)
                  transform={`rotate(-90 ${DONUT_SIZE / 2} ${DONUT_SIZE / 2})`}
                />
              ))}

              {/* Texto centro: total + label */}
              <SvgText
                x={DONUT_SIZE / 2}
                y={DONUT_SIZE / 2 - 2}
                fill={textColor}
                fontSize="11"
                fontWeight="700"
                textAnchor="middle"
              >
                {totalValue}
              </SvgText>
              <SvgText
                x={DONUT_SIZE / 2}
                y={DONUT_SIZE / 2 + 10}
                fill={textMutedColor}
                fontSize="8"
                textAnchor="middle"
              >
                {totalLabel}
              </SvgText>
            </Svg>
          </View>

          {/* Leyenda lateral */}
          <View style={s.legend}>
            {slices.slice(0, 5).map((slice, idx) => (
              <View key={`legend-${idx}`} style={s.legendRow}>
                <View style={[s.legendDot, { backgroundColor: slice.color }]} />
                <Text
                  style={[s.legendName, { color: textColor }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {slice.name}
                </Text>
                <Text style={[s.legendAmount, { color: textMutedColor }]}>
                  ${slice.amount.toLocaleString('es-MX')}
                </Text>
                <Text style={[s.legendPercent, { color: slice.color }]}>
                  {slice.percent}%
                </Text>
              </View>
            ))}
            {slices.length > 5 && (
              <Text style={[s.moreText, { color: textMutedColor }]}>
                + {slices.length - 5} servicios más
              </Text>
            )}
          </View>
        </View>
      ) : (
        <View style={s.emptyWrap}>
          <MaterialIcons name="donut-large" size={32} color={textMutedColor} />
          <Text style={[s.emptyText, { color: textMutedColor }]}>
            Sin servicios cobrados aún{'\n'}para este período.
          </Text>
        </View>
      )}
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
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
  },
  rangePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 0.5,
  },
  rangePillText: {
    fontSize: 10,
    fontWeight: '600',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  donutWrap: {
    flexShrink: 0,
  },
  legend: {
    flex: 1,
    gap: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  legendName: {
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },
  legendAmount: {
    fontSize: 10,
    fontWeight: '500',
    minWidth: 56,
    textAlign: 'right',
  },
  legendPercent: {
    fontSize: 11,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'right',
  },
  moreText: {
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 2,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
});
