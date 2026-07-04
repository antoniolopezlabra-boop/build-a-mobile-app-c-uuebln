import { Stack, Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAdmin } from '@/contexts/AdminContext';

export default function AdminLayout() {
  // ⚡ FIX BUG (jul 2026): antes era un <Stack> desnudo → cualquier usuario que
  // alcanzara una ruta /admin/* montaba la pantalla y corría sus queries (la
  // contención dependía 100% de RLS, con el guard de navegación redirigiendo tarde,
  // ~600 ms después). Ahora bloqueamos el montaje si el usuario no es admin.
  const { isAdmin, loading } = useAdmin();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  if (!isAdmin) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
