import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth-context";
import { radius, spacing, useTheme } from "@/src/lib/theme";

type College = {
  college_id: string;
  name: string;
  short: string;
  city: string;
  allowed_domains: string[];
};

export default function Signup() {
  const router = useRouter();
  const { signup } = useAuth();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [colleges, setColleges] = useState<College[]>([]);
  const [collegeId, setCollegeId] = useState<string>("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.get("/colleges");
        setColleges(list);
        if (list.length === 1) setCollegeId(list[0].college_id);
      } catch (e) {
        setColleges([]);
      }
    })();
  }, []);

  const selectedCollege = colleges.find((c) => c.college_id === collegeId);
  const allowedDomains = selectedCollege?.allowed_domains ?? [];
  const domainHint = allowedDomains.length ? allowedDomains.map((d) => `@${d}`).join(" / ") : "";

  const onSubmit = async () => {
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setLoading(true);
    try {
      await signup(email.trim().toLowerCase(), password, collegeId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(auth)/onboarding");
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e?.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = email && password.length >= 6 && confirm && collegeId && !loading;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="signup-screen">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            style={styles.backBtn}
            onPress={() => router.back()}
            testID="signup-back-btn"
            hitSlop={12}
          >
            <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.title}>Join your campus</Text>
            <Text style={styles.subtitle}>
              Sign up anonymously. Only verified college email holders get in.
            </Text>
          </View>

          {/* College picker */}
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.sectionLabel}>Pick your college</Text>
            <View style={styles.collegeList}>
              {colleges.map((c) => {
                const selected = c.college_id === collegeId;
                return (
                  <Pressable
                    key={c.college_id}
                    testID={`college-card-${c.college_id}`}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setCollegeId(c.college_id);
                    }}
                    style={[styles.collegeCard, selected && styles.collegeCardActive]}
                  >
                    <View style={[styles.collegeBadge, selected && styles.collegeBadgeActive]}>
                      <Text
                        style={[styles.collegeBadgeText, selected && { color: colors.onSurface }]}
                      >
                        {c.short}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.collegeName}>{c.name}</Text>
                      <Text style={styles.collegeCity}>{c.city}</Text>
                    </View>
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={26} color={colors.success} />
                    ) : (
                      <View style={styles.dotEmpty} />
                    )}
                  </Pressable>
                );
              })}
              <View style={styles.comingSoonRow}>
                <Ionicons name="time-outline" size={16} color={colors.onSurfaceMuted} />
                <Text style={styles.comingSoonText}>More colleges coming soon</Text>
              </View>
            </View>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Field
              label="Campus email"
              hint={domainHint ? `Must end with ${domainHint}` : undefined}
            >
              <TextInput
                testID="signup-email-input"
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@upes.ac.in"
                placeholderTextColor={colors.onSurfaceMuted}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
              />
            </Field>
            <Field label="Password" hint="Min. 6 characters">
              <TextInput
                testID="signup-password-input"
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Set a strong password"
                placeholderTextColor={colors.onSurfaceMuted}
                secureTextEntry
              />
            </Field>
            <Field label="Confirm password">
              <TextInput
                testID="signup-confirm-input"
                style={styles.input}
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Re-enter password"
                placeholderTextColor={colors.onSurfaceMuted}
                secureTextEntry
              />
            </Field>

            {error ? (
              <View style={styles.errorBox} testID="signup-error">
                <Ionicons name="alert-circle" size={18} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              testID="signup-submit-btn"
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.primaryBtn,
                !canSubmit && { opacity: 0.5 },
                pressed && { opacity: 0.85 },
              ]}
              onPress={onSubmit}
            >
              {loading ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>Create my anonymous account</Text>
              )}
            </Pressable>

            <View style={styles.altRow}>
              <Text style={styles.altText}>Already in? </Text>
              <Pressable testID="goto-login" onPress={() => router.replace("/(auth)/login")}>
                <Text style={styles.altLink}>Log in</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: { gap: spacing.sm, marginTop: spacing.md },
  title: { fontSize: 32, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: colors.onSurfaceMuted, lineHeight: 22 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.onSurface,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  collegeList: { gap: spacing.sm },
  collegeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.border,
  },
  collegeCardActive: {
    borderColor: colors.brand,
    backgroundColor: colors.surfaceTertiary,
  },
  collegeBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  collegeBadgeActive: { backgroundColor: colors.brandSecondary },
  collegeBadgeText: { color: colors.onBrandTertiary, fontWeight: "800", fontSize: 13 },
  collegeName: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  collegeCity: { fontSize: 13, color: colors.onSurfaceMuted, marginTop: 2 },
  dotEmpty: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border },
  comingSoonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
  },
  comingSoonText: { color: colors.onSurfaceMuted, fontSize: 12 },
  form: { gap: spacing.lg },
  label: { fontSize: 13, fontWeight: "700", color: colors.onSurface, marginLeft: spacing.sm },
  hint: { fontSize: 12, color: colors.onSurfaceMuted, marginLeft: spacing.sm },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 16,
    fontSize: 16,
    color: colors.onSurface,
  },
  primaryBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 18,
    borderRadius: radius.pill,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  altRow: { flexDirection: "row", justifyContent: "center" },
  altText: { color: colors.onSurfaceMuted, fontSize: 14 },
  altLink: { color: colors.brand, fontSize: 14, fontWeight: "700" },
  errorBox: {
    backgroundColor: "#FFE5E5",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  errorText: { color: colors.error, fontSize: 14, fontWeight: "600", flex: 1 },
});
