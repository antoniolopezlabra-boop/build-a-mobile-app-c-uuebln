
import "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import React, { useEffect, useState } from "react";
import * as SplashScreen from "expo-splash-screen";
import { SystemBars } from "react-native-edge-to-edge";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { WidgetProvider } from "@/contexts/WidgetContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  DarkTheme,
  DefaultTheme,
  Theme,
  ThemeProvider,
} from "@react-navigation/native";
import { useColorScheme, View, Text, ActivityIndicator, StyleSheet } from "react-native";
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

// Custom VYLTA Splash Screen Component
function VyltaSplashScreen() {
  return (
    <View style={splashStyles.container}>
      <View style={splashStyles.logoContainer}>
        <Text style={splashStyles.logoText}>VYLTA</Text>
        <Text style={splashStyles.tagline}>Cada cliente regresa</Text>
      </View>
      <ActivityIndicator size="large" color="#10B981" style={splashStyles.loader} />
    </View>
  );
}

export default function RootLayout() {
  const { isConnected } = useNetworkState();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const [showSplash, setShowSplash] = useState(true);
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        console.log('[App] Initializing app...');
        
        // Wait for fonts to load
        if (loaded) {
          console.log('[App] Fonts loaded');
          
          // Show splash screen for minimum 2 seconds
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          console.log('[App] Splash screen complete');
          setShowSplash(false);
          setAppReady(true);
          
          // Hide the native splash screen
          await SplashScreen.hideAsync();
        }
      } catch (error) {
        console.error('[App] Error during initialization:', error);
        // Even if there's an error, show the app after splash
        setShowSplash(false);
        setAppReady(true);
        try {
          await SplashScreen.hideAsync();
        } catch (e) {
          console.error('[App] Error hiding splash:', e);
        }
      }
    }

    prepare();
  }, [loaded]);

  const colorScheme = useColorScheme();

  // Show custom splash screen while loading
  if (!loaded || showSplash) {
    return <VyltaSplashScreen />;
  }

  // Show loading state if app is not ready
  if (!appReady) {
    return <VyltaSplashScreen />;
  }

  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A', // VYLTA dark blue
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#10B981', // VYLTA green
    letterSpacing: 4,
  },
  tagline: {
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: 8,
    fontStyle: 'italic',
  },
  loader: {
    marginTop: 20,
  },
});
