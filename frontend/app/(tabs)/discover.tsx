import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth-context";
import { colorForName } from "@/src/lib/avatars";
import { colors, radius, spacing } from "@/src/lib/theme";

type UserRow = {
  user_id: string;
  anon_username: string;
  profile_pic: string | null;
  friendship?: {
    status: "pending" | "accepted" | "rejected";
    direction: "in" | "out";
    request_id: string;
  } | null;
};

export default function Discover() {
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    try {
      const params = q ? `?q=${encodeURIComponent(q)}` : "";
      const data = await api.get(`/users/search${params}`);
      setUsers(data);
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => load(query), 300);
    return () => clearTimeout(id);
  }, [query, load]);

  const sendRequest = async (u: UserRow) => {
    setBusyId(u.user_id);
    try {
      await api.post("/friends/request", { target_user_id: u.user_id });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load(query);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusyId(null);
    }
  };

  const openDM = async (u: UserRow) => {
    try {
      const chat = await api.post("/chats/dm", { target_user_id: u.user_id });
      router.push(`/chat/${chat.chat_id}`);
    } catch {}
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="discover-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Discover</Text>
        <Text style={styles.sub}>Find anonymous folks in {user?.college_id?.toUpperCase().replace("-", " ") || "your campus"}.</Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.onSurfaceMuted} />
        <TextInput
          testID="discover-search-input"
          style={styles.searchInput}
          placeholder="Search by handle (e.g. BlueTiger)"
          placeholderTextColor={colors.onSurfaceMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      </View>

      {users === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.user_id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 24, gap: spacing.sm }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No one matches that yet.</Text>
              <Text style={styles.emptySub}>Try shuffling your search or invite friends.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row} testID={`discover-row-${item.user_id}`}>
              {item.profile_pic ? (
                <Image source={{ uri: item.profile_pic }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, { backgroundColor: colorForName(item.anon_username) }]}>
                  <Text style={styles.initials}>
                    {item.anon_username.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.anon_username}</Text>
                <Text style={styles.statusLabel}>
                  {item.friendship?.status === "accepted"
                    ? "Friend"
                    : item.friendship?.status === "pending"
                    ? item.friendship.direction === "out"
                      ? "Request sent"
                      : "Wants to be friends"
                    : "Anonymous student"}
                </Text>
              </View>
              {item.friendship?.status === "accepted" ? (
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.brandTertiary }]}
                  onPress={() => openDM(item)}
                  testID={`discover-dm-${item.user_id}`}
                >
                  <Ionicons name="chatbubble" size={16} color={colors.onSurface} />
                  <Text style={styles.actionText}>Message</Text>
                </Pressable>
              ) : item.friendship?.status === "pending" ? (
                <View style={[styles.actionBtn, { backgroundColor: colors.surfaceTertiary }]}>
                  <Text style={[styles.actionText, { color: colors.brand }]}>
                    {item.friendship.direction === "out" ? "Pending" : "Check requests"}
                  </Text>
                </View>
              ) : (
                <Pressable
                  testID={`discover-add-${item.user_id}`}
                  disabled={busyId === item.user_id}
                  style={[styles.actionBtn, { backgroundColor: colors.brand }]}
                  onPress={() => sendRequest(item)}
                >
                  {busyId === item.user_id ? (
                    <ActivityIndicator color={colors.onBrandPrimary} size="small" />
                  ) : (
                    <>
                      <Ionicons name="person-add" size={14} color={colors.onBrandPrimary} />
                      <Text style={[styles.actionText, { color: colors.onBrandPrimary }]}>Add</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: 4 },
  title: { fontSize: 30, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.4 },
  sub: { color: colors.onSurfaceMuted, fontSize: 14 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    marginHorizontal: spacing.xl,
    marginVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  initials: { color: "#fff", fontWeight: "800", fontSize: 15 },
  name: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  statusLabel: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  actionBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    minWidth: 88,
    justifyContent: "center",
  },
  actionText: { fontWeight: "800", fontSize: 13, color: colors.onSurface },
  empty: { alignItems: "center", marginTop: 80, gap: 6 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  emptySub: { fontSize: 13, color: colors.onSurfaceMuted },
});
