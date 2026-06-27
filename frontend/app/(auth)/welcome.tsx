import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/src/lib/theme";

export default function Welcome() {
  const router = useRouter();
  return (
    <View style={styles.container} testID="welcome-screen">
      <Image
        source={{ uri: "https://images.unsplash.com/photo-1517256673644-36ad11246d21?w=1200&q=80" }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <LinearGradient
        colors={["rgba(253,252,248,0.1)", "rgba(253,252,248,0.85)", "#FDFCF8"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.topRow}>
          <View style={styles.logoChip}>
            <Text style={styles.logoChipText}>CC</Text>
          </View>
          <Text style={styles.brand}>Campus Chat</Text>
        </View>

        <View style={styles.heroBlock}>
          <Text style={styles.title}>Talk to your{"\n"}campus, anonymously.</Text>
          <Text style={styles.subtitle}>
            Hop into your college lounge, slide into DMs, and make friends — without giving away who
            you really are. Verified by your college email.
          </Text>
        </View>

        <View style={styles.ctas}>
          <Pressable
            testID="welcome-signup-btn"
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(auth)/signup");
            }}
          >
            <Text style={styles.primaryBtnText}>Create anonymous account</Text>
          </Pressable>
          <Pressable
            testID="welcome-login-btn"
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.9 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(auth)/login");
            }}
          >
            <Text style={styles.secondaryBtnText}>I already have an account</Text>
          </Pressable>
          <Text style={styles.fineprint}>UPES students only • @upes.ac.in email required</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  safe: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: "space-between" },
  topRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  logoChip: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  logoChipText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 18 },
  brand: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  heroBlock: { gap: spacing.md },
  title: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: "800",
    color: colors.onSurface,
    letterSpacing: -0.5,
  },
  subtitle: { fontSize: 16, lineHeight: 24, color: colors.onSurfaceMuted },
  ctas: { gap: spacing.md, marginBottom: spacing.lg },
  primaryBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 18,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  secondaryBtn: {
    backgroundColor: "transparent",
    paddingVertical: 16,
    borderRadius: radius.pill,
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.borderStrong,
  },
  secondaryBtnText: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  fineprint: { textAlign: "center", color: colors.onSurfaceMuted, fontSize: 12 },
});
