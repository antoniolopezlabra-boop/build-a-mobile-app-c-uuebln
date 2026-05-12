import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

// ══════════════════════════════════════════════════════════════════════
// DonutChartCard — Donut con leyenda lateral para "Ingresos por servicio"
//
// ── AJUSTE TIPOGRÁFICO MAY 2026 ──
// Subidos los tamaños para sinergia con resto de app:
//   - title 13px → 15px
//   - rangePillText 10px → 11px
//   - legendName/legendAmount 9-10px → 12-13px
//   - legendPercent 9px → 12px
//   - moreText 10px → 11px
//   - SVG center value 9px → 11px
// Donut también más grande: 88px → 110px para acomodar el nuevo tamaño
// ══════════════════════════════════════════════════════════════════════

export interface ServiceSlice {
  name: string;
  amount: number;
  color: string;
}

interface DonutChartCardProps {
  title: string;
  totalLabel: string;
  totalValue: string;
  data: ServiceSlice[];
  rangeLabel?: string;
  surfaceColor: string;
  textColor: string;
  textMutedColor: string;
  borderColor: string;
  isDark: boolean;
}

const DONUT_SIZE = 110;
const STROKE_WIDTH = 16;
const RADIUS = (DONUT_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

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

  const trackColor = isDark ? '#0F172A' : '#F1F5F9';

  return (
    <View style={[s.card, { backgroundColor: surfaceColor, borderColor }]}>
      <View style={s.header}>
        <Text style={[s.title, { color: textColor }]}>{title}</Text>
        <View style={[s.rangePill, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor }]}>
          <Text style={[s.rangePillText, { color: textMutedColor }]}>{rangeLabel}</Text>
        </View>
      </View>

      {hasData ? (
        <View style={s.contentRow}>
          <View style={s.donutWrap}>
            <Svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}>
              <Circle
                cx={DONUT_SIZE / 2}
                cy={DONUT_SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={trackColor}
                strokeWidth={STROKE_WIDTH}
              />

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
                  transform={`rotate(-90 ${DONUT_SIZE / 2} ${DONUT_SIZE / 2})`}
                />
              ))}

              <SvgText
                x={DONUT_SIZE / 2}
                y={DONUT_SIZE / 2 - 2}
                fill={textColor}
                fontSize="12"
                fontWeight="700"
                textAnchor="middle"
              >
                {totalValue}
              </SvgText>
              <SvgText
                x={DONUT_SIZE / 2}
                y={DONUT_SIZE / 2 + 12}
                fill={textMutedColor}
                fontSize="9"
                textAnchor="middle"
              >
                {totalLabel}
              </SvgText>
            </Svg>
          </View>

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
          <MaterialIcons name="donut-large" size={36} color={textMutedColor} />
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
    padding: 16,
    borderWidth: 0.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  rangePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 0.5,
  },
  rangePillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  donutWrap: {
    flexShrink: 0,
  },
  legend: {
    flex: 1,
    gap: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  legendName: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  legendPercent: {
    fontSize: 13,
    fontWeight: '800',
    minWidth: 36,
    textAlign: 'right',
  },
  moreText: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
