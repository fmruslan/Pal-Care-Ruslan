"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { SunMoon } from "lucide-react";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  // Reserve the same control on the server; storage-dependent selection is client-only.
  const mounted = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  return (
    <label className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-input bg-card px-3 text-sm font-medium shadow-card">
      <SunMoon className="size-4 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">Appearance</span>
      <select
        aria-label="Appearance"
        value={mounted ? (theme ?? "system") : "system"}
        disabled={!mounted}
        onChange={(event) => setTheme(event.target.value)}
        className="min-h-11 max-w-22 cursor-pointer bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
