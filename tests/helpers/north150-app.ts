import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { Pool } from "pg";
import { z } from "zod";
import { expect, type BrowserContext } from "@playwright/test";
import { OWNER_ORIGIN } from "../../src/lib/careos/standing-owner";
import {
  recoveryHash,
  RECOVERY_TRANSITION_FROM,
} from "../../src/lib/careos/evaluation-recovery";
import { SUBSCRIPTION_SESSION } from "../../src/lib/careos/subscription/policy";
import { verifyNorthRecoveryInventory } from "../../scripts/north-recovery-fallback";
import { isolatedCareEnvironment } from "./isolated-care-environment";
import { testRuntimeRoles } from "./runtime-roles";
import { north150Clock, north150Hash } from "./north150-fixture";

export const north150Loopback = "http://127.0.0.1:3117";

/** No execution at import. The caller must coordinate a fresh candidate build
 * and an explicit dedicated TEST_DATABASE_URL before running this harness. */
export async function createNorth150App() {
  const source = resolve(".");
  await mkdir("/tmp/opencode", { recursive: true });
  const root = await mkdtemp("/tmp/opencode/north150-app-");
  const directory = join(root, "app"),
    home = join(root, "home");
  const fallbackDirectory = join(root, "release-north-recovery-150-compatible");
  let selectedDirectory = directory;
  const recordsToken = north150Hash(root + ":synthetic-records-cookie");
  const clock = north150Clock(root);
  let roles: Awaited<ReturnType<typeof testRuntimeRoles>> | undefined;
  let pool: Pool | undefined;
  let child: ChildProcess | undefined;
  let stopping = false;
  let generation = 0;
  let output = "";
  async function stop() {
    stopping = true;
    generation++;
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      const timer = setTimeout(() => child?.kill("SIGKILL"), 5000);
      child.kill("SIGTERM");
      try {
        await exited;
      } finally {
        clearTimeout(timer);
      }
    }
    child = undefined;
  }
  try {
    roles = await testRuntimeRoles(process.env.TEST_DATABASE_URL ?? "");
    pool = new Pool({ connectionString: roles.urls.careos, max: 1 });
    await mkdir(home, { recursive: true, mode: 0o700 });
    await mkdir(join(directory, "src/app"), { recursive: true });
    // Independent asset copy: NEVER write .next metadata/cache in the primary
    // checkout. No .env, production HOME, profile or operator file is copied.
    await cp(join(source, ".next"), join(directory, ".next"), {
      recursive: true,
      mode: constants.COPYFILE_FICLONE,
      filter: (path) => path !== join(source, ".next/cache"),
    });
    for (const name of ["package.json", "next.config.ts", "public"])
      await cp(join(source, name), join(directory, name), { recursive: true });
    await symlink(
      join(source, "node_modules"),
      join(directory, "node_modules"),
      "dir",
    );
    const build = JSON.parse(
      await readFile(join(directory, ".next/palcare-build.json"), "utf8"),
    );
    const buildId = (
      await readFile(join(directory, ".next/BUILD_ID"), "utf8")
    ).trim();
    if (
      build.buildId !== buildId ||
      build.commit === RECOVERY_TRANSITION_FROM.commit
    )
      throw Error("fresh north150 candidate production build required");
    const release = {
      commit: build.commit,
      sourceHash: build.sourceHash,
      buildId,
    };
    // SYNTHETIC test receipt accepted by the real runtime field checks. This is
    // NOT GitHub CI/release evidence and is never installed outside this root.
    const ci = {
      schema: 1,
      ...release,
      lane: "full",
      exactChecks: true,
      workflow: ".github/workflows/repository-checks.yml",
      runId: 150,
      checkedAt: new Date(clock.now()).toISOString(),
      syntheticNorth150TestOnly: true,
    };
    await writeFile(
      join(directory, ".next/palcare-ci.json"),
      JSON.stringify(ci),
      { mode: 0o600 },
    );
    await cp(directory, fallbackDirectory, {
      recursive: true,
      mode: constants.COPYFILE_FICLONE,
      verbatimSymlinks: true,
    });
    async function inventory(dir = ""): Promise<Record<string, string>> {
      const entries: Record<string, string> = {};
      for (const name of (await readdir(join(fallbackDirectory, dir))).sort()) {
        const path = dir ? dir + "/" + name : name;
        if ([".next/cache", ".next/server/route-cache"].includes(path))
          continue;
        const absolute = join(fallbackDirectory, path),
          stat = await lstat(absolute);
        if (stat.isSymbolicLink())
          entries[path] = "link:" + (await readlink(absolute));
        else if (stat.isDirectory())
          Object.assign(entries, await inventory(path));
        else if (stat.isFile())
          entries[path] = createHash("sha256")
            .update(await readFile(absolute))
            .digest("hex");
        else throw Error("unsupported north150 fixture asset");
      }
      return entries;
    }
    const rawManifest =
      JSON.stringify({ ...release, files: await inventory() }) + "\n";
    const fallbackManifestHash = north150Hash(rawManifest);
    await writeFile(fallbackDirectory + "-manifest.json", rawManifest, {
      mode: 0o600,
    });
    // Test-only inventory binding, not an executed production launcher or TLS proof.
    await writeFile(
      fallbackDirectory + "-launcher.mjs",
      `// Synthetic inventory binding only.\nconst expectedManifest = "${fallbackManifestHash}";\nexport { expectedManifest };\n`,
      { mode: 0o600 },
    );
    await verifyNorthRecoveryInventory(fallbackDirectory, release);
    const transportLog = join(root, "transport.jsonl");
    await writeFile(transportLog, "", { mode: 0o600 });
    return {
      root,
      directory,
      home,
      clock,
      release,
      ciReceiptHash: recoveryHash(ci),
      pool,
      fallbackManifestHash,
      recordsToken,
      verifyFallback: () =>
        verifyNorthRecoveryInventory(fallbackDirectory, release),
      selectFallback() {
        selectedDirectory = fallbackDirectory;
      },
      async start() {
        if (child) throw Error("isolated north150 child already started");
        stopping = false;
        if (selectedDirectory === fallbackDirectory)
          await verifyNorthRecoveryInventory(fallbackDirectory, release);
        output = "";
        child = spawn(
          process.execPath,
          [
            "--import",
            join(source, "tests/helpers/north150-preload.mjs"),
            join(source, "node_modules/next/dist/bin/next"),
            "start",
            "--hostname",
            "127.0.0.1",
            "--port",
            "3117",
          ],
          {
            cwd: selectedDirectory,
            stdio: ["ignore", "pipe", "pipe"],
            env: {
              ...isolatedCareEnvironment,
              PATH: process.env.PATH,
              HOME: home,
              NODE_ENV: "production",
              NEXT_TELEMETRY_DISABLED: "1",
              APP_ORIGIN: OWNER_ORIGIN,
              DEMO_DATA_SOURCE: "database",
              DATABASE_URL: roles!.urls.reader,
              CAREOS_DATABASE_URL: roles!.urls.careos,
              CAREOS_PROVIDER: "subscription",
              CAREOS_OWNER_MODE: "true",
              CAREOS_STANDING_AI_ENABLED: "true",
              CAREOS_EVALUATION_ENABLED: "false",
              CAREOS_OWNER_PAIRING_ENABLED: "false",
              PALCARE_NORTH_MAIN_ENABLED: "true",
              CAREOS_SUBSCRIPTION_ENABLED: "true",
              CAREOS_SUBSCRIPTION_CREDITS_DISABLED: "true",
              CAREOS_SUBSCRIPTION_SESSION_ID: SUBSCRIPTION_SESSION,
              PAYPAL_CHECKOUT_ENABLED: "false",
              GUARDIAN_OPERATIONS_ENABLED: "false",
              GUARDIAN_REFUNDS_ENABLED: "false",
              PALCARE_PERSISTENT_PREVIEW: "true",
              PALCARE_PRIVATE_HTTPS_PREVIEW: "true",
              AG_STUDIO_PRIVATE_DEVELOPMENT_ENABLED: "true",
              NORTH150_CLOCK_EPOCH: String(clock.epoch),
              NORTH150_CLOCK_WALL_STARTED: String(clock.wallStarted),
              NORTH150_CLOCK_OFFSET: clock.offsetFile,
              NORTH150_TRANSPORT_LOG: transportLog,
            },
          },
        );
        const collect = (chunk: Buffer) => {
          output = (output + chunk.toString()).slice(-16000);
        };
        child.stdout?.on("data", collect);
        child.stderr?.on("data", collect);
        child.on("error", (error) => {
          output += String(error);
        });
        await expect
          .poll(
            async () => {
              if (child?.exitCode !== null)
                throw Error(`north150 child exited: ${output}`);
              // Never mistake another process already on 3117 for our own child.
              // Only probe after THIS child's captured Next startup is ready.
              if (!output.includes("Ready in")) return 0;
              try {
                return (await fetch(north150Loopback + "/api/health")).status;
              } catch {
                return 0;
              }
            },
            { timeout: 20000 },
          )
          .toBe(200);
      },
      stop,
      async transport() {
        return (await readFile(transportLog, "utf8"))
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line));
      },
      async route(context: BrowserContext, recordsOwner: string) {
        await context.route("**/*", async (route) => {
          const request = route.request(),
            url = new URL(request.url());
          const dispatchedGeneration = generation;
          if (url.origin !== OWNER_ORIGIN)
            return route.abort("blockedbyclient");
          const headers = await request.allHeaders();
          // WebKit's intercepted allHeaders omits Cookie although the native jar
          // retains it; route.fetch's loopback URL cannot attach Secure cookies.
          // Forward ONLY known synthetic cookies scoped to the original URL.
          // This harness therefore does NOT certify native TLS/cookie transport.
          if (!headers.cookie) {
            const cookies = (await context.cookies(url.href)).filter((cookie) =>
              ["__Host-palcare-owner", "palcare-records"].includes(cookie.name),
            );
            for (const cookie of cookies) {
              if (
                cookie.name === "__Host-palcare-owner" &&
                !["e".repeat(64), "d".repeat(64)].includes(cookie.value)
              ) {
                const state = JSON.parse(
                  await readFile(
                    join(
                      home,
                      ".config/palcare-standing-owner/owner-state.json",
                    ),
                    "utf8",
                  ),
                );
                if (
                  !state.sessions.some(
                    (entry: { tokenHash: string }) =>
                      entry.tokenHash === north150Hash(cookie.value),
                  )
                )
                  throw Error("unexpected non-synthetic owner cookie");
              }
              if (
                cookie.name === "palcare-records" &&
                cookie.value !== recordsToken
              )
                throw Error("unexpected non-synthetic records cookie");
            }
            if (cookies.length)
              headers.cookie = cookies
                .map((cookie) => `${cookie.name}=${cookie.value}`)
                .join("; ");
          }
          let response: Awaited<ReturnType<typeof route.fetch>>;
          try {
            response = await route.fetch({
              url: north150Loopback + url.pathname + url.search,
              headers: {
                ...headers,
                host: new URL(OWNER_ORIGIN).host,
              },
            });
          } catch (error) {
            if (!stopping) throw error;
            return route.abort("aborted");
          }
          if (
            request.method() === "POST" &&
            url.pathname === "/api/careos/records/conversations" &&
            response.ok()
          ) {
            const created = z
              .object({ id: z.uuid() })
              .parse(await response.json());
            // DB now() is real, while the owner/browser clock is virtual. Bridge
            // ONLY this fixture's new conversation retention, not any AI grant.
            const updated = await pool!.query(
              "update care_conversations set expires_at=greatest(expires_at,now()+interval '1 day') where id=$1 and owner=$2",
              [created.id, recordsOwner],
            );
            expect(updated.rowCount).toBe(1);
          }
          try {
            await route.fulfill({ response });
          } catch (error) {
            // A deliberate stop/restart or navigation can abort a request that
            // was already in flight. Never suppress failures on active routes.
            if (dispatchedGeneration !== generation || request.failure())
              return;
            // Chromium may mark a cancelled script route handled before its
            // requestfailed event. Limit this race to read-only static chunks;
            // API, document and provider failures must still fail the test.
            if (
              request.method() === "GET" &&
              url.pathname.startsWith("/_next/static/") &&
              error instanceof Error &&
              error.message.includes("Route is already handled")
            )
              return;
            throw Error(
              `isolated route ${request.method()} ${url.pathname}: ${error instanceof Error ? error.message : "failed"}`,
            );
          }
        });
      },
      async dispose(recordsOwner = north150Hash(`records-v1:${recordsToken}`)) {
        await stop();
        if (recordsOwner)
          await pool!.query("delete from care_conversations where owner=$1", [
            recordsOwner,
          ]);
        await pool!.end();
        await roles!.close();
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await stop();
    await pool?.end();
    await roles?.close();
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
