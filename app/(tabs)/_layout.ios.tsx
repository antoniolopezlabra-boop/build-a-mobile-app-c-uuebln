
import React from 'react';
import { Href } from 'expo-router';
import FloatingTabBar from '@/components/FloatingTabBar';

export default function TabLayout() {
  const tabs = [
    {
      name: 'Inicio',
      route: '/(tabs)/(home)' as Href,
      ios_icon_name: 'house.fill',
      android_material_icon_name: 'home' as const,
    },
    {
      name: 'Citas',
      route: '/(tabs)/appointments' as Href,
      ios_icon_name: 'calendar',
      android_material_icon_name: 'calendar-today' as const,
    },
    {
      name: 'Clientes',
      route: '/(tabs)/clients' as Href,
      ios_icon_name: 'person.2.fill',
      android_material_icon_name: 'group' as const,
    },
    {
      name: 'Reportes',
      route: '/(tabs)/reports' as Href,
      ios_icon_name: 'chart.bar.fill',
      android_material_icon_name: 'assessment' as const,
    },
    {
      name: 'Ajustes',
      route: '/(tabs)/settings' as Href,
      ios_icon_name: 'gearshape.fill',
      android_material_icon_name: 'settings' as const,
    },
  ];

  return <FloatingTabBar tabs={tabs} />;
}
