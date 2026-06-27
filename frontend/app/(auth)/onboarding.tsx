import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth-context";
import { pickRandomAvatar } from "@/src/lib/avatars";
import { radius, spacing, useTheme } from "@/src/lib/theme";

export default function Onboarding() {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [anonName, setAnonName] = useState(user?.anon_username || "");
  const [pic, setPic] = useState<string | null>(user?.profile_pic || pickRandomAvatar());
  const [loading, setLoading] = useState(false);

  const randomizeAvatar = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    setPic(pickRandomAvatar(pic));
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      const b64 = a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
      setPic(b64);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const finish = async () => {
    setLoading(true);
    try {
      const updated = await api.patch("/profile", {
        anon_username: anonName,
        profile_pic: pic,
      });
      setUser(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch {
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="onboarding-screen">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>STEP 2 OF 2</Text>
        <Text style={styles.title}>Your anonymous persona</Text>
        <Text style={styles.subtitle}>
          Nobody on Campus Chat will see your real name or email. Pick a vibe.
        </Text>

        <View style={styles.avatarWrap}>
          <View style={styles.avatarRing}>
            {pic ? (
              <Image source={{ uri: pic }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.brandTertiary }]} />
            )}
          </View>
          <Pressable
            testID="onboarding-change-pic-btn"
            style={styles.changePicBtn}
            onPress={pickFromGallery}
            hitSlop={10}
          >
            <Ionicons name="camera" size={18} color={colors.onSurface} />
            <Text style={styles.changePicText}>Upload</Text>
          </Pressable>
        </View>

        <View style={styles.nameCard}>
          <Text style={styles.nameLabel}>Your handle</Text>
          <Text style={styles.nameValue} testID="onboarding-anon-username">
            {anonName}
          </Text>
          <Pressable
            testID="onboarding-shuffle-avatar-btn"
            style={({ pressed }) => [styles.randomBtn, pressed && { opacity: 0.85 }]}
            onPress={randomizeAvatar}
          >
            <Ionicons name="shuffle" size={18} color={colors.onBrandSecondary} />
            <Text style={styles.randomText}>Shuffle avatar</Text>
          </Pressable>
        </View>

        <Pressable
          testID="onboarding-continue-btn"
          disabled={loading || !anonName}
          style={({ pressed }) => [
            styles.primaryBtn,
            (loading || !anonName) && { opacity: 0.5 },
            pressed && { opacity: 0.85 },
          ]}
          onPress={finish}
        >
          {loading ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <Text style={styles.primaryBtnText}>Enter Campus Chat</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, gap: spacing.lg },
  kicker: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: colors.brand,
  },
  title: { fontSize: 32, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: colors.onSurfaceMuted, lineHeight: 22, marginBottom: spacing.md },
  avatarWrap: {
    alignItems: "center",
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  avatarRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    padding: 6,
    backgroundColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: { width: 168, height: 168, borderRadius: 84, backgroundColor: colors.surfaceTertiary },
  changePicBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  changePicText: { fontWeight: "700", color: colors.onSurface },
  nameCard: {
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    gap: spacing.md,
    alignItems: "center",
  },
  nameLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.onSurfaceMuted,
    letterSpacing: 1,
  },
  nameValue: { fontSize: 28, fontWeight: "800", color: colors.onSurface },
  randomBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.brandSecondary,
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    borderRadius: radius.pill,
  },
  randomText: { fontWeight: "800", color: colors.onBrandSecondary, fontSize: 15 },
  primaryBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 18,
    borderRadius: radius.pill,
    alignItems: "center",
    marginTop: spacing.md,
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "700" },
});
