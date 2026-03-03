
import { Link, Stack } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/styles/commonStyles';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: '¡Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>Esta pantalla no existe.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Ir al inicio</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    color: colors.primary,
  },
});
