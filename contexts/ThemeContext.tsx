import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark';

interface ThemeColors {
  bg: string;
  bgSecondary: string;
  surface: string;
  surfaceSecondary: string;
  border: string;
  borderLight: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  card: string;
  cardBorder: string;
  headerBg: string;
  inputBg: string;
  inputBorder: string;
  shadow: string;
}

const LIGHT: ThemeColors = {
  bg: '#F8FAFC',
  bgSecondary: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceSecondary: '#F8FAFC',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  primary: '#10B981',
  card: '#FFFFFF',
  cardBorder: '#F1F5F9',
  headerBg: '#FFFFFF',
  inputBg: '#F8FAFC',
  inputBorder: '#E2E8F0',
  shadow: '#000',
};

const DARK: ThemeColors = {
  bg: '#0F172A',
  bgSecondary: '#0F172A',
  surface: '#1E293B',
  surfaceSecondary: '#1E293B',
  border: '#334155',
  borderLight: '#1E293B',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#475569',
  primary: '#10B981',
  card: '#1E293B',
  cardBorder: '#334155',
  headerBg: '#0F172A',
  inputBg: '#0F172A',
  inputBorder: '#334155',
  shadow: '#000',
};

interface ThemeContextType {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'light',
  colors: LIGHT,
  isDark: false,
  setMode: () => {},
  toggleMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');

  useEffect(() => {
    AsyncStorage.getItem('vylta_theme').then(saved => {
      if (saved === 'dark' || saved === 'light') setModeState(saved);
    });
  }, []);

  const setMode = async (m: ThemeMode) => {
    setModeState(m);
    await AsyncStorage.setItem('vylta_theme', m);
  };

  const toggleMode = () => setMode(mode === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{
      mode,
      colors: mode === 'dark' ? DARK : LIGHT,
      isDark: mode === 'dark',
      setMode,
      toggleMode,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
