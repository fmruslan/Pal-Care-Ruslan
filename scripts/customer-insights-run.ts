// Next.js keeps an empty route-announcement live region in its shadow root.
// Its existence is not an error; nonempty alerts must still fail acceptance.
export const customerAlertText = /\S/;

/** Explicit phases never overwrite the original acceptance or reset authority. */
export function customerAcceptanceRun(args: string[]) {
  let phase: "original" | "static-v2" | "static-v3" | "continued-v2";
  if (args.length === 1 && args[0] === "--run") phase = "original";
  else if (args.length === 1 && args[0] === "--diagnose") phase = "static-v2";
  else if (
    args.length === 2 &&
    args[0] === "--diagnose" &&
    args[1] === "--phase=static-v3"
  )
    phase = "static-v3";
  else if (
    args.length === 2 &&
    args[0] === "--run" &&
    args[1] === "--phase=continued-v2"
  )
    phase = "continued-v2";
  else throw new Error("customer_insights_invalid_arguments");
  const suffix = phase === "original" ? "" : `-${phase}`;
  return {
    phase,
    staticOnly: phase === "static-v2" || phase === "static-v3",
    evidence: `customer-insights-acceptance${suffix}.json`,
    artifacts: `customer-insights-acceptance${suffix}-artifacts`,
  };
}
