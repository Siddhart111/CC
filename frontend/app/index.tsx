import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/src/lib/auth-context";
import { spacing } from "@/src/lib/theme";

const CC_LOGO = require("../assets/cc-logo.png");
const BG = "#08070C";
const GLOW = "rgba(168, 85, 247, 0.55)";
const ACCENT = "#C084FC";

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Subtle entrance + pulse
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;
  const pulse = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
    ]).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.6,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [fade, scale, pulse]);

  useEffect(() => {
    if (loading) return;
    if (user) router.replace("/(tabs)");
    else router.replace("/(auth)/welcome");
  }, [user, loading, router]);

  const glowScale = pulse.interpolate({ inputRange: [0.6, 1], outputRange: [1, 1.18] });
  const glowOpacity = pulse.interpolate({ inputRange: [0.6, 1], outputRange: [0.35, 0.7] });

  return (
    <View style={styles.container} testID="splash-screen">
      {/* Subtle radial vignette using two stacked gradients */}
      <LinearGradient
        colors={["#160826", "#000000", "#000000"]}
        locations={[0, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["transparent", `${ACCENT}1A`, "transparent"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.center}>
        <Animated.View
          style={[
            styles.logoWrap,
            { opacity: fade, transform: [{ scale }] },
          ]}
        >
          {/* Pulsing glow under the logo */}
          <Animated.View
            style={[
              styles.glow,
              { opacity: glowOpacity, transform: [{ scale: glowScale }] },
            ]}
          />
          <Image source={CC_LOGO} style={styles.logo} resizeMode="contain" />
        </Animated.View>

        <Animated.View style={{ opacity: fade, alignItems: "center", marginTop: spacing.xl }}>
          <Text style={styles.title}>Campus Chat</Text>
          <Text style={styles.subtitle}>Anonymous. Campus only.</Text>
        </Animated.View>

        {/* Dotted progress */}
        <Animated.View style={[styles.dots, { opacity: fade }]}>
          <DotLoader />
        </Animated.View>
      </View>

      <Text style={styles.footer}>Created by Siddharth Nishad</Text>
    </View>
  );
}

function DotLoader() {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  const c = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const make = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 400, useNativeDriver: true }),
          Animated.delay(400 - delay),
        ]),
      );
    const anims = [make(a, 0), make(b, 150), make(c, 300)];
    anims.forEach((x) => x.start());
    return () => anims.forEach((x) => x.stop());
  }, [a, b, c]);

  const dot = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [
      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.1] }) },
    ],
  });

  return (
    <View style={dotStyles.row}>
      <Animated.View style={[dotStyles.dot, dot(a)]} />
      <Animated.View style={[dotStyles.dot, dot(b)]} />
      <Animated.View style={[dotStyles.dot, dot(c)]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  logoWrap: { alignItems: "center", justifyContent: "center" },
  glow: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: GLOW,
    shadowColor: ACCENT,
    shadowOpacity: 1,
    shadowRadius: 90,
    shadowOffset: { width: 0, height: 0 },
  },
  logo: { width: 280, height: 160 },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#F5F4EE",
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: "#9C9A92",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  dots: { marginTop: spacing.xxl },
  footer: {
    position: "absolute",
    bottom: 36,
    alignSelf: "center",
    color: "#6B6B6B",
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: "700",
  },
});

const dotStyles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ACCENT,
  },
});

});
