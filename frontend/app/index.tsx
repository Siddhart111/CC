import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/src/lib/auth-context";
import { spacing, useTheme } from "@/src/lib/theme";

const CC_LOGO = require("../assets/cc-logo.png");

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
    <View style={[styles.container, { backgroundColor: "#0E0F12" }]} testID="splash-screen">
      <Image source={CC_LOGO} style={styles.logo} resizeMode="contain" />
      <Text style={[styles.title, { color: "#F5F4EE" }]}>Campus Chat</Text>
      <Text style={[styles.subtitle, { color: "#9C9A92" }]}>Anonymous. Campus only.</Text>
      <ActivityIndicator size="small" color={colors.brand} style={{ marginTop: spacing.xl }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  logo: { width: 140, height: 140, marginBottom: spacing.xl },
  title: { fontSize: 32, fontWeight: "800" },
  subtitle: { fontSize: 14, marginTop: spacing.sm },
});
