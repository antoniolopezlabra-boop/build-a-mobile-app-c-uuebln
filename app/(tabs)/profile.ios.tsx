import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IconSymbol } from "@/components/IconSymbol";
import { GlassView } from "expo-glass-effect";
import { useTheme } from "@react-navigation/native";

export default function ProfileScreen() {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
      >
        <GlassView style={styles.profileHeader} glassEffectStyle="regular">
          <IconSymbol ios_icon_name="person.circle.fill" android_material_icon_name="person" size={24} color={theme.colors.primary} />
          <Text style={[styles.name, { color: theme.colors.text }]}>John Doe</Text>
          <Text style={[styles.email, { color: theme.dark ? '#98989D' : '#666' }]}>john.doe@example.com</Text>
        </GlassView>

        <GlassView style={styles.section} glassEffectStyle="regular">
          <View style={styles.infoRow}>
            <IconSymbol ios_icon_name="phone.fill" android_material_icon_name="phone" size={24} color={theme.dark ? '#98989D' : '#666'} />
            <Text style={[styles.infoText, { color: theme.colors.text }]}>+1 (555) 123-4567</Text>
          </View>
          <View style={styles.infoRow}>
            <IconSymbol ios_icon_name="location.fill" android_material_icon_name="location-on" size={24} color={theme.dark ? '#98989D' : '#666'} />
            <Text style={[styles.infoText, { color: theme.colors.text }]}>San Francisco, CA</Text>
          </View>
        </GlassView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  profileHeader: {
    alignItems: 'center',
    borderRadius: 12,
    padding: 32,
    marginBottom: 16,
    gap: 12,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  email: {
    fontSize: 16,
  },
  section: {
    borderRadius: 12,
    padding: 20,
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoText: {
    fontSize: 16,
  },
});
