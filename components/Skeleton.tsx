import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle, StyleProp, Easing } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

// ═════════════════════════════════════════════════════════════════════════
// Skeleton — Componentes reusables para loading states con shimmer animado
//
// FILOSOFIA:
//   Los skeletons NO hacen la app mas rapida tecnicamente. Lo que hacen es
//   que el usuario PERCIBA que la app responde inmediatamente, en lugar
//   de mostrar un spinner gigante sobre fondo blanco.
//
//   Estudios de UX (Facebook 2014, LinkedIn 2016) demuestran que las
//   apps con skeleton loaders se perciben hasta 40% mas rapidas, aunque
//   el tiempo real de carga sea identico.
//
// COMO USARLO:
//   <SkeletonBox width={120} height={20} />            // bloque simple
//   <SkeletonCircle size={48} />                       // avatar
//   <SkeletonText lines={3} />                         // varias lineas
//
//   O usar los presets:
//   <SkeletonClientCard />     // tarjeta de cliente
//   <SkeletonAppointmentCard />// tarjeta de cita
//
// DETALLE TECNICO:
//   - Animacion shimmer con Animated.loop + useNativeDriver: true
//   - Adapta colores automaticamente segun theme (dark/light)
//   - useNativeDriver mantiene 60 FPS aun con muchos skeletons en pantalla
// ═════════════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────────
// Hook compartido para la animacion shimmer
// ────────────────────────────────────────────────────────────────────
function useShimmerAnimation() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return opacity;
}

// ────────────────────────────────────────────────────────────────────
// SkeletonBox: bloque rectangular base con shimmer
// ────────────────────────────────────────────────────────────────────
interface SkeletonBoxProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonBox({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonBoxProps) {
  const { isDark } = useTheme();
  const opacity = useShimmerAnimation();
  const baseColor = isDark ? '#1F2937' : '#E5E7EB';

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: baseColor,
          opacity,
        },
        style,
      ]}
    />
  );
}

// ────────────────────────────────────────────────────────────────────
// SkeletonCircle: avatar circular
// ────────────────────────────────────────────────────────────────────
interface SkeletonCircleProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonCircle({ size = 48, style }: SkeletonCircleProps) {
  return (
    <SkeletonBox
      width={size}
      height={size}
      borderRadius={size / 2}
      style={style}
    />
  );
}

// ────────────────────────────────────────────────────────────────────
// SkeletonText: multiples lineas de texto simulado
// ────────────────────────────────────────────────────────────────────
interface SkeletonTextProps {
  lines?: number;
  lastLineWidth?: number | string;
  lineHeight?: number;
  spacing?: number;
}

export function SkeletonText({
  lines = 1,
  lastLineWidth = '60%',
  lineHeight = 14,
  spacing = 8,
}: SkeletonTextProps) {
  return (
    <View>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBox
          key={i}
          height={lineHeight}
          width={i === lines - 1 ? (lastLineWidth as any) : '100%'}
          borderRadius={lineHeight / 2}
          style={{ marginBottom: i < lines - 1 ? spacing : 0 }}
        />
      ))}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// PRESETS — skeletons especificos por tipo de tarjeta
// ═════════════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────────
// SkeletonClientCard: replica visualmente una tarjeta de cliente
// ────────────────────────────────────────────────────────────────────
export function SkeletonClientCard() {
  const { colors: tc } = useTheme();
  return (
    <View style={[s.clientCard, { backgroundColor: tc.surface, borderColor: tc.border }]}>
      <SkeletonCircle size={46} style={{ borderRadius: 14 }} />
      <View style={s.clientInfo}>
        <SkeletonBox width="60%" height={15} borderRadius={8} style={{ marginBottom: 6 }} />
        <SkeletonBox width="40%" height={12} borderRadius={6} style={{ marginBottom: 8 }} />
        <View style={s.metaRow}>
          <SkeletonBox width={60} height={11} borderRadius={6} />
          <SkeletonBox width={50} height={11} borderRadius={6} />
        </View>
      </View>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// SkeletonClientsList: lista completa de skeletons de clientes
// ────────────────────────────────────────────────────────────────────
export function SkeletonClientsList({ count = 6 }: { count?: number }) {
  return (
    <View style={{ gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonClientCard key={i} />
      ))}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// SkeletonAppointmentCard: replica visualmente una tarjeta de cita
// ────────────────────────────────────────────────────────────────────
export function SkeletonAppointmentCard() {
  const { colors: tc, isDark } = useTheme();
  return (
    <View style={[s.apptCard, { backgroundColor: tc.surface, borderColor: tc.border }]}>
      <View style={[s.stripe, { backgroundColor: isDark ? '#1F2937' : '#E5E7EB' }]} />
      <View style={s.timeCol}>
        <SkeletonBox width={40} height={14} borderRadius={7} />
      </View>
      <View style={s.infoCol}>
        <SkeletonBox width="70%" height={14} borderRadius={7} style={{ marginBottom: 6 }} />
        <SkeletonBox width="50%" height={11} borderRadius={6} />
      </View>
      <SkeletonBox width={68} height={20} borderRadius={10} style={{ marginRight: 6 }} />
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// SkeletonAppointmentsList: lista completa de citas
// ────────────────────────────────────────────────────────────────────
export function SkeletonAppointmentsList({ count = 5 }: { count?: number }) {
  return (
    <View style={{ gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonAppointmentCard key={i} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  // ─── Client card skeleton ───
  clientCard: {
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
  },
  clientInfo: {
    flex: 1,
    gap: 2,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  // ─── Appointment card skeleton ───
  apptCard: {
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
  },
  stripe: {
    width: 4,
    alignSelf: 'stretch',
  },
  timeCol: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    minWidth: 64,
    alignItems: 'center',
  },
  infoCol: {
    flex: 1,
    paddingVertical: 14,
  },
});
