"use client";

import { ThemeProvider as NextThemeProvider, useTheme } from "next-themes";
import { useEffect } from "react";

function BrowserThemeColor() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!resolvedTheme) return;
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.setAttribute(
        "content",
        resolvedTheme === "dark" ? "#0B1020" : "#FAFBFF",
      );
    });
  }, [resolvedTheme]);
  return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      enableColorScheme
      storageKey="palcare-appearance"
      disableTransitionOnChange
    >
      <BrowserThemeColor />
      {children}
    </NextThemeProvider>
  );
}
