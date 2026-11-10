import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { requiredChecks } from "../../scripts/verify-ci-release.mjs";
const workflow = readFileSync(
  ".github/workflows/repository-checks.yml",
  "utf8",
);
const job = (name: string) =>
  workflow
    .split(new RegExp(`^  ${name}:\\n`, "m"))[1]
    .split(/^  [a-z-]+:\n/m)[0];
const step = (body: string, command: string) =>
  body.split(/^      - /m).find((s) => s.includes(`run: ${command}\n`))!;
describe("complete risk-selected CI coverage with identical-tree reuse", () => {
  it("retains fatal mirror/install checks, original job bounds and provider isolation", () => {
    for (const [name, budget, engines] of [
      ["fast-ui", 15, "chromium"],
      ["feature-acceptance", 25, "chromium"],
      ["foundation", 35, "chromium"],
      ["native-acceptance", 35, "chromium firefox webkit"],
      ["exact-release", 15, "chromium"],
    ] as const) {
      const body = job(name);
      expect(body.match(/^ {4}timeout-minutes: .+$/gm)).toEqual([
        `    timeout-minutes: ${budget}`,
      ]);
      expect(body.match(/^ {8}timeout-minutes: .+$/gm)).toEqual([
        "        timeout-minutes: 1",
        "        timeout-minutes: 10",
      ]);
      for (const command of [
        "node --test scripts/ci-ubuntu-mirrors.test.mjs",
        'sudo --preserve-env=CI,GITHUB_ACTIONS,RUNNER_ENVIRONMENT "$(command -v node)" scripts/ci-ubuntu-mirrors.mjs',
        `pnpm exec playwright install --with-deps ${engines}`,
      ]) {
        expect(step(body, command)).toBeDefined();
        expect(step(body, command)).not.toMatch(/\bif:|continue-on-error|\|\|/);
      }
    }
    expect(job("foundation") + job("native-acceptance")).not.toMatch(
      /PAYPAL_|CAREOS_|GUARDIAN_|PRICE_GUARDIAN_|DISCOVERY_|CHANNEL3_|CPSC_|DATABASE_URL:|--retries|--timeout|--test-list|PLAYWRIGHT_|E2E_TEST/,
    );
    for (const variable of ["DATABASE_URL", "TEST_DATABASE_URL"])
      expect(workflow.split("jobs:")[0]).toContain(
        `${variable}: postgresql://palcare:\${{ github.run_id }}-\${{ github.run_attempt }}@127.0.0.1:5432/palcare_test`,
      );
    const n = job("native-acceptance");
    for (const command of [
      "pnpm exec node scripts/workspace.mjs run test:integration tsx --test --test-concurrency=1 --test-name-pattern='purchase → policy discovery' tests/integration/price-protection.test.ts",
      "pnpm exec node scripts/workspace.mjs run test:integration tsx --test tests/integration/care-ten-products.test.ts",
    ])
      expect(step(n, command)).toContain("matrix.suite == 'journeys'");
    expect(job("fast-ui")).toContain("pnpm check");
    expect(job("feature-acceptance")).toContain("pnpm test:integration");
    expect(job("feature-acceptance")).toContain(
      "--config=playwright.sol.config.ts",
    );
  });
  it("partitions both complete Chromium matrices into two non-overlapping Playwright shards", () => {
    const f = job("foundation");
    expect(f).toContain("data-source: [fixtures, database]");
    expect(f).toContain("shard: [1, 2]");
    expect(f).toContain("fail-fast: false");
    expect(f).toContain("pnpm test:e2e --shard=${{ matrix.shard }}/2");
    expect(f).toContain("E2E_DATA_SOURCE: ${{ matrix.data-source }}");
    expect(f).toContain(
      "name: foundation (${{ matrix.data-source }}, ${{ matrix.shard }}/2)",
    );
    expect(f).not.toMatch(
      /--grep|--project|--last-failed|--only-changed|--pass-with-no-tests/,
    );
    expect(step(f, "pnpm test:guardian:e2e")).toContain(
      "matrix.data-source == 'database' && matrix.shard == 1",
    );
    expect(requiredChecks({ lane: "full", coverage: "sharded-v1" })).toEqual([
      ...["fixtures", "database"].flatMap((mode) =>
        [1, 2].map((n) => `foundation (${mode}, ${n}/2)`),
      ),
      "native-acceptance (journeys)",
      "native-acceptance (compatibility)",
    ]);
  });
  it("runs deterministic checks once, retaining full integration and failure coverage on isolated databases", () => {
    const f = job("foundation");
    for (const command of [
      "node scripts/verify-repository.mjs",
      "pnpm lint",
      "pnpm format:check",
      "pnpm typecheck",
      "pnpm test",
      "pnpm careos:evaluate",
      "pnpm careos:review",
    ])
      expect(step(f, command)).toContain(
        "matrix.data-source == 'fixtures' && matrix.shard == 1",
      );
    expect(step(f, "pnpm test:integration")).toContain(
      "matrix.data-source == 'database'",
    );
    expect(step(f, "pnpm test:failure")).toContain(
      "matrix.data-source == 'database' && matrix.shard == 1",
    );
    expect(step(f, "pnpm build")).not.toContain("if:");
  });
  it("runs the same native journeys and all Firefox/WebKit scenarios on independent runners", () => {
    const n = job("native-acceptance");
    expect(n).toContain("suite: [journeys, compatibility]");
    expect(n).toContain("fail-fast: false");
    for (const command of [
      "pnpm test:integration",
      "pnpm exec playwright test --config=playwright.demo-care.config.ts",
      "pnpm exec playwright test --config=playwright.access.config.ts",
      "pnpm exec playwright test --config=playwright.sol.config.ts",
    ])
      expect(step(n, command)).toContain("matrix.suite == 'journeys'");
    expect(n).toContain('PALCARE_PROTECTION_BROWSER_JOURNEY: "true"');
    expect(n).toContain('PALCARE_DEMO_BROWSER_JOURNEY: "true"');
    expect(step(n, "pnpm test:compat")).toContain(
      "matrix.suite == 'compatibility'",
    );
    expect(n).not.toMatch(
      /--grep|--shard|--project|--retries|--timeout|--pass-with-no-tests/,
    );
  });
  it("keeps the required gate, conservative classifier, exact-main proof and provider-off smoke", () => {
    expect(job("classify")).toContain(
      'git show "$CI_BASE:scripts/ci-risk.mjs"',
    );
    expect(job("classify")).toContain(
      "node scripts/verify-ci-release.mjs --select-reuse",
    );
    for (const name of [
      "fast-ui",
      "feature-acceptance",
      "foundation",
      "native-acceptance",
    ])
      expect(job(name)).toContain("needs.classify.outputs.reuse != 'true'");
    expect(job("exact-release")).toContain(
      "needs.classify.outputs.reuse == 'true'",
    );
    expect(job("exact-release")).toContain(
      "node scripts/verify-ci-release.mjs --check-reuse",
    );
    expect(job("exact-release")).toContain("pnpm build");
    expect(job("exact-release")).toContain(
      "tests/e2e/release-smoke.spec.ts --project=desktop-light --project=mobile-dark",
    );
    expect(job("release-gate")).toContain("if: always()");
    expect(job("release-gate")).toContain(
      "foundation, native-acceptance, exact-release]",
    );
    expect(workflow).not.toMatch(
      /continue-on-error|paths-ignore:|pull_request_target|inputs:|secrets\./,
    );
    for (const flag of [
      "PAYPAL_CHECKOUT_ENABLED",
      "CAREOS_LIVE_ENABLED",
      "GUARDIAN_REFUNDS_ENABLED",
      "GUARDIAN_PROVIDER_READS_ENABLED",
      "PRICE_GUARDIAN_CHECKOUT_ENABLED",
      "CHANNEL3_LIVE_ENABLED",
      "CHANNEL3_FREE_CREDITS_CONFIRMED",
      "CPSC_REFRESH_ENABLED",
    ])
      expect(workflow.split("jobs:")[0]).toContain(`${flag}: "false"`);
  });
  it("retains fixture/database isolation, pinned browser cache and installation checks", () => {
    for (const name of ["foundation", "native-acceptance"]) {
      const body = job(name);
      expect(body).toContain("postgres:17-alpine");
      expect(body).toContain("POSTGRES_DB: palcare_test");
      expect(body).toContain("timeout-minutes: 35");
    }
    for (const name of ["foundation", "native-acceptance", "exact-release"]) {
      const body = job(name);
      expect(body).toContain("~/.cache/ms-playwright");
      expect(body).toContain("hashFiles('pnpm-lock.yaml')");
      expect(body).toContain("playwright install --with-deps");
      expect(body).toContain("if: always()");
    }
    expect(job("foundation")).toContain(
      "browser-results-${{ matrix.data-source }}-${{ matrix.shard }}",
    );
    expect(job("native-acceptance")).toContain(
      "native-browser-results-${{ matrix.suite }}",
    );
  });
  it("uses the focused local responsive and visual command in the fast lane too", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts["verify:ui"]).toBe(
      "pnpm typecheck && pnpm build && pnpm test:ui",
    );
    expect(pkg.scripts["test:ui"]).toContain("reflow at 320px");
    expect(pkg.scripts["test:ui"]).toContain("official care evidence");
    expect(pkg.scripts["test:ui"]).toContain("visual regression:");
    expect(job("fast-ui")).toContain("pnpm test:ui");
  });
});
