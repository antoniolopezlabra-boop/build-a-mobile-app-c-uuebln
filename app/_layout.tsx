import { Stack } from 'expo-router';
import { LogBox } from 'react-native';

LogBox.ignoreAllLogs();
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/contexts/AuthContext';
import { AdminProvider } from '@/contexts/AdminContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <AdminProvider>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="dark" />
      </AdminProvider>
    </AuthProvider>
  );
}
