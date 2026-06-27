import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/src/lib/auth-context";
import { spacing, useTheme } from "@/src/lib/theme";

export default function Index() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) router.replace("/(tabs)");
    else router.replace("/(auth)/welcome");
  }, [user, loading, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="splash-screen">
      <View style={[styles.logoCircle, { backgroundColor: colors.brand }]}>
        <Text style={[styles.logoText, { color: colors.onBrandPrimary }]}>CC</Text>
      </View>
      <Text style={[styles.title, { color: colors.onSurface }]}>Campus Chat</Text>
      <Text style={[styles.subtitle, { color: colors.onSurfaceMuted }]}>Anonymous. Campus only.</Text>
      <ActivityIndicator size="small" color={colors.brand} style={{ marginTop: spacing.xl }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xl,
  },
  logoText: { fontSize: 36, fontWeight: "800" },
  title: { fontSize: 32, fontWeight: "800" },
  subtitle: { fontSize: 14, marginTop: spacing.sm },
});
