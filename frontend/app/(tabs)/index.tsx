import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth-context";
import { colorForName } from "@/src/lib/avatars";
import { spacing, useTheme } from "@/src/lib/theme";

type ChatRow = {
  chat_id: string;
  type: "dm" | "group";
  title?: string;
  cover?: string;
  profile_pic?: string | null;
  members_count?: number;
  other_user_id?: string;
  last_message?: { content: string; created_at: string; sender_id: string } | null;
};

function timeAgo(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function ChatsList() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [chats, setChats] = useState<ChatRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get("/chats");
      setChats(data);
    } catch {
      setChats([]);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000); // light polling backup
    return () => clearInterval(id);
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="chats-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Hey,</Text>
          <Text style={styles.headerName} testID="chats-header-username">
            {user?.anon_username ?? ""}
          </Text>
        </View>
        <Pressable
          style={styles.newChatBtn}
          onPress={() => router.push("/(tabs)/discover")}
          testID="new-chat-btn"
          hitSlop={10}
        >
          <Ionicons name="add" size={26} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      {chats === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(c) => c.chat_id}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          ListEmptyComponent={
            <View style={styles.empty} testID="chats-empty">
              <View style={styles.emptyBadge}>
                <Ionicons name="chatbubble-ellipses-outline" size={36} color={colors.brand} />
              </View>
              <Text style={styles.emptyTitle}>No chats yet</Text>
              <Text style={styles.emptySub}>Hop into your campus lounge or message a friend.</Text>
            </View>
          }
          renderItem={({ item }) => <ChatItem item={item} onPress={() => router.push(`/chat/${item.chat_id}`)} />}
        />
      )}
    </SafeAreaView>
  );
}

function ChatItem({ item, onPress }: { item: ChatRow; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const isGroup = item.type === "group";
  const title = item.title ?? (isGroup ? "Group" : "Chat");
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: "#F4F2EC" }]}
      onPress={onPress}
      testID={`chat-row-${item.chat_id}`}
    >
      <View>
        {isGroup ? (
          <View style={[styles.avatar, { backgroundColor: colors.brandSecondary }]}>
            {item.cover ? (
              <Image source={{ uri: item.cover }} style={styles.avatar} contentFit="cover" />
            ) : (
              <Text style={styles.initials}>{title.slice(0, 2).toUpperCase()}</Text>
            )}
          </View>
        ) : item.profile_pic ? (
          <Image source={{ uri: item.profile_pic }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colorForName(title) }]}>
            <Text style={styles.initials}>{title.slice(0, 2).toUpperCase()}</Text>
          </View>
        )}
        {isGroup ? (
          <View style={styles.groupBadge}>
            <Ionicons name="people" size={10} color={colors.onSurface} />
          </View>
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title}
            {isGroup && item.members_count ? ` · ${item.members_count}` : ""}
          </Text>
          <Text style={styles.rowTime}>{timeAgo(item.last_message?.created_at)}</Text>
        </View>
        <Text style={styles.rowPreview} numberOfLines={1}>
          {item.last_message?.content || (isGroup ? "Say hi to your campus 👋" : "Start the conversation")}
        </Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  hello: { color: colors.onSurfaceMuted, fontSize: 13, fontWeight: "600" },
  headerName: { fontSize: 26, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.3 },
  newChatBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    minHeight: 72,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  initials: { color: "#fff", fontWeight: "800", fontSize: 17 },
  groupBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface, flex: 1, marginRight: 8 },
  rowTime: { fontSize: 12, color: colors.onSurfaceMuted, fontWeight: "600" },
  rowPreview: { fontSize: 14, color: colors.onSurfaceMuted, marginTop: 2 },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.md,
    marginTop: 80,
  },
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
});
