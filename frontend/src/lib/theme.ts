// Campus Chat design tokens — light + dark palettes
export const lightColors = {
  surface: "#FDFCF8",
  surfaceSecondary: "#FFFFFF",
  surfaceTertiary: "#F3E8FF",
  surfaceInverse: "#1A1A1A",
  onSurface: "#1A1A1A",
  onSurfaceMuted: "#6B6B6B",
  onSurfaceInverse: "#FDFCF8",
  brand: "#A855F7",
  brandPrimary: "#A855F7",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#FFC13B",
  onBrandSecondary: "#1A1A1A",
  brandTertiary: "#4ECDC4",
  onBrandTertiary: "#1A1A1A",
  success: "#4ECDC4",
  warning: "#FFC13B",
  error: "#EF4444",
  border: "#E8E6E1",
  borderStrong: "#1A1A1A",
  divider: "#E8E6E1",
  inputBg: "#FFFFFF",
  bubbleOther: "#FFFFFF",
  errorBg: "#FEE2E2",
  overlayScrim: "rgba(253,252,248,0.95)",
  shadow: "rgba(26,26,26,0.08)",
};

export const darkColors: typeof lightColors = {
  surface: "#0E0F12",
  surfaceSecondary: "#171A20",
  surfaceTertiary: "#2A1F3D",
  surfaceInverse: "#FDFCF8",
  onSurface: "#F5F4EE",
  onSurfaceMuted: "#9C9A92",
  onSurfaceInverse: "#0E0F12",
  brand: "#C084FC",
  brandPrimary: "#C084FC",
  onBrandPrimary: "#0E0F12",
  brandSecondary: "#FFCB58",
  onBrandSecondary: "#0E0F12",
  brandTertiary: "#56D6CD",
  onBrandTertiary: "#0E0F12",
  success: "#56D6CD",
  warning: "#FFCB58",
  error: "#F87171",
  border: "#26292F",
  borderStrong: "#F5F4EE",
  divider: "#26292F",
  inputBg: "#1F232A",
  bubbleOther: "#1F232A",
  errorBg: "#3A1F2A",
  overlayScrim: "rgba(14,15,18,0.95)",
  shadow: "rgba(0,0,0,0.5)",
};

export type ColorScheme = typeof lightColors;

// Back-compat: legacy `colors` import used by code paths that don't read from context.
// Defaults to light. Real screens should call useTheme().
export const colors: ColorScheme = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

// Re-exported for convenience. The cycle warning is harmless because
// theme-context only reads named exports (lightColors/darkColors/ColorScheme)
// after both modules have finished evaluating their constants.
export { useTheme } from "./theme-context";

