import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/src/lib/auth-context";
import { colors, spacing } from "@/src/lib/theme";

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) router.replace("/(tabs)");
    else router.replace("/(auth)/welcome");
  }, [user, loading, router]);

  return (
    <View style={styles.container} testID="splash-screen">
      <View style={styles.logoCircle}>
        <Text style={styles.logoText}>CC</Text>
      </View>
      <Text style={styles.title}>Campus Chat</Text>
      <Text style={styles.subtitle}>Anonymous. Campus only.</Text>
      <ActivityIndicator size="small" color={colors.brand} style={{ marginTop: spacing.xl }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 999,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xl,
  },
  logoText: {
    color: colors.onBrandPrimary,
    fontSize: 36,
    fontWeight: "800",
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.onSurface,
  },
  subtitle: {
    fontSize: 14,
    color: colors.onSurfaceMuted,
    marginTop: spacing.sm,
  },
});
