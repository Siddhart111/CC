import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, setToken } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth-context";
import { signupCache } from "@/src/lib/signup-cache";
import { radius, spacing, useTheme } from "@/src/lib/theme";

const LEN = 6;

export default function OtpScreen() {
  const router = useRouter();
  const { setUser } = useAuth();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(60);
  const [resending, setResending] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 400);
    return () => clearTimeout(t);
  }, []);

  const verify = async (codeStr: string) => {
    setError(null);
    const pending = signupCache.get();
    if (!pending) {
      setError("Session lost. Please go back and try again.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/auth/signup", {
        email: pending.email,
        password: pending.password,
        college_id: pending.college_id,
        otp: codeStr,
      });
      await setToken(res.token);
      setUser(res.user);
      signupCache.clear();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(auth)/onboarding");
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e?.message || "Verification failed");
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  const onChange = (raw: string) => {
    const cleaned = raw.replace(/\D/g, "").slice(0, LEN);
    setCode(cleaned);
    setError(null);
    if (cleaned.length === LEN) {
      verify(cleaned);
    }
  };

  const resend = async () => {
    const pending = signupCache.get();
    if (!pending || cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    setInfo(null);
    try {
      const res = await api.post("/auth/request-otp", {
        email: pending.email,
        college_id: pending.college_id,
      });
      setCooldown(res.cooldown_seconds ?? 60);
      if (res.dev_otp) {
        setInfo(`Dev mode: code is ${res.dev_otp}`);
      } else {
        setInfo("Code resent. Check your email.");
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e: any) {
      setError(e?.message || "Could not resend");
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="otp-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={12}
          testID="otp-back-btn"
        >
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>

        <View style={styles.body}>
          <View style={styles.iconBadge}>
            <Ionicons name="mail-unread" size={28} color={colors.brand} />
          </View>
          <Text style={styles.title}>Check your campus mail</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to{"\n"}
            <Text style={{ fontWeight: "800", color: colors.onSurface }}>{email}</Text>
          </Text>

          {/* OTP slots */}
          <Pressable onPress={() => inputRef.current?.focus()} style={styles.slots}>
            {Array.from({ length: LEN }).map((_, i) => {
              const ch = code[i] ?? "";
              const active = i === code.length;
              return (
                <View
                  key={i}
                  style={[
                    styles.slot,
                    active && styles.slotActive,
                    ch !== "" && styles.slotFilled,
                  ]}
                >
                  <Text style={styles.slotText}>{ch}</Text>
                </View>
              );
            })}
          </Pressable>

          {/* hidden input that drives the OTP slots */}
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={onChange}
            keyboardType="number-pad"
            maxLength={LEN}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            style={styles.hiddenInput}
            testID="otp-input"
          />

          {error ? (
            <View style={styles.errorBox} testID="otp-error">
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {info && !error ? (
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={16} color={colors.brand} />
              <Text style={styles.infoText}>{info}</Text>
            </View>
          ) : null}

          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.lg }} />
          ) : null}

          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>Didn{"'"}t get it? </Text>
            {cooldown > 0 ? (
              <Text style={styles.cooldownText}>Resend in {cooldown}s</Text>
            ) : (
              <Pressable
                onPress={resend}
                disabled={resending}
                testID="otp-resend-btn"
                hitSlop={8}
              >
                <Text style={styles.resendLink}>{resending ? "Sending…" : "Resend code"}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  backBtn: {
    margin: spacing.xl,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  body: { paddingHorizontal: spacing.xl, gap: spacing.lg, alignItems: "center" },
  iconBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  subtitle: { fontSize: 15, color: colors.onSurfaceMuted, textAlign: "center", lineHeight: 22 },
  slots: { flexDirection: "row", gap: 10, marginTop: spacing.md },
  slot: {
    width: 46,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  slotActive: { borderColor: colors.brand },
  slotFilled: { backgroundColor: colors.surfaceTertiary, borderColor: colors.brand },
  slotText: { fontSize: 24, fontWeight: "800", color: colors.onSurface },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    width: 1,
    height: 1,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.errorBg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  errorText: { color: colors.error, fontSize: 13, fontWeight: "700", flex: 1 },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  infoText: { color: colors.brand, fontSize: 13, fontWeight: "700", flex: 1 },
  resendRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.xl },
  resendLabel: { color: colors.onSurfaceMuted, fontSize: 14 },
  cooldownText: { color: colors.onSurfaceMuted, fontSize: 14, fontWeight: "700" },
  resendLink: { color: colors.brand, fontSize: 14, fontWeight: "800" },
});
