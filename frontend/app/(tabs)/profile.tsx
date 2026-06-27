import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth-context";
import { colorForName, pickRandomAvatar } from "@/src/lib/avatars";
import { radius, spacing, useTheme } from "@/src/lib/theme";

export default function Profile() {
  const router = useRouter();
  const { user, setUser, logout } = useAuth();
  const { colors, effective, toggle } = useTheme();
  const styles = makeStyles(colors);
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const shufflePic = async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const updated = await api.patch("/profile", { profile_pic: pickRandomAvatar(user.profile_pic) });
      setUser(updated);
    } catch {}
    setSaving(false);
  };

  const uploadPic = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      const b64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setSaving(true);
      try {
        const updated = await api.patch("/profile", { profile_pic: b64 });
        setUser(updated);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/(auth)/welcome");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="profile-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarWrap}>
          {user.profile_pic ? (
            <Image source={{ uri: user.profile_pic }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colorForName(user.anon_username) }]}>
              <Text style={styles.initials}>{user.anon_username.slice(0, 2).toUpperCase()}</Text>
            </View>
          )}
        </View>

        <Text style={styles.name} testID="profile-anon-username">
          {user.anon_username}
        </Text>
        <View style={styles.collegePill}>
          <Ionicons name="school" size={14} color={colors.onSurface} />
          <Text style={styles.collegeText}>UPES Dehradun · Verified</Text>
        </View>

        <View style={styles.actionsRow}>
          <ActionTile
            icon="image"
            label="Upload pic"
            color={colors.brand}
            onPress={uploadPic}
            testID="profile-upload-pic"
          />
          <ActionTile
            icon="color-wand"
            label="Shuffle avatar"
            color={colors.brandSecondary}
            onPress={shufflePic}
            testID="profile-shuffle-pic"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardKicker}>Identity</Text>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Handle</Text>
            <Text style={styles.cardValue}>{user.anon_username}</Text>
          </View>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Real email</Text>
            <Text style={styles.cardValue} numberOfLines={1}>
              {user.email}
            </Text>
          </View>
          <View style={[styles.cardRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.cardLabel}>Status</Text>
            <View style={styles.statusDot}>
              <View style={styles.dotGreen} />
              <Text style={[styles.cardValue, { maxWidth: undefined }]} numberOfLines={1}>
                Online
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardKicker}>Appearance</Text>
          <Pressable
            testID="profile-theme-toggle"
            onPress={async () => {
              await toggle();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            style={styles.cardRow}
          >
            <Text style={styles.cardLabel}>Dark mode</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.cardValue}>{effective === "dark" ? "On" : "Off"}</Text>
              <Ionicons
                name={effective === "dark" ? "moon" : "sunny"}
                size={20}
                color={colors.brand}
              />
            </View>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardKicker}>Privacy</Text>
          <Text style={styles.privacyText}>
            Your real email and personal info are never visible to other students. Only your handle{" "}
            <Text style={{ fontWeight: "800" }}>{user.anon_username}</Text> is shown in chats.
          </Text>
        </View>

        <Pressable
          testID="profile-logout-btn"
          onPress={handleLogout}
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>

        <Text style={styles.creditFooter} testID="creator-credit">
          Created by Siddharth Nishad
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionTile({
  icon,
  label,
  color,
  onPress,
  testID,
}: {
  icon: any;
  label: string;
  color: string;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { backgroundColor: color }, pressed && { opacity: 0.85 }]}
    >
      <Ionicons name={icon} size={24} color={colors.onSurface} />
      <Text style={styles.tileLabel}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  coverWrap: { height: 180, width: "100%", overflow: "hidden" },
  avatarWrap: {
    alignSelf: "center",
    marginTop: spacing.xxl,
    padding: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  avatar: { width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "center" },
  initials: { color: "#fff", fontWeight: "800", fontSize: 36 },
  name: {
    textAlign: "center",
    marginTop: spacing.md,
    fontSize: 26,
    fontWeight: "800",
    color: colors.onSurface,
  },
  collegePill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  collegeText: { fontWeight: "700", fontSize: 12, color: colors.onSurface },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl,
  },
  tile: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  tileLabel: { fontWeight: "800", color: colors.onSurface, fontSize: 12, textAlign: "center" },
  card: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  cardKicker: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: colors.onSurfaceMuted,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardLabel: { fontSize: 14, color: colors.onSurfaceMuted, fontWeight: "600" },
  cardValue: { fontSize: 14, color: colors.onSurface, fontWeight: "700", maxWidth: "60%" },
  statusDot: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  dotGreen: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  privacyText: { fontSize: 13, color: colors.onSurfaceMuted, lineHeight: 20 },
  logoutBtn: {
    flexDirection: "row",
    gap: spacing.sm,
    alignSelf: "center",
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.error,
  },
  logoutText: { color: colors.error, fontWeight: "800", fontSize: 15 },
  creditFooter: {
    textAlign: "center",
    color: colors.onSurfaceMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    opacity: 0.7,
  },
});
