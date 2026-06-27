import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, getToken, wsUrl } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth-context";
import { colorForName } from "@/src/lib/avatars";
import { radius, spacing, useTheme } from "@/src/lib/theme";

type Message = {
  message_id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: { anon_username: string; profile_pic: string | null };
};

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [title, setTitle] = useState("Chat");
  const [isGroup, setIsGroup] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<FlatList>(null);

  const chatId = String(id || "");

  const loadMessages = useCallback(async () => {
    try {
      const msgs = await api.get(`/chats/${chatId}/messages`);
      setMessages(msgs);
    } catch (e) {
      setMessages([]);
    }
  }, [chatId]);

  // determine title from chats list
  const loadMeta = useCallback(async () => {
    try {
      const chats = await api.get("/chats");
      const c = chats.find((x: any) => x.chat_id === chatId);
      if (c) {
        setTitle(c.title || "Chat");
        setIsGroup(c.type === "group");
      }
    } catch {}
  }, [chatId]);

  useEffect(() => {
    loadMeta();
    loadMessages();
  }, [loadMeta, loadMessages]);

  // WS subscription
  useEffect(() => {
    let alive = true;
    let pingInt: any = null;
    (async () => {
      const tok = await getToken();
      if (!tok || !alive) return;
      try {
        const ws = new WebSocket(wsUrl(tok));
        wsRef.current = ws;
        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === "message" && data.chat_id === chatId) {
              setMessages((prev) => {
                const list = prev ? [...prev] : [];
                if (list.some((m) => m.message_id === data.message.message_id)) return list;
                return [...list, data.message];
              });
              setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
            }
          } catch {}
        };
        ws.onopen = () => {
          pingInt = setInterval(() => {
            try {
              ws.send(JSON.stringify({ type: "ping" }));
            } catch {}
          }, 25000);
        };
      } catch {}
    })();
    return () => {
      alive = false;
      if (pingInt) clearInterval(pingInt);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [chatId]);

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const msg = await api.post(`/chats/${chatId}/messages`, { content });
      setMessages((prev) => {
        const list = prev ? [...prev] : [];
        if (list.some((m) => m.message_id === msg.message_id)) return list;
        return [...list, msg];
      });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch {
      setText(content);
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="chat-screen">
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="chat-back-btn" style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={[styles.headerAvatar, { backgroundColor: colorForName(title) }]}>
          <Text style={styles.headerInitials}>{(title || "?").slice(0, 2).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1} testID="chat-header-title">
            {title}
          </Text>
          <Text style={styles.headerSub}>{isGroup ? "Campus group" : "Direct message"}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 4 : 0}
      >
        {messages === null ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.message_id}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 8 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyBadge}>
                  <Ionicons name="hand-left" size={28} color={colors.brand} />
                </View>
                <Text style={styles.emptyTitle}>Say hi anonymously</Text>
                <Text style={styles.emptySub}>Your handle is the only thing they{"’"}ll see.</Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const mine = item.sender_id === user?.user_id;
              const prev = messages[index - 1];
              const showSender = isGroup && !mine && (!prev || prev.sender_id !== item.sender_id);
              return (
                <View style={[styles.bubbleRow, mine ? styles.right : styles.left]}>
                  {!mine && isGroup ? (
                    <View
                      style={[
                        styles.smallAvatar,
                        { backgroundColor: colorForName(item.sender?.anon_username || "x") },
                      ]}
                    >
                      <Text style={styles.smallAvatarText}>
                        {(item.sender?.anon_username || "?").slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                  ) : null}
                  <View style={{ maxWidth: "76%" }}>
                    {showSender ? (
                      <Text style={styles.senderName}>{item.sender?.anon_username}</Text>
                    ) : null}
                    <View
                      style={[
                        styles.bubble,
                        mine ? styles.bubbleMine : styles.bubbleOther,
                      ]}
                    >
                      <Text style={[styles.bubbleText, mine && { color: colors.onBrandPrimary }]}>
                        {item.content}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}

        <View style={styles.inputBar}>
          <TextInput
            testID="chat-input"
            value={text}
            onChangeText={setText}
            placeholder="Type a message…"
            placeholderTextColor={colors.onSurfaceMuted}
            style={styles.input}
            multiline
            maxLength={1000}
          />
          <Pressable
            testID="chat-send-btn"
            disabled={!text.trim() || sending}
            onPress={send}
            style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
          >
            <Ionicons name="send" size={20} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  headerInitials: { color: "#fff", fontWeight: "800", fontSize: 13 },
  headerTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  headerSub: { fontSize: 11, color: colors.onSurfaceMuted, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  left: { justifyContent: "flex-start", alignSelf: "flex-start" },
  right: { alignSelf: "flex-end" },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.lg,
  },
  bubbleMine: {
    backgroundColor: colors.brand,
    borderBottomRightRadius: 6,
  },
  bubbleOther: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 6,
  },
  bubbleText: { color: colors.onSurface, fontSize: 15, lineHeight: 20 },
  senderName: { fontSize: 11, fontWeight: "800", color: colors.brand, marginBottom: 2, marginLeft: 8 },
  smallAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  smallAvatarText: { color: "#fff", fontWeight: "800", fontSize: 10 },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    paddingBottom: Platform.OS === "ios" ? spacing.lg : spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.onSurface,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { alignItems: "center", paddingVertical: 80, gap: 8 },
  emptyBadge: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  emptySub: { fontSize: 13, color: colors.onSurfaceMuted },
});
