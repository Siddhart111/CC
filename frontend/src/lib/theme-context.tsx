import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

import { storage } from "@/src/utils/storage";
import { ColorScheme, darkColors, lightColors } from "./theme";

export type ThemeMode = "light" | "dark" | "auto";

type ThemeCtx = {
  mode: ThemeMode;
  effective: "light" | "dark";
  colors: ColorScheme;
  setMode: (m: ThemeMode) => Promise<void>;
  toggle: () => Promise<void>;
};

const Ctx = createContext<ThemeCtx | null>(null);
const KEY = "cc_theme_mode";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("auto");

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string>(KEY, "");
      if (saved === "light" || saved === "dark" || saved === "auto") {
        setModeState(saved);
      }
    })();
  }, []);

  const effective: "light" | "dark" =
    mode === "auto" ? (system === "dark" ? "dark" : "light") : mode;
  const colors = effective === "dark" ? darkColors : lightColors;

  const setMode = useCallback(async (m: ThemeMode) => {
    setModeState(m);
    await storage.setItem(KEY, m);
  }, []);

  const toggle = useCallback(async () => {
    const next: ThemeMode = effective === "dark" ? "light" : "dark";
    await setMode(next);
  }, [effective, setMode]);

  const value = useMemo<ThemeCtx>(
    () => ({ mode, effective, colors, setMode, toggle }),
    [mode, effective, colors, setMode, toggle],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) {
    // Fall back to light theme if used outside provider
    return {
      mode: "light",
      effective: "light",
      colors: lightColors,
      setMode: async () => {},
      toggle: async () => {},
    };
  }
  return v;
}
