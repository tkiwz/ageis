"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

const VARS = ["primary", "foreground", "muted-foreground", "border", "card", "background", "info", "success", "warning", "danger",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6"] as const;
type Var = (typeof VARS)[number];

/**
 * Resolved token colours for libraries that need real colour strings
 * (recharts, leaflet, three.js). Re-reads when the theme changes.
 */
export function useThemeColors(): Record<Var, string> {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState<Record<Var, string>>(() => Object.fromEntries(VARS.map((v) => [v, "#888"])) as Record<Var, string>);
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    setColors(Object.fromEntries(VARS.map((v) => [v, `hsl(${cs.getPropertyValue(`--${v}`).trim()})`])) as Record<Var, string>);
  }, [resolvedTheme]);
  return colors;
}
