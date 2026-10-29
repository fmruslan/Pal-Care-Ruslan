export type WidgetObservation = {
  id: string;
  page: string;
  generation: number;
  rows: string[] | null;
};

export type NativeWidgetDisplay = {
  type: "value" | "grid" | "bar-chart-grouped";
  ready: boolean;
  value?: number;
  rows?: number;
};
export function nativeDisplayVerified(
  displays: NativeWidgetDisplay[],
  expectedCount: number,
): boolean {
  return (
    displays.length > 0 &&
    displays.every(
      (display) =>
        display.ready &&
        (display.type === "value"
          ? display.value === expectedCount
          : display.type === "grid"
            ? display.rows === expectedCount
            : true),
    )
  );
}

export function stateFingerprint(value: unknown): string {
  const ordered = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(ordered)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .filter(([, item]) => item !== undefined)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, item]) => [key, ordered(item)]),
          )
        : v;
  return JSON.stringify(ordered(value));
}

/** Every relevant custom widget must finish this exact page/generation query. */
export function observedWidgets(
  required: string[],
  observations: Map<string, WidgetObservation>,
  generation: number,
  page: string,
  expectedIds: string[],
): "waiting" | "failed" | "complete" {
  const expected = [...expectedIds].sort();
  let waiting = false;
  for (const id of required) {
    const observed = observations.get(id);
    if (
      !observed ||
      observed.generation !== generation ||
      observed.page !== page
    ) {
      waiting = true;
      continue;
    }
    if (
      observed.rows === null ||
      observed.rows.length !== new Set(observed.rows).size ||
      stateFingerprint([...observed.rows].sort()) !== stateFingerprint(expected)
    )
      return "failed";
  }
  return waiting ? "waiting" : "complete";
}
