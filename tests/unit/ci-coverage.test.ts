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
const commands = (job: string) =>
  Array.from(job.matchAll(/^\s+(?:- )?run: (.+)$/gm), ([, command]) => command);
const steps = (job: string) => job.split(/^      - /m).slice(1);
const browserInstall =
  "pnpm exec playwright install --with-deps chromium firefox webkit";

describe("mandatory CI workload isolation", () => {
  it("expands one unfiltered browser command into both complete data-source suites", () => {
    const strategy = foundation
      .split("    strategy:\n")[1]
      .split("    services:\n")[0]
      .replace(/^\s*#.*\n/gm, "");
    expect(strategy).toBe(
      "      fail-fast: false\n      matrix:\n        data-source: [fixtures, database]\n",
    );
    const modes = strategy.match(/data-source: \[([^\]]+)\]/)![1].split(", ");
    expect(modes).toEqual(["fixtures", "database"]);
    const fullSuites = steps(foundation).filter((step) =>
      /^\s*run: pnpm test:e2e$/m.test(step),
    );
    expect(fullSuites).toHaveLength(1);
    expect(workflow.match(/run: pnpm test:e2e$/gm)).toHaveLength(1);
    expect(fullSuites[0]).toContain(
      "        env:\n          E2E_DATA_SOURCE: ${{ matrix.data-source }}\n",
    );
    expect(fullSuites[0]).not.toMatch(/\bif:|continue-on-error/);
    // Expand the actual matrix/env binding, not a weakened textual command count.
    expect(
      modes.flatMap((mode) =>
        fullSuites.map((step) => ({
          command: commands(step)[0],
          dataSource: step
            .match(/E2E_DATA_SOURCE: (.+)/)![1]
            .replace("${{ matrix.data-source }}", mode),
        })),
      ),
    ).toEqual([
      { command: "pnpm test:e2e", dataSource: "fixtures" },
      { command: "pnpm test:e2e", dataSource: "database" },
    ]);
    expect(foundation).toContain(
      "name: foundation (${{ matrix.data-source }})",
    );
  });

  it("retains all baseline commands and adds the mandatory complete protection journey", () => {
    expect(commands(foundation)).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm workspace:check",
      "node scripts/verify-repository.mjs",
      "pnpm lint",
      "pnpm format:check",
      "pnpm typecheck",
      "pnpm test",
      "pnpm careos:evaluate",
      "pnpm careos:review",
      "pnpm test:integration",
      "pnpm build",
      "pnpm test:failure",
      browserInstall,
      "pnpm test:e2e",
      "pnpm test:guardian:e2e",
    ]);
    expect(commands(native)).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm workspace:check",
      "pnpm test:integration",
      "pnpm build",
      browserInstall,
      "pnpm exec node scripts/workspace.mjs run test:integration tsx --test --test-concurrency=1 --test-name-pattern='purchase → policy discovery' tests/integration/price-protection.test.ts",
      "pnpm exec playwright test --config=playwright.access.config.ts",
      "pnpm test:compat",
      "pnpm exec playwright test --config=playwright.sol.config.ts",
    ]);
    expect(native).toContain('E2E_PORT: "3108"');
    expect(native).toContain('PALCARE_PROTECTION_BROWSER_JOURNEY: "true"');
    expect(native).not.toMatch(/strategy:|matrix:|E2E_DATA_SOURCE:/);
    expect(workflow).not.toMatch(
      /continue-on-error|--grep|--shard|--retries|--timeout|--project|--test-list|--pass-with-no-tests|--last-failed|--only-changed|\bneeds:|max-parallel:|PLAYWRIGHT_|E2E_TEST/,
    );
  });

  it("permits only database-exclusive Guardian and always-upload artifact conditions", () => {
    expect(workflow.match(/^\s+(?:- )?if: .+$/gm)).toEqual([
      "        if: matrix.data-source == 'database'",
      "        if: always()",
      "        if: always()",
    ]);
    expect(foundation.match(/^\s+(?:- )?if: .+$/gm)).toEqual([
      "        if: matrix.data-source == 'database'",
      "        if: always()",
    ]);
    expect(native.match(/^\s+(?:- )?if: .+$/gm)).toEqual([
      "        if: always()",
    ]);
    const guardian = steps(foundation).filter((step) =>
      step.includes("run: pnpm test:guardian:e2e\n"),
    );
    expect(guardian).toHaveLength(1);
    expect(guardian[0]).toContain(
      "        if: matrix.data-source == 'database'\n",
    );
    expect(workflow.match(/run: pnpm test:guardian:e2e$/gm)).toHaveLength(1);
    for (const [job, artifact] of [
      [foundation, "browser-results-${{ matrix.data-source }}"],
      [native, "native-browser-results"],
    ]) {
      const uploads = steps(job).filter((step) =>
        step.includes("uses: actions/upload-artifact@"),
      );
      expect(uploads).toHaveLength(1);
      expect(uploads[0]).toContain("        if: always()\n");
      expect(uploads[0]).toContain(`          name: ${artifact}\n`);
      expect(uploads[0]).toContain(
        "          path: |\n            playwright-report/\n            test-results/\n          retention-days: 7",
      );
    }
    const artifactNames = ["fixtures", "database"].map(
      (mode) => `browser-results-${mode}`,
    );
    artifactNames.push("native-browser-results");
    expect(new Set(artifactNames).size).toBe(3);
  });

  it("keeps every runner at the original bounds with independent disposable PostgreSQL", () => {
    expect(workflow.match(/^\s+timeout-minutes: .+$/gm)).toEqual([
      "    timeout-minutes: 35",
      "    timeout-minutes: 35",
    ]);
    const services = [];
    for (const job of [foundation, native]) {
      expect(job).toContain("    runs-on: ubuntu-24.04\n");
      const service = job.split("    services:\n")[1].split("    steps:\n")[0];
      services.push(service);
      expect(service).toBe(
        '      postgres:\n        image: postgres:17-alpine\n        env:\n          POSTGRES_USER: palcare\n          POSTGRES_DB: palcare_test\n          POSTGRES_PASSWORD: ${{ github.run_id }}-${{ github.run_attempt }}\n        ports:\n          - 5432:5432\n        options: >-\n          --health-cmd "pg_isready -U palcare -d palcare_test"\n          --health-interval 5s\n          --health-timeout 5s\n          --health-retries 10\n',
      );
    }
    expect(services[0]).toBe(services[1]);
    for (const variable of ["DATABASE_URL", "TEST_DATABASE_URL"]) {
      expect(shared).toContain(
        `  ${variable}: postgresql://palcare:\${{ github.run_id }}-\${{ github.run_attempt }}@127.0.0.1:5432/palcare_test\n`,
      );
    }
    expect(shared).toContain("  DEMO_DATA_SOURCE: database\n");
    expect(workflow).not.toMatch(
      /secrets\.|retries:|timeout:|timeout-seconds:/,
    );
  });

  it("keeps provider-off policy shared without per-job overrides", () => {
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
    expect(foundation + native).not.toMatch(
      /PAYPAL_|CAREOS_|GUARDIAN_|PRICE_GUARDIAN_|DISCOVERY_|CHANNEL3_|CPSC_|DATABASE_URL:/,
    );
  });
});
