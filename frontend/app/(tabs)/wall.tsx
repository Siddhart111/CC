import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/src/lib/api";
import { radius, spacing, useTheme } from "@/src/lib/theme";

type Mood = "lol" | "spicy" | "vent" | "love" | "wholesome" | "tea";

const MOODS: { id: Mood; label: string; emoji: string }[] = [
  { id: "lol", label: "LOL", emoji: "😂" },
  { id: "spicy", label: "Spicy", emoji: "🌶️" },
  { id: "tea", label: "Tea", emoji: "🫖" },
  { id: "love", label: "Crush", emoji: "💌" },
  { id: "vent", label: "Vent", emoji: "💭" },
  { id: "wholesome", label: "Soft", emoji: "🫶" },
];

type Confession = {
  confession_id: string;
  content: string;
  mood: Mood | null;
  anon_username: string;
  color: string;
  heart_count: number;
  has_hearted: boolean;
  is_mine: boolean;
  created_at: string;
};

function timeAgo(iso: string) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function Wall() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [items, setItems] = useState<Confession[] | null>(null);
  const [sort, setSort] = useState<"new" | "hot">("new");
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState("");
  const [mood, setMood] = useState<Mood | null>(null);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async (s: "new" | "hot") => {
    try {
      const data = await api.get(`/confessions?sort=${s}`);
      setItems(data);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load(sort);
  }, [sort, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(sort);
    setRefreshing(false);
  }, [sort, load]);

  const submit = async () => {
    const content = draft.trim();
    if (!content || posting) return;
    setPosting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const newOne = await api.post("/confessions", { content, mood });
      setItems((prev) => [newOne, ...(prev || [])]);
      setDraft("");
      setMood(null);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPosting(false);
    }
  };

  const toggleHeart = async (c: Confession) => {
    // optimistic
    setItems((prev) =>
      (prev || []).map((x) =>
        x.confession_id === c.confession_id
          ? {
              ...x,
              has_hearted: !x.has_hearted,
              heart_count: x.heart_count + (x.has_hearted ? -1 : 1),
            }
          : x,
      ),
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api.post(`/confessions/${c.confession_id}/heart`);
    } catch {
      // revert
      setItems((prev) =>
        (prev || []).map((x) =>
          x.confession_id === c.confession_id
            ? {
                ...x,
                has_hearted: c.has_hearted,
                heart_count: c.heart_count,
              }
            : x,
        ),
      );
    }
  };

  const composerOpen = draft.length > 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="wall-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <Text style={styles.title}>The Wall</Text>
          <Text style={styles.sub}>Anonymous confessions from your campus.</Text>
        </View>

        {/* Sort segmented */}
        <View style={styles.segment}>
          {(["new", "hot"] as const).map((s) => {
            const active = sort === s;
            return (
              <Pressable
                key={s}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSort(s);
                }}
                style={[styles.segmentBtn, active && styles.segmentActive]}
                testID={`wall-sort-${s}`}
              >
                <Ionicons
                  name={s === "new" ? "sparkles" : "flame"}
                  size={14}
                  color={active ? colors.surface : colors.onSurfaceMuted}
                />
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {s === "new" ? "Fresh" : "Hot"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Composer */}
        <View style={styles.composer}>
          <TextInput
            testID="wall-composer-input"
            value={draft}
            onChangeText={setDraft}
            placeholder="Drop an anonymous confession…"
            placeholderTextColor={colors.onSurfaceMuted}
            style={styles.composerInput}
            multiline
            maxLength={600}
          />
          {composerOpen && (
            <View>
              <View style={styles.moodRow}>
                {MOODS.map((m) => {
                  const active = mood === m.id;
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => setMood(active ? null : m.id)}
                      style={[styles.moodChip, active && { backgroundColor: colors.brand, borderColor: colors.brand }]}
                      testID={`wall-mood-${m.id}`}
                    >
                      <Text style={styles.moodEmoji}>{m.emoji}</Text>
                      <Text style={[styles.moodLabel, active && { color: colors.onBrandPrimary }]}>
                        {m.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.composerActions}>
                <Text style={styles.counter}>{600 - draft.length} chars left</Text>
                <Pressable
                  testID="wall-post-btn"
                  disabled={posting || !draft.trim()}
                  onPress={submit}
                  style={[styles.postBtn, (posting || !draft.trim()) && { opacity: 0.5 }]}
                >
                  {posting ? (
                    <ActivityIndicator color={colors.onBrandPrimary} size="small" />
                  ) : (
                    <>
                      <Ionicons name="paper-plane" size={14} color={colors.onBrandPrimary} />
                      <Text style={styles.postBtnText}>Drop</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {items === null ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(c) => c.confession_id}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40, gap: spacing.md }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyBadge}>
                  <Ionicons name="leaf-outline" size={32} color={colors.brand} />
                </View>
                <Text style={styles.emptyTitle}>Be the first to drop</Text>
                <Text style={styles.emptySub}>The wall is quiet… start the chaos.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const moodMeta = MOODS.find((m) => m.id === item.mood);
              return (
                <View style={styles.card} testID={`confession-card-${item.confession_id}`}>
                  <View style={styles.cardTop}>
                    <View style={[styles.maskBadge, { backgroundColor: item.color }]}>
                      <Ionicons name="eye-off" size={12} color={colors.onSurface} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.maskName}>{item.anon_username}</Text>
                      <Text style={styles.timeText}>{timeAgo(item.created_at)}</Text>
                    </View>
                    {moodMeta ? (
                      <View style={styles.moodPill}>
                        <Text>{moodMeta.emoji}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.cardContent}>{item.content}</Text>
                  <View style={styles.cardActions}>
                    <Pressable
                      testID={`confession-heart-${item.confession_id}`}
                      onPress={() => toggleHeart(item)}
                      style={({ pressed }) => [
                        styles.heartBtn,
                        item.has_hearted && styles.heartBtnActive,
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <Ionicons
                        name={item.has_hearted ? "heart" : "heart-outline"}
                        size={18}
                        color={item.has_hearted ? colors.brand : colors.onSurfaceMuted}
                      />
                      <Text
                        style={[
                          styles.heartCount,
                          item.has_hearted && { color: colors.brand },
                        ]}
                      >
                        {item.heart_count}
                      </Text>
                    </Pressable>
                    <View style={{ flex: 1 }} />
                    <Text style={styles.silenceLabel}>· no replies</Text>
                  </View>
                </View>
              );
            }}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: 4 },
  title: { fontSize: 30, fontWeight: "800", color: colors.onSurface, letterSpacing: -0.4 },
  sub: { color: colors.onSurfaceMuted, fontSize: 13 },
  segment: {
    flexDirection: "row",
    alignSelf: "flex-start",
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  segmentBtn: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  segmentActive: { backgroundColor: colors.onSurface },
  segmentText: { fontSize: 12, fontWeight: "800", color: colors.onSurfaceMuted },
  segmentTextActive: { color: colors.surface },
  composer: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  composerInput: {
    fontSize: 15,
    color: colors.onSurface,
    minHeight: 44,
    maxHeight: 120,
    textAlignVertical: "top",
  },
  moodRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  moodChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  moodEmoji: { fontSize: 14 },
  moodLabel: { fontSize: 12, fontWeight: "800", color: colors.onSurface },
  composerActions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  counter: { color: colors.onSurfaceMuted, fontSize: 11, flex: 1 },
  postBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  postBtnText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  maskBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  maskName: { fontSize: 13, fontWeight: "800", color: colors.onSurface },
  timeText: { fontSize: 11, color: colors.onSurfaceMuted, fontWeight: "600", marginTop: 1 },
  moodPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardContent: { fontSize: 16, lineHeight: 22, color: colors.onSurface },
  cardActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 },
  heartBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heartBtnActive: { backgroundColor: colors.surfaceTertiary, borderColor: colors.brand },
  heartCount: { fontSize: 13, fontWeight: "800", color: colors.onSurfaceMuted },
  silenceLabel: { fontSize: 11, color: colors.onSurfaceMuted, fontStyle: "italic" },
  empty: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  emptySub: { fontSize: 14, color: colors.onSurfaceMuted },
});
