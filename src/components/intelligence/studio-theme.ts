import { studioTheme } from "ag-studio";

// Native grids/charts use the same semantic colors as the surrounding product.
// The SDK resolves CSS colors for canvas rendering through its style sensor.
export const purchaseStudioTheme = studioTheme.withParams({
  fontFamily: "var(--font-geist-sans), sans-serif",
  accentColor: "var(--primary)",
  backgroundColor: "var(--card)",
  foregroundColor: "var(--foreground)",
  borderColor: "var(--border)",
  browserColorScheme: "inherit",
});
