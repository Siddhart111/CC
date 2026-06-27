// Campus Chat design tokens
export const colors = {
  surface: "#FDFCF8",
  surfaceSecondary: "#FFFFFF",
  surfaceTertiary: "#FFF0E6",
  surfaceInverse: "#1A1A1A",
  onSurface: "#1A1A1A",
  onSurfaceMuted: "#6B6B6B",
  onSurfaceInverse: "#FDFCF8",
  brand: "#FF6B6B",
  brandPrimary: "#FF6B6B",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#FFC13B",
  onBrandSecondary: "#1A1A1A",
  brandTertiary: "#4ECDC4",
  onBrandTertiary: "#1A1A1A",
  success: "#4ECDC4",
  warning: "#FFC13B",
  error: "#FF6B6B",
  border: "#E8E6E1",
  borderStrong: "#1A1A1A",
  divider: "#E8E6E1",
  shadow: "rgba(26,26,26,0.08)",
};

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

export const typography = {
  display: "Fredoka_600SemiBold", // loaded at runtime, falls back to system
  displayBold: "Fredoka_700Bold",
  text: "Nunito_400Regular",
  textSemi: "Nunito_600SemiBold",
  textBold: "Nunito_700Bold",
};

export const shadow = {
  small: {
    shadowColor: "#1A1A1A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  medium: {
    shadowColor: "#1A1A1A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
};
