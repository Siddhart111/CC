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
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/lib/api";
import { colorForName } from "@/src/lib/avatars";
import { colors, radius, spacing } from "@/src/lib/theme";

type Friend = {
  user_id: string;
  anon_username: string;
  profile_pic: string | null;
};

type Request = {
  request_id: string;
  created_at: string;
  from: Friend;
};

export default function Friends() {
  const router = useRouter();
  const [tab, setTab] = useState<"friends" | "requests">("friends");
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [fs, rs] = await Promise.all([api.get("/friends"), api.get("/friends/requests")]);
      setFriends(fs);
      setRequests(rs);
    } catch {
      setFriends([]);
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const respond = async (request_id: string, action: "accept" | "reject") => {
    setBusy(request_id + action);
    try {
      await api.post("/friends/respond", { request_id, action });
      Haptics.notificationAsync(
        action === "accept" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
      );
      await load();
    } catch {
    } finally {
      setBusy(null);
    }
  };

  const startDM = async (uid: string) => {
    try {
      const chat = await api.post("/chats/dm", { target_user_id: uid });
      router.push(`/chat/${chat.chat_id}`);
    } catch {}
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="friends-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Friends</Text>
      </View>

      <View style={styles.segment}>
        {(["friends", "requests"] as const).map((t) => {
          const active = tab === t;
          const count = t === "friends" ? friends?.length : requests?.length;
          return (
            <Pressable
              key={t}
              onPress={() => {
                Haptics.selectionAsync();
                setTab(t);
              }}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}
              testID={`friends-tab-${t}`}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {t === "friends" ? "Friends" : "Requests"}
                {count ? ` · ${count}` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === "friends" ? (
        friends === null ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={friends}
            keyExtractor={(f) => f.user_id}
            contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: 40 }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyBadge}>
                  <Ionicons name="sparkles" size={32} color={colors.brand} />
                </View>
                <Text style={styles.emptyTitle}>No friends yet</Text>
                <Text style={styles.emptySub}>Find folks from your campus on Discover.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => startDM(item.user_id)}
                testID={`friend-row-${item.user_id}`}
              >
                {item.profile_pic ? (
                  <Image source={{ uri: item.profile_pic }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: colorForName(item.anon_username) }]}>
                    <Text style={styles.initials}>{item.anon_username.slice(0, 2).toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.anon_username}</Text>
                  <Text style={styles.statusLabel}>Tap to message</Text>
                </View>
                <Ionicons name="chatbubble-ellipses" size={22} color={colors.brand} />
              </Pressable>
            )}
          />
        )
      ) : requests === null ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.request_id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyBadge}>
                <Ionicons name="mail-open-outline" size={32} color={colors.brand} />
              </View>
              <Text style={styles.emptyTitle}>No requests right now</Text>
              <Text style={styles.emptySub}>When someone wants to connect, they{"’"}ll show up here.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.reqCard} testID={`request-card-${item.request_id}`}>
              <View style={styles.row}>
                {item.from.profile_pic ? (
                  <Image source={{ uri: item.from.profile_pic }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: colorForName(item.from.anon_username) }]}>
                    <Text style={styles.initials}>
                      {item.from.anon_username.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.from.anon_username}</Text>
                  <Text style={styles.statusLabel}>wants to chat anonymously</Text>
                </View>
              </View>
              <View style={styles.reqActions}>
                <Pressable
                  testID={`request-reject-${item.request_id}`}
                  disabled={!!busy}
                  style={[styles.reqBtn, styles.reqReject]}
                  onPress={() => respond(item.request_id, "reject")}
                >
                  <Text style={styles.reqRejectText}>Reject</Text>
                </Pressable>
                <Pressable
                  testID={`request-accept-${item.request_id}`}
                  disabled={!!busy}
                  style={[styles.reqBtn, styles.reqAccept]}
                  onPress={() => respond(item.request_id, "accept")}
                >
                  <Text style={styles.reqAcceptText}>Accept</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 30, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.4 },
  segment: {
    flexDirection: "row",
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: "center" },
  segmentBtnActive: { backgroundColor: colors.onSurface },
  segmentText: { fontWeight: "700", fontSize: 13, color: colors.onSurfaceMuted },
  segmentTextActive: { color: colors.surface },
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
  empty: { alignItems: "center", marginTop: 80, gap: 10 },
  emptyBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  emptySub: { fontSize: 14, color: colors.onSurfaceMuted, textAlign: "center" },
  reqCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  reqActions: { flexDirection: "row", gap: spacing.sm },
  reqBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  reqAccept: { backgroundColor: colors.brandTertiary },
  reqAcceptText: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  reqReject: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.borderStrong },
  reqRejectText: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
});
