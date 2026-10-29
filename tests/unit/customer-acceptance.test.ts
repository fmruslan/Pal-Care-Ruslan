import { describe, expect, it } from "vitest";
import {
  customerAcceptanceRun,
  customerAlertText,
} from "../../scripts/customer-insights-run";

describe("explicit append-only customer acceptance phases", () => {
  it("ignores only blank live announcements, never meaningful errors or warnings", () => {
    for (const text of ["", " ", "\n\t"])
      expect(customerAlertText.test(text)).toBe(false);
    for (const text of [
      "Some evidence could not be loaded",
      "These widget records could not be validated",
      "unavailable",
      "\nNo confirmed answer yet.\t",
    ])
      expect(customerAlertText.test(text)).toBe(true);
  });
  it("preserves original evidence paths and uses disjoint diagnostic/live paths", () => {
    const original = customerAcceptanceRun(["--run"]);
    const diagnostic = customerAcceptanceRun(["--diagnose"]);
    const continued = customerAcceptanceRun(["--run", "--phase=continued-v2"]);
    expect(original.evidence).toBe("customer-insights-acceptance.json");
    expect(
      new Set([original.evidence, diagnostic.evidence, continued.evidence])
        .size,
    ).toBe(3);
    expect(
      new Set([original.artifacts, diagnostic.artifacts, continued.artifacts])
        .size,
    ).toBe(3);
    expect(diagnostic.staticOnly).toBe(true);
    const nextDiagnostic = customerAcceptanceRun([
      "--diagnose",
      "--phase=static-v3",
    ]);
    expect(nextDiagnostic.staticOnly).toBe(true);
    expect(nextDiagnostic.evidence).not.toBe(diagnostic.evidence);
    expect(original.staticOnly || continued.staticOnly).toBe(false);
  });
  it("rejects arbitrary paths, phases, repeated flags and implicit activation", () => {
    for (const args of [
      [],
      ["--continue"],
      ["--phase=continued-v2"],
      ["--run", "--phase=../session"],
      ["--diagnose", "--run"],
      ["--run", "--reset"],
      ["--run", "--phase=continued-v2", "--run"],
    ]) {
      expect(() => customerAcceptanceRun(args)).toThrow(
        "customer_insights_invalid_arguments",
      );
    }
  });
});
