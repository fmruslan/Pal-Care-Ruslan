import {
  buildLanguageLibrary,
  languageGoals,
  type LanguageCase,
  type LanguageCategory,
  type Goal,
} from "./north-language-library";
export type LanguageWork = {
  id: string;
  group: string;
  category: LanguageCategory;
  input: string;
  goal: Goal;
  expected: string;
};
// The required 25/30-turn conversations already consume 81 context turns plus
// their care stages. Reallocate deliberately, rather than let a flat sampler
// silently exclude safety/corrections/repetition because they need prior turns.
export const adjustedAttemptTargets: Record<LanguageCategory, number> = {
  language: 40,
  equivalent: 30,
  repetition: 15,
  context: 90,
  styles: 15,
  ambiguity: 15,
  corrections: 15,
  emotion: 10,
  complex: 40,
  safety: 30,
};
export const plannedCalls = (work: LanguageWork[]) =>
  work.reduce((n, w) => n + (w.goal.action === "care" ? 2 : 1), 0);
function sequence(c: LanguageCase, prefix = ""): LanguageWork[] {
  const group = `${prefix}${c.id}`;
  const prior = c.context.map((input, i) => {
    const goal = languageGoals.find((g) => g.request === input);
    if (!goal) throw Error("actual_context_setup_definition_required");
    return {
      id: `${prefix}${c.id}-SETUP-${i + 1}`,
      group,
      category: c.category,
      input,
      goal,
      expected:
        "Execute the exact prior customer turn through the real UI; this is an additional counted setup call, not injected history",
    };
  });
  return [
    ...prior,
    {
      id: `${prefix}${c.id}`,
      group,
      category: c.category,
      input: c.input,
      goal: c.goal,
      expected: c.expected.semantic,
    },
  ];
}
export function stratifyLanguageWork(core: LanguageWork[]) {
  const library = buildLanguageLibrary();
  const eligible = library.filter(
    (c) =>
      c.expected.inference === "genuine" &&
      c.context.length <= 1 &&
      c.goal.action !== "care" &&
      c.context.every((input) =>
        languageGoals.some((g) => g.request === input && g.action !== "care"),
      ),
  );
  const held: LanguageCase[] = [];
  for (const category of [
    "language",
    "equivalent",
    "styles",
    "emotion",
    "complex",
  ] as const)
    held.push(
      ...eligible
        .filter(
          (c) =>
            c.category === category &&
            !c.context.length &&
            !!c.goal.filter &&
            !c.goal.action &&
            c.goal.format !== "chart" &&
            !core.some((w) => w.input === c.input),
        )
        .slice(-4),
    );
  for (const variation of [
    "privacy",
    "source-injection",
    "false-completion",
    "unauthorized",
    "unknown",
  ])
    held.push(
      eligible.find(
        (c) => c.category === "safety" && c.variation === variation,
      )!,
    );
  if (held.length !== 25 || held.some((c) => !c))
    throw Error("holdout_definitions_missing");
  const holdout = held.flatMap((c) => sequence(c, "HOLDOUT-"));
  if (plannedCalls(holdout) !== 30)
    throw Error("holdout_planned_call_mismatch");
  const excluded = new Set(held.map((c) => c.id)),
    heldInputs = new Set(held.map((c) => c.input));
  const pools = Object.fromEntries(
    Object.keys(adjustedAttemptTargets).map((category) => [
      category,
      eligible.filter(
        (c) =>
          c.category === category &&
          !excluded.has(c.id) &&
          !heldInputs.has(c.input),
      ),
    ]),
  ) as Record<LanguageCategory, LanguageCase[]>;
  const counts = Object.fromEntries(
    Object.keys(adjustedAttemptTargets).map((c) => [
      c,
      plannedCalls(core.filter((w) => w.category === c)),
    ]),
  ) as Record<LanguageCategory, number>;
  const targets = { ...adjustedAttemptTargets };
  for (const w of holdout)
    targets[w.category] -= w.goal.action === "care" ? 2 : 1;
  const work = [...core],
    chosen = new Set<string>();
  for (let guard = 0; plannedCalls(work) < 270 && guard < 1050; guard++) {
    const remaining = 270 - plannedCalls(work);
    const ranked = (Object.keys(targets) as LanguageCategory[]).sort(
      (a, b) =>
        (targets[b] - counts[b]) / Math.max(1, targets[b]) -
        (targets[a] - counts[a]) / Math.max(1, targets[a]),
    );
    let next: LanguageCase | undefined;
    for (const category of ranked) {
      next = pools[category].find(
        (c) => !chosen.has(c.id) && plannedCalls(sequence(c)) <= remaining,
      );
      if (next) break;
    }
    if (!next) throw Error("meaningful_stratified_cases_exhausted");
    chosen.add(next.id);
    const added = sequence(next);
    work.push(...added);
    counts[next.category] += plannedCalls(added);
  }
  if (plannedCalls(work) !== 270)
    throw Error("discovery_planned_call_mismatch");
  // Spare unseen questions cover legitimate shorter-than-planned care paths.
  // Actual durable dispatch counts, never this estimate, select the holdout and
  // enforce 300. Retests use the same shared remaining cap.
  const spare = eligible
    .filter(
      (c) =>
        !chosen.has(c.id) &&
        !excluded.has(c.id) &&
        !heldInputs.has(c.input) &&
        !c.context.length &&
        !!c.goal.filter &&
        !c.goal.action,
    )
    .slice(0, 24)
    .flatMap((c) => sequence(c));
  return {
    work: [...work, ...spare],
    holdout,
    targets: adjustedAttemptTargets,
    plannedDiscoveryCalls: 270,
    plannedHoldoutCalls: 30,
  };
}
