import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Line, Circle, Rect, Text as SvgText } from 'react-native-svg';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

// ══════════════════════════════════════════════════════════════════════
// LineChartCard — Gráfica de línea ejecutiva con SVG nativo
//
// Diseño basado en mockups de dashboards Bloomberg/Stripe:
//   ┌────────────────────────────────────────┐
//   │ Ingresos              [Semana ▾]      │
//   │ $45,250  ↑ 18% vs anterior             │
//   │                                        │
//   │  5K┤            ╭─●──╮                 │
//   │  4K┤      ╭────╯     ╰─╮                │
//   │  3K┤  ╭──╯              ╰─╮            │
//   │  2K┤─╯                     ╰─          │
//   │  1K┤                                    │
//   │     L  M  M  J  V  S  D                 │
//   └────────────────────────────────────────┘
//
// Implementación:
//   - SVG nativo de React Native (sin librerías pesadas)
//   - Curva Bezier suavizada usando interpolación catmull-rom
//   - Área degradada bajo la línea
//   - Tooltip flotante sobre el punto más alto (o más reciente con datos)
// ══════════════════════════════════════════════════════════════════════

interface DataPoint {
  label: string;   // "Lun", "Mar", etc.
  value: number;   // monto del día
}

interface LineChartCardProps {
  title: string;            // "Ingresos"
  totalValue: string;       // "$45,250" — ya formateado
  changePercent: number | null; // % vs anterior
  changeLabel?: string;     // "vs semana pasada"
  data: DataPoint[];        // array de 7 puntos (semana) — orden cronológico
  rangeLabel?: string;      // "Esta semana" — texto del selector
  // Tema
  surfaceColor: string;
  textColor: string;
  textMutedColor: string;
  borderColor: string;
  isDark: boolean;
}

const CHART_HEIGHT = 130;
const CHART_PADDING_LEFT = 24;     // espacio para eje Y
const CHART_PADDING_RIGHT = 8;
const CHART_PADDING_TOP = 18;      // espacio para tooltip
const CHART_PADDING_BOTTOM = 22;   // espacio para labels eje X
const VIEWBOX_WIDTH = 320;

// Helper: formatear valor del eje Y (1500 → "1.5K", 1500000 → "1.5M")
function formatAxisValue(v: number): string {
  if (v === 0) return '0';
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${Math.round(v / 1000)}K`;
  return `${v}`;
}

// Helper: construir path SVG de línea suavizada con curvas Bezier
// Usa interpolación Catmull-Rom simplificada para curvas suaves
function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    // Control points para Catmull-Rom (tensión 0.5 = curva suave estándar)
    const tension = 0.2;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return path;
}

export default function LineChartCard({
  title,
  totalValue,
  changePercent,
  changeLabel = 'vs anterior',
  data,
  rangeLabel = 'Esta semana',
  surfaceColor,
  textColor,
  textMutedColor,
  borderColor,
  isDark,
}: LineChartCardProps) {

  // ── Cálculo del rango Y para el chart ──
  // Si todos los valores son 0, usamos un rango fijo de 0 a 100 para evitar
  // división por cero. Si hay datos, padding del 10% arriba para que la
  // curva no toque el techo.
  const values = data.map(d => d.value);
  const maxVal = Math.max(...values, 1); // mínimo 1 para evitar 0
  const yMax = maxVal * 1.15; // 15% extra arriba para "respiración" visual
  const yMin = 0;

  // ── Convertir datos a coordenadas SVG ──
  const chartWidth = VIEWBOX_WIDTH - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
  const chartHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
  const xStep = data.length > 1 ? chartWidth / (data.length - 1) : 0;

  const points = data.map((d, i) => ({
    x: CHART_PADDING_LEFT + i * xStep,
    y: CHART_PADDING_TOP + (1 - (d.value - yMin) / (yMax - yMin)) * chartHeight,
    label: d.label,
    value: d.value,
  }));

  // ── Línea suavizada y área ──
  const linePath = buildSmoothPath(points);
  const areaPath = linePath
    + ` L ${points[points.length - 1]?.x ?? 0} ${CHART_HEIGHT - CHART_PADDING_BOTTOM}`
    + ` L ${points[0]?.x ?? 0} ${CHART_HEIGHT - CHART_PADDING_BOTTOM} Z`;

  // ── Encontrar punto destacado: el de mayor valor ──
  // Si todos son 0, no resaltamos ninguno
  const highlightIdx = maxVal > 1
    ? values.indexOf(Math.max(...values))
    : -1;
  const highlightPoint = highlightIdx >= 0 ? points[highlightIdx] : null;

  // ── Gridlines (5 horizontales) ──
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    y: CHART_PADDING_TOP + t * chartHeight,
    value: yMax - t * (yMax - yMin),
  }));

  // ── Colores ──
  const lineColor = '#10B981';
  const gridColor = isDark ? '#1E293B' : '#F1F5F9';
  const axisLabelColor = isDark ? '#475569' : '#94A3B8';

  // ── Texto del cambio % ──
  const isPositive = changePercent !== null && changePercent > 0;
  const isNegative = changePercent !== null && changePercent < 0;
  const changeColor = isPositive ? '#10B981' : isNegative ? '#EF4444' : '#94A3B8';
  const changeIcon = isPositive ? 'trending-up' : isNegative ? 'trending-down' : 'trending-flat';
  const changeText = changePercent === null ? '—'
    : `${changePercent > 0 ? '+' : ''}${Math.round(changePercent)}%`;

  // Si no hay datos suficientes, mostrar estado vacío
  const hasData = data.some(d => d.value > 0);

  return (
    <View style={[s.card, { backgroundColor: surfaceColor, borderColor }]}>
      {/* Header con título y selector */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: textColor }]}>{title}</Text>
        </View>
        <View style={[s.rangePill, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor }]}>
          <Text style={[s.rangePillText, { color: textMutedColor }]}>{rangeLabel}</Text>
        </View>
      </View>

      {/* Valor total + cambio % */}
      <Text style={[s.totalValue, { color: textColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {totalValue}
      </Text>
      <View style={s.changeRow}>
        <MaterialIcons name={changeIcon} size={12} color={changeColor} />
        <Text style={[s.changeText, { color: changeColor }]}>{changeText}</Text>
        <Text style={[s.changeLabel, { color: textMutedColor }]}>{changeLabel}</Text>
      </View>

      {/* Chart SVG o empty state */}
      {hasData ? (
        <Svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${CHART_HEIGHT}`} width="100%" height={CHART_HEIGHT} style={{ marginTop: 8 }}>
          <Defs>
            <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={lineColor} stopOpacity="0.35" />
              <Stop offset="1" stopColor={lineColor} stopOpacity="0" />
            </LinearGradient>
          </Defs>

          {/* Gridlines horizontales + labels eje Y */}
          {gridLines.map((g, i) => (
            <React.Fragment key={`grid-${i}`}>
              <Line
                x1={CHART_PADDING_LEFT}
                x2={VIEWBOX_WIDTH - CHART_PADDING_RIGHT}
                y1={g.y}
                y2={g.y}
                stroke={gridColor}
                strokeWidth="0.5"
              />
              <SvgText
                x={CHART_PADDING_LEFT - 4}
                y={g.y + 3}
                fill={axisLabelColor}
                fontSize="8"
                textAnchor="end"
              >
                {formatAxisValue(g.value)}
              </SvgText>
            </React.Fragment>
          ))}

          {/* Área degradada */}
          <Path d={areaPath} fill="url(#areaGrad)" />

          {/* Línea suavizada */}
          <Path
            d={linePath}
            stroke={lineColor}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Línea vertical punteada hacia el punto destacado */}
          {highlightPoint && (
            <Line
              x1={highlightPoint.x}
              x2={highlightPoint.x}
              y1={highlightPoint.y}
              y2={CHART_HEIGHT - CHART_PADDING_BOTTOM}
              stroke={lineColor}
              strokeWidth="0.5"
              strokeDasharray="2 2"
              opacity="0.5"
            />
          )}

          {/* Punto destacado */}
          {highlightPoint && (
            <Circle
              cx={highlightPoint.x}
              cy={highlightPoint.y}
              r="4"
              fill={surfaceColor}
              stroke={lineColor}
              strokeWidth="2"
            />
          )}

          {/* Tooltip sobre el punto destacado */}
          {highlightPoint && (
            <>
              <Rect
                x={Math.max(CHART_PADDING_LEFT, Math.min(highlightPoint.x - 32, VIEWBOX_WIDTH - 72))}
                y={Math.max(2, highlightPoint.y - 22)}
                width="64"
                height="18"
                rx="5"
                fill={isDark ? '#0F172A' : '#0F172A'}
              />
              <SvgText
                x={Math.max(CHART_PADDING_LEFT + 32, Math.min(highlightPoint.x, VIEWBOX_WIDTH - 40))}
                y={Math.max(14, highlightPoint.y - 10)}
                fill="#10B981"
                fontSize="9"
                fontWeight="700"
                textAnchor="middle"
              >
                {formatAxisValue(highlightPoint.value)}
              </SvgText>
            </>
          )}

          {/* Labels eje X (Lun, Mar, etc.) */}
          {points.map((p, i) => (
            <SvgText
              key={`xlabel-${i}`}
              x={p.x}
              y={CHART_HEIGHT - 6}
              fill={axisLabelColor}
              fontSize="9"
              textAnchor="middle"
            >
              {p.label}
            </SvgText>
          ))}
        </Svg>
      ) : (
        <View style={s.emptyChart}>
          <MaterialIcons name="show-chart" size={32} color={textMutedColor} />
          <Text style={[s.emptyChartText, { color: textMutedColor }]}>
            Sin movimiento aún{'\n'}para este período.
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
    marginBottom: 6,
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
  totalValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  changeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  changeLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginLeft: 2,
  },
  emptyChart: {
    height: CHART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  emptyChartText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
});
