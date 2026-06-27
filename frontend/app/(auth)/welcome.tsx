import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { radius, spacing, useTheme } from "@/src/lib/theme";

const CC_LOGO = require("../../assets/cc-logo.png");
const WELCOME_HERO = "https://customer-assets.emergentagent.com/job_college-hub-chat/artifacts/1b1s4yv1_image.webp";

export default function Welcome() {
  const router = useRouter();
  const { colors, effective } = useTheme();
  const styles = makeStyles(colors);
  const scrim =
    effective === "dark"
      ? (["rgba(14,15,18,0.2)", "rgba(14,15,18,0.85)", colors.surface] as const)
      : (["rgba(253,252,248,0.15)", "rgba(253,252,248,0.85)", colors.surface] as const);
  return (
    <View style={styles.container} testID="welcome-screen">
      <Image source={{ uri: WELCOME_HERO }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient colors={scrim} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.topRow}>
          <View style={styles.logoChip}>
            <Image source={CC_LOGO} style={styles.logoImg} contentFit="contain" />
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
          <Text style={styles.credit}>Created by Siddharth Nishad</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  safe: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: "space-between" },
  topRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  logoChip: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: "#0E0F12",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoImg: { width: 40, height: 40 },
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
  credit: { textAlign: "center", color: colors.onSurfaceMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginTop: 2, opacity: 0.85 },
});
