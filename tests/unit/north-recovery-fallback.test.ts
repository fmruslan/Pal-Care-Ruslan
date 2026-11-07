import { describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  applyNorthRecoveryFallback,
  verifyNorthRecoveryInventory,
} from "../../scripts/north-recovery-fallback";

describe("managed application-only fallback ordering, isolated operations", () => {
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
