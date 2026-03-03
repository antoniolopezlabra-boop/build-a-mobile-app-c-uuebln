
import "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import React, { useEffect } from "react";
import * as SplashScreen from "expo-splash-screen";
import { SystemBars } from "react-native-edge-to-edge";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { WidgetProvider } from "@/contexts/WidgetContext";
import { AuthProvider } from "@/contexts/AuthContext";
import {
  DarkTheme,
  DefaultTheme,
  Theme,
  ThemeProvider,
} from "@react-navigation/native";
import { useColorScheme } from "react-native";
import { Stack } from "expo-router";
import { useNetworkState } from "expo-network";

SplashScreen.preventAutoHideAsync();

const LightTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#F8FAFC',
    card: '#FFFFFF',
    text: '#0F172A',
    primary: '#10B981',
  },
};

export default function RootLayout() {
  const { isConnected } = useNetworkState();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  const colorScheme = useColorScheme();

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={LightTheme}>
        <WidgetProvider>
          <AuthProvider>
            <SystemBars style="auto" />
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="auth/onboarding" options={{ headerShown: false }} />
              <Stack.Screen name="auth/register" options={{ headerShown: false }} />
              <Stack.Screen name="auth/login" options={{ headerShown: false }} />
              <Stack.Screen name="+not-found" />
            </Stack>
          </AuthProvider>
        </WidgetProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
