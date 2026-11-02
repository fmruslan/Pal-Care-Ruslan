import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guard orchestration only; actual workflow success still needs exact-SHA CI.
const workflow = readFileSync(
  ".github/workflows/repository-checks.yml",
  "utf8",
);
const [shared, foundation, native] = workflow.split(
  /^  (?:foundation|native-acceptance):\n/m,
);

describe("mandatory CI workload isolation", () => {
  it("retains every complete browser suite exactly once with independent artifacts", () => {
    expect(workflow.match(/run: pnpm test:e2e$/gm)).toHaveLength(2);
    expect(foundation).toContain("run: pnpm test:guardian:e2e");
    for (const command of [
      "pnpm test:compat",
      "pnpm exec playwright test --config=playwright.access.config.ts",
      "pnpm exec playwright test --config=playwright.sol.config.ts",
    ]) {
      expect(native).toContain(`run: ${command}\n`);
      expect(foundation).not.toContain(`run: ${command}\n`);
      expect(workflow.split(`run: ${command}\n`)).toHaveLength(2);
    }
    expect(foundation).toContain("name: browser-results");
    expect(native).toContain("name: native-browser-results");
    expect(workflow).not.toMatch(/continue-on-error|--grep|--shard|--retries/);
  });

  it("keeps both jobs bounded, unconditional and on fresh provider-off test databases", () => {
    for (const job of [foundation, native]) {
      expect(job).toContain("timeout-minutes: 35");
      expect(job).toContain("image: postgres:17-alpine");
      expect(job).toContain("POSTGRES_DB: palcare_test");
      expect(job).toContain("run: pnpm install --frozen-lockfile");
      expect(job).toContain("run: pnpm test:integration");
      expect(job).toContain("run: pnpm build");
      expect(job.match(/^\s+if: .+$/gm)).toEqual(["        if: always()"]);
    }
    expect(shared).toContain("TEST_DATABASE_URL: postgresql://palcare:");
    expect(shared).toContain("@127.0.0.1:5432/palcare_test");
    for (const flag of [
      "PAYPAL_CHECKOUT_ENABLED",
      "CAREOS_LIVE_ENABLED",
      "GUARDIAN_REFUNDS_ENABLED",
      "GUARDIAN_PROVIDER_READS_ENABLED",
      "PRICE_GUARDIAN_CHECKOUT_ENABLED",
      "CHANNEL3_LIVE_ENABLED",
      "CHANNEL3_FREE_CREDITS_CONFIRMED",
      "CPSC_REFRESH_ENABLED",
    ]) {
      expect(shared).toContain(`${flag}: "false"`);
    }
    expect(shared).toContain('CAREOS_PROVIDER: "fixture"');
    expect(shared).toContain('DISCOVERY_PROVIDER: "fixture"');
  });
});
