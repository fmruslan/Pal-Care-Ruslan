import { describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  applyNorthRecoveryFallback,
  verifyNorthRecoveryInventory,
  validateNorth150Fallback,
} from "../../scripts/north-recovery-fallback";
import { recoveryHash } from "../../src/lib/careos/evaluation-recovery";

describe("managed application-only fallback ordering, isolated operations", () => {
  it.each([150, 163, 263, 563])(
    "requires exact source and marker-aware immutable fallback for the %i ceiling",
    (executionLimit) => {
      const release = {
        commit: "a".repeat(40),
        sourceHash: "b".repeat(64),
        buildId: "synthetic-cap-aware",
      };
      const ciReceipt = {
        schema: 1,
        ...release,
        lane: "full",
        exactChecks: true,
        runId: 123,
        workflow: ".github/workflows/repository-checks.yml",
        checkedAt: "2026-11-07T08:00:00Z",
      };
      const runtime = { release, ciReceiptHash: recoveryHash(ciReceipt) };
      const proof = {
        executionLimit,
        questionMarkersSupported: true,
        ciReceipt,
        fallback: {
          release,
          ciReceiptHash: runtime.ciReceiptHash,
          ciRunId: 123,
          recoveryAware: true,
          startupHttpsPassed: true,
          oldCredentialDenied: true,
          injectedRecoveryLogoutPassed: true,
          disableBeforeSwitch: true,
          evidenceHash: "c".repeat(64),
          managedEntrypointHash: "d".repeat(64),
        },
      };
      expect(validateNorth150Fallback(proof, runtime).executionLimit).toBe(
        executionLimit,
      );
      for (const bad of [
        { ...proof, executionLimit: 300 },
        { ...proof, questionMarkersSupported: false },
        {
          ...proof,
          fallback: { ...proof.fallback, disableBeforeSwitch: false },
        },
        {
          ...proof,
          fallback: { ...proof.fallback, ciReceiptHash: "e".repeat(64) },
        },
        { ...proof, fallback: { ...proof.fallback, ciRunId: 124 } },
        {
          ...proof,
          fallback: {
            ...proof.fallback,
            release: { ...release, commit: "f".repeat(40) },
          },
        },
      ])
        expect(() => validateNorth150Fallback(bad, runtime)).toThrow();
      expect(() =>
        validateNorth150Fallback(proof, {
          ...runtime,
          release: { ...release, sourceHash: "e".repeat(64) },
        }),
      ).toThrow();
      expect(() =>
        validateNorth150Fallback(proof, {
          ...runtime,
          ciReceiptHash: "e".repeat(64),
        }),
      ).toThrow();
    },
  );
  it("durably disables recovery before any service switch, without reactivation", async () => {
    const calls: string[] = [];
    await applyNorthRecoveryFallback({
      verifyApplication: async () => {
        calls.push("verify");
      },
      disableRecovery: async () => {
        calls.push("disable-durable");
      },
      switchApplication: async () => {
        calls.push("application-switch");
      },
    });
    expect(calls).toEqual(["verify", "disable-durable", "application-switch"]);
  });
  it("does not touch recovery or switch applications when fallback verification fails", async () => {
    const disableRecovery = vi.fn(),
      switchApplication = vi.fn();
    await expect(
      applyNorthRecoveryFallback({
        verifyApplication: async () => {
          throw Error("unverified-assets");
        },
        disableRecovery,
        switchApplication,
      }),
    ).rejects.toThrow("unverified-assets");
    expect(disableRecovery).not.toHaveBeenCalled();
    expect(switchApplication).not.toHaveBeenCalled();
  });
  it("propagates failed disable and NEVER writes override/restarts/falls back", async () => {
    const switchApplication = vi.fn();
    await expect(
      applyNorthRecoveryFallback({
        verifyApplication: async () => {},
        disableRecovery: async () => {
          throw Error("durable-disable-failed");
        },
        switchApplication,
      }),
    ).rejects.toThrow("durable-disable-failed");
    expect(switchApplication).not.toHaveBeenCalled();
  });
  it("does not re-enable a disabled grant if the application switch itself fails", async () => {
    const disableRecovery = vi.fn(async () => {});
    await expect(
      applyNorthRecoveryFallback({
        verifyApplication: async () => {},
        disableRecovery,
        switchApplication: async () => {
          throw Error("service-start-failed");
        },
      }),
    ).rejects.toThrow("service-start-failed");
    expect(disableRecovery).toHaveBeenCalledTimes(1);
  });
  it("checks actual inventory before switching, not merely launcher existence or build strings", async () => {
    await mkdir("/tmp/opencode", { recursive: true });
    const temp = await mkdtemp("/tmp/opencode/north-fallback-inventory-test-");
    const root = temp + "/release",
      release = {
        commit: "a".repeat(40),
        sourceHash: "b".repeat(64),
        buildId: "isolated",
      };
    const sha = (value: string) =>
      createHash("sha256").update(value).digest("hex");
    try {
      await mkdir(root);
      await writeFile(root + "/asset.txt", "accepted-assets");
      const manifest = JSON.stringify({
        commit: release.commit,
        sourceHash: release.sourceHash,
        files: { "asset.txt": sha("accepted-assets") },
      });
      await writeFile(root + "-manifest.json", manifest);
      await writeFile(
        root + "-launcher.mjs",
        `const expectedManifest = "${sha(manifest)}";`,
      );
      await expect(
        verifyNorthRecoveryInventory(root, release),
      ).resolves.toBeUndefined();
      await writeFile(root + "/asset.txt", "changed-assets");
      const disableRecovery = vi.fn(),
        switchApplication = vi.fn();
      await expect(
        applyNorthRecoveryFallback({
          verifyApplication: () => verifyNorthRecoveryInventory(root, release),
          disableRecovery,
          switchApplication,
        }),
      ).rejects.toThrow("frozen_assets_changed");
      expect(disableRecovery).not.toHaveBeenCalled();
      expect(switchApplication).not.toHaveBeenCalled();
      await writeFile(root + "/asset.txt", "accepted-assets");
      await writeFile(root + "-launcher.mjs", "an unrelated launcher");
      await expect(verifyNorthRecoveryInventory(root, release)).rejects.toThrow(
        "manifest_launcher_mismatch",
      );
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});
