/** The managed North recovery fallback entrypoint. Application assets ONLY.
 * Never restores records, credentials, policy, journals, accounting or grants.
 * Disabling must succeed durably BEFORE changing the service configuration.
 * Owner/root can bypass scripts; this is an enforced operator path, not a host
 * security boundary against the owner. No automatic reactivation afterward. */
import { constants } from "node:fs";
import {
  open,
  readFile,
  writeFile,
  lstat,
  readdir,
  readlink,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { StandingOwner } from "../src/lib/careos/standing-owner";
import {
  recoveryReleaseSchema,
  recoveryRuntimeEvidence,
  recoveryHash,
  recoveryTransitionGateSchema,
} from "../src/lib/careos/evaluation-recovery";
import { assertCiReceipt } from "./ci-receipt.mjs";

export type RecoveryFallbackOperations = {
  verifyApplication: () => Promise<void>;
  disableRecovery: () => Promise<void>;
  switchApplication: () => Promise<void>;
};

/** The same ordering is used by the real CLI and isolated negative controls.
 * Errors propagate; do not catch a disable failure and attempt another switch. */
export async function applyNorthRecoveryFallback(
  ops: RecoveryFallbackOperations,
) {
  await ops.verifyApplication();
  await ops.disableRecovery();
  await ops.switchApplication();
}

const evidencePath =
  "/tmp/opencode/north-language-300/recovery-150/fallback.json";
const releases = "/home/bigrus/.local/state/palcare-releases";
export const north150FallbackRoot = `${releases}/release-north-recovery-150-compatible`;
const dropin =
  "/home/bigrus/.config/systemd/user/palcare-preview.service.d/north-language-300.conf";
const fallbackSchema = z.strictObject({
  fallback: recoveryTransitionGateSchema.shape.fallback,
  executionLimit: z.literal(150),
  questionMarkersSupported: z.literal(true),
  ciReceipt: z.unknown(),
  authorization: z.enum(["legacy-recovery", "quota-bounded"]).optional(),
});
/** Pure same-source selection gate. Older 63a cannot parse the new ledger
 * markers and must never become a fallback after this continuation. */
export function validateNorth150Fallback(
  value: unknown,
  runtime: {
    release: z.infer<typeof recoveryReleaseSchema>;
    ciReceiptHash: string;
  },
) {
  const proof = fallbackSchema.parse(value);
  const ci = assertCiReceipt(proof.fallback.release, proof.ciReceipt);
  if (
    ci.lane !== "full" ||
    recoveryHash(proof.fallback.release) !== recoveryHash(runtime.release) ||
    recoveryHash(ci) !== runtime.ciReceiptHash ||
    proof.fallback.ciReceiptHash !== runtime.ciReceiptHash ||
    proof.fallback.ciRunId !== ci.runId
  )
    throw Error("same_source_cap_aware_fallback_required");
  return proof;
}

/** Local immutable-inventory continuity, not a signature against owner/root.
 * Match the freezer/launcher exclusions without following symlink directories. */
export async function verifyNorthRecoveryInventory(
  root: string,
  release: z.infer<typeof recoveryReleaseSchema>,
) {
  const sha = (bytes: string | Buffer) =>
    createHash("sha256").update(bytes).digest("hex");
  const raw = await readFile(`${root}-manifest.json`);
  const manifest = JSON.parse(raw.toString());
  const launcher = await readFile(`${root}-launcher.mjs`, "utf8");
  if (
    manifest.commit !== release.commit ||
    manifest.sourceHash !== release.sourceHash ||
    !launcher.includes(`const expectedManifest = "${sha(raw)}";`)
  )
    throw Error("frozen_manifest_launcher_mismatch");
  async function inventory(dir = ""): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    for (const name of (await readdir(root + (dir ? "/" + dir : ""))).sort()) {
      const path = dir ? dir + "/" + name : name;
      if ([".next/cache", ".next/server/route-cache"].includes(path)) continue;
      const stat = await lstat(root + "/" + path);
      if (stat.isSymbolicLink())
        files[path] = "link:" + (await readlink(root + "/" + path));
      else if (stat.isDirectory()) Object.assign(files, await inventory(path));
      else if (stat.isFile())
        files[path] = sha(await readFile(root + "/" + path));
      else throw Error("unsupported_frozen_asset");
    }
    return files;
  }
  if (!isDeepStrictEqual(await inventory(), manifest.files))
    throw Error("frozen_assets_changed_no_service_switch");
}

/** Production uses the fixed receipt and fixed loopback service, never
 * command-line file paths. Only the ordering helper uses injected operations. */
export async function managedNorthRecoveryFallback() {
  let override: string | undefined;
  await applyNorthRecoveryFallback({
    verifyApplication: async () => {
      const handle = await open(
        evidencePath,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      let raw: string;
      try {
        const st = await handle.stat();
        if (
          !st.isFile() ||
          st.uid !== process.getuid?.() ||
          st.mode & 0o077 ||
          st.nlink !== 1 ||
          st.size > 131072
        )
          throw Error("private_verified_fallback_receipt_required");
        raw = await handle.readFile("utf8");
      } finally {
        await handle.close();
      }
      const proof = validateNorth150Fallback(
        JSON.parse(raw),
        await recoveryRuntimeEvidence(),
      );
      const release = proof.fallback.release;
      const root =
        proof.authorization === "quota-bounded"
          ? `${releases}/release-${release.commit.slice(0, 7)}-north-quota-compatible`
          : north150FallbackRoot;
      const build = JSON.parse(
        await readFile(`${root}/.next/palcare-build.json`, "utf8"),
      );
      if (
        build.commit !== release.commit ||
        build.sourceHash !== release.sourceHash ||
        build.buildId !== release.buildId ||
        (await readFile(`${root}/.next/BUILD_ID`, "utf8")).trim() !==
          release.buildId ||
        build.dirty
      )
        throw Error("immutable_fallback_release_mismatch");
      // Validate inventory BEFORE disabling/switching too. The launcher repeats
      // inventory and actual current-role guards before loopback startup.
      const sha = (bytes: Buffer) =>
        createHash("sha256").update(bytes).digest("hex");
      if (
        proof.fallback.evidenceHash !==
          sha(await readFile(`${root}-manifest.json`)) ||
        proof.fallback.managedEntrypointHash !==
          sha(await readFile("scripts/north-recovery-fallback.ts"))
      )
        throw Error("exact_fallback_inventory_and_entrypoint_required");
      await verifyNorthRecoveryInventory(root, release);
      override = `[Service]\nExecStart=\nExecStart=/usr/bin/node --import ${root}/node_modules/tsx/dist/loader.mjs ${root}-launcher.mjs\n`;
      try {
        const existing = await readFile(dropin, "utf8");
        const old = `${releases}/release-63a877f-north300-compatible`;
        const oldOverride = `[Service]\nExecStart=\nExecStart=/usr/bin/node --import ${old}/node_modules/tsx/dist/loader.mjs ${old}-launcher.mjs\n`;
        if (existing !== override && existing !== oldOverride)
          throw Error("unknown_service_override_do_not_overwrite");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
    disableRecovery: async () => {
      await new StandingOwner().disableEvaluationRecovery(
        "managed-critical-fallback",
      );
    },
    switchApplication: async () => {
      if (!override) throw Error("verified_fallback_required");
      // The fixed override is application-only; user/state/environment files
      // are never copied from a release or restored from an earlier capture.
      await writeFile(dropin, override, { mode: 0o600 });
      execFileSync("systemctl", ["--user", "daemon-reload"]);
      execFileSync("systemctl", [
        "--user",
        "restart",
        "palcare-preview.service",
      ]);
    },
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (
      process.env.CI ||
      process.argv.length !== 3 ||
      process.argv[2] !== "--apply"
    )
      throw Error("explicit_host_fallback_required");
    await managedNorthRecoveryFallback();
    console.log(
      "Recovery disabled durably before application-only fallback. No data or accounting restored; no automatic recovery reactivation.",
    );
  } catch {
    console.error(
      "Fallback stopped. Do not bypass failed verification/disable or start another fallback; inspect protected evidence. No automatic retry.",
    );
    process.exitCode = 1;
  }
}
