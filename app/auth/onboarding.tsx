
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

const { width } = Dimensions.get('window');

const slides = [
  {
    icon: 'link',
    color: '#10B981',
    bg: '#ECFDF5',
    title: 'Tu link de citas',
    description: 'Comparte un link único con tus clientes. Ellos eligen servicio, fecha y hora — la cita llega directo a tu app.',
  },
  {
    icon: 'notifications-active',
    color: '#3B82F6',
    bg: '#EFF6FF',
    title: 'Recordatorios automáticos',
    description: 'VYLTA envía confirmaciones y recordatorios por WhatsApp a tus clientes. Tú no tienes que hacer nada.',
  },
  {
    icon: 'group',
    color: '#8B5CF6',
    bg: '#F5F3FF',
    title: 'Cada cliente regresa',
    description: 'Detecta clientes inactivos, envía campañas y llena tu agenda. Todo desde una sola app.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  const handleNext = async () => {
    if (currentIndex < slides.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      scrollViewRef.current?.scrollTo({ x: width * nextIndex, animated: true });
    } else {
      await AsyncStorage.setItem('has_seen_onboarding', 'true');
      router.replace('/auth/login');
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem('has_seen_onboarding', 'true');
    router.replace('/auth/login');
  };

  const slide = slides[currentIndex];
  const isLast = currentIndex === slides.length - 1;

  return (
    <SafeAreaView style={s.container}>

      {/* Skip */}
      {!isLast && (
        <TouchableOpacity style={s.skipBtn} onPress={handleSkip}>
          <Text style={s.skipText}>Saltar</Text>
        </TouchableOpacity>
      )}

      {/* Slides */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        style={s.scroll}
      >
        {slides.map((sl, i) => (
          <View key={i} style={s.slide}>
            {/* Icon */}
            <View style={[s.iconWrap, { backgroundColor: sl.bg }]}>
              <MaterialIcons name={sl.icon as any} size={56} color={sl.color} />
            </View>

            {/* Logo VYLTA */}
            <View style={s.logoRow}>
              <View style={s.logoDot} />
              <Text style={s.logoText}>VYLTA</Text>
            </View>

            <Text style={s.title}>{sl.title}</Text>
            <Text style={s.desc}>{sl.description}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Dots */}
      <View style={s.dots}>
        {slides.map((_, i) => (
          <View
            key={i}
            style={[
              s.dot,
              i === currentIndex ? s.dotActive : s.dotInactive,
            ]}
          />
        ))}
      </View>

      {/* CTA */}
      <TouchableOpacity
        style={[s.btn, isLast && s.btnLast]}
        onPress={handleNext}
        activeOpacity={0.85}
      >
        <Text style={s.btnText}>
          {isLast ? 'Crear mi cuenta →' : 'Siguiente'}
        </Text>
      </TouchableOpacity>

      <View style={{ height: 16 }} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F8FAFC' },
  skipBtn:     { alignSelf: 'flex-end', paddingHorizontal: 20, paddingVertical: 14 },
  skipText:    { color: '#94A3B8', fontSize: 15, fontWeight: '500' },
  scroll:      { flex: 1 },
  slide:       { width, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  iconWrap:    { width: 120, height: 120, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 32 },
  logoRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20 },
  logoDot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  logoText:    { fontSize: 13, fontWeight: '900', color: '#10B981', letterSpacing: 2 },
  title:       { fontSize: 28, fontWeight: '800', color: '#0F172A', textAlign: 'center', marginBottom: 14, letterSpacing: -0.5 },
  desc:        { fontSize: 16, color: '#64748B', textAlign: 'center', lineHeight: 26 },
  dots:        { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 24, gap: 6 },
  dot:         { height: 8, borderRadius: 4 },
  dotActive:   { width: 24, backgroundColor: '#10B981' },
  dotInactive: { width: 8, backgroundColor: '#E2E8F0' },
  btn:         { backgroundColor: '#10B981', borderRadius: 16, paddingVertical: 17, marginHorizontal: 24, alignItems: 'center' },
  btnLast:     { backgroundColor: '#0F172A' },
  btnText:     { color: '#fff', fontSize: 17, fontWeight: '700' },
});
