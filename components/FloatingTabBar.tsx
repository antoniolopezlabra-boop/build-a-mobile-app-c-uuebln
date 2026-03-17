import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, usePathname, Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export interface TabBarItem {
  name: string;
  route: Href;
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
}

interface FloatingTabBarProps {
  tabs: TabBarItem[];
}

export default function FloatingTabBar({ tabs }: FloatingTabBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const isActive = (tab: TabBarItem) => {
    if (pathname === tab.route) return true;
    if (pathname.includes(tab.name)) return true;
    return false;
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 8 }]}>
      {tabs.map((tab, index) => {
        const active = isActive(tab);
        return (
          <TouchableOpacity
            key={index}
            style={styles.tab}
            // FIX: usar replace en lugar de push para tabs
            // push apila pantallas — con el tiempo el stack crece y la nav se ralentiza
            // replace mantiene el stack limpio y la navegación instantánea
            onPress={() => {
              if (!active) router.replace(tab.route as any);
            }}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={tab.icon}
              size={24}
              color={active ? '#10B981' : '#94A3B8'}
            />
            <Text style={[styles.label, active && styles.labelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 0.5,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
    zIndex: 100,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  label: { fontSize: 10, marginTop: 2, color: '#94A3B8' },
  labelActive: { color: '#10B981', fontWeight: '600' },
});
