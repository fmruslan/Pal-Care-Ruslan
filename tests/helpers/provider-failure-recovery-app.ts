import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { constants } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, type BrowserContext, type Page } from "@playwright/test";
import { Pool } from "pg";
import {
  OWNER_COOKIE,
  OWNER_ORIGIN,
} from "../../src/lib/careos/standing-owner";
import { recoveryHash } from "../../src/lib/careos/evaluation-recovery";
import { SUBSCRIPTION_SESSION } from "../../src/lib/careos/subscription/policy";
import { turnSchema, type CareTurn } from "../../src/lib/careos/contracts";
import { conversationPlanSchema } from "../../src/lib/careos/records/conversation-service";
import { PostgresStore } from "../../src/lib/careos/postgres-store";
import { verifyNorthRecoveryInventory } from "../../scripts/north-recovery-fallback";
import { assertBuild } from "../../scripts/workspace.mjs";
import { isolatedCareEnvironment } from "./isolated-care-environment";
import { north150Clock, north150Hash } from "./north150-fixture";
import { testRuntimeRoles } from "./runtime-roles";
import { malformedGuideSteps } from "../fixtures/product-guide-prose";

export type RecoveryTransportMode =
  | "success"
  | "known-usage-503"
  | "known-user-503"
  | "unknown-503"
  | "partial-stream"
  | "denied-403";

export const providerFailureRecoveryLoopback = "http://127.0.0.1:3117";

/** Import-time inert. Requires a coordinated, current production build and an
 * explicit dedicated local TEST_DATABASE_URL. No real HOME/profile is copied.
 * Reuses the north150 synthetic success transport, not its grant/fixture. */
export async function createProviderFailureRecoveryApp() {
  assertBuild();
  const source = resolve(".");
  await mkdir("/tmp/opencode", { recursive: true });
  // The existing clock's guard deliberately accepts only this test-root prefix.
  const root = await mkdtemp("/tmp/opencode/north150-provider-failure-");
  const directory = join(root, "app");
  const fallbackDirectory = join(root, "release-provider-failure-compatible");
  const home = join(root, "home");
  const recordsToken = north150Hash(root + ":synthetic-records-cookie");
  const clock = north150Clock(root);
  clock.advance(Math.max(0, 1794390000000 - clock.now()));
  const transportLog = join(root, "transport.jsonl");
  const modeFile = join(root, "transport-mode");
  const preload = join(root, "provider-failure-preload.mjs");
  let roles: Awaited<ReturnType<typeof testRuntimeRoles>> | undefined;
  let pool: Pool | undefined;
  let child: ChildProcess | undefined;
  let selectedDirectory = directory;
  let stopping = false;
  let generation = 0;
  let output = "";
  const sha = (bytes: string | Buffer) =>
    createHash("sha256").update(bytes).digest("hex");

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
    // Existing helper validates local host + *_test BEFORE opening a DB pool,
    // provisions temporary least-privilege logins, and owns their final cleanup.
    roles = await testRuntimeRoles(process.env.TEST_DATABASE_URL ?? "");
    pool = new Pool({ connectionString: roles.urls.careos, max: 1 });
    await mkdir(home, { recursive: true, mode: 0o700 });
    await mkdir(join(directory, "src/app"), { recursive: true });
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
      !buildId ||
      build.buildId !== buildId ||
      !build.commit ||
      !build.sourceHash
    )
      throw Error("source-matched provider recovery production build required");
    const release = {
      commit: build.commit,
      sourceHash: build.sourceHash,
      buildId,
    };
    // SYNTHETIC receipt, confined to the copied assets. Not actual CI/TLS proof.
    const ci = {
      schema: 1,
      ...release,
      lane: "full",
      exactChecks: true,
      workflow: ".github/workflows/repository-checks.yml",
      runId: 503,
      checkedAt: new Date(clock.now()).toISOString(),
      syntheticProviderFailureRecoveryTestOnly: true,
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
        const absolute = join(fallbackDirectory, path);
        const stat = await lstat(absolute);
        if (stat.isSymbolicLink())
          entries[path] = "link:" + (await readlink(absolute));
        else if (stat.isDirectory())
          Object.assign(entries, await inventory(path));
        else if (stat.isFile()) entries[path] = sha(await readFile(absolute));
        else throw Error("unsupported isolated fallback asset");
      }
      return entries;
    }
    const manifest =
      JSON.stringify({ ...release, files: await inventory() }) + "\n";
    const fallbackManifestHash = sha(manifest);
    await writeFile(fallbackDirectory + "-manifest.json", manifest, {
      mode: 0o600,
    });
    await writeFile(
      fallbackDirectory + "-launcher.mjs",
      `// SYNTHETIC inventory binding; not a production service launcher.\nconst expectedManifest = "${fallbackManifestHash}";\nexport { expectedManifest };\n`,
      { mode: 0o600 },
    );
    await verifyNorthRecoveryInventory(fallbackDirectory, release);
    await writeFile(transportLog, "", { mode: 0o600 });
    await writeFile(modeFile, "success", { mode: 0o600 });
    // This file exists ONLY inside the temporary root, loaded by --import.
    // No application env/HTTP flag can install authority or select a transport.
    await writeFile(
      preload,
      `
import { appendFileSync, readFileSync } from "node:fs";
await import(${JSON.stringify(pathToFileURL(join(source, "tests/helpers/north150-preload.mjs")).href)});
// Host installation uses the fixture owner's explicit constructor dependency.
// There is deliberately NO HTTP installer or compiled-server transformation:
// normal routes validate the resulting installed proof/lifecycle unchanged.
const success = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : (input.url ?? String(input));
  if (url !== "https://api.openai.com/v1/responses" || init?.method !== "POST")
    return success(input, init);
  const mode = readFileSync(${JSON.stringify(modeFile)}, "utf8");
  const body = JSON.parse(init.body);
  if (new Headers(init.headers).get("authorization") !== "Bearer north150-synthetic-access" ||
      body.model !== "gpt-6.1-sol" || body.reasoning?.effort !== "medium" ||
      body.store !== false || body.stream !== true || body.tools ||
      !["north_conversation_v1", "careos_care"].includes(body.text?.format?.name))
    throw Error("unexpected injected provider request");
  const failures = {
    "known-usage-503": [503, "subscription_sharing_usage_unavailable"],
    "known-user-503": [503, "subscription_sharing_user_unavailable"],
    "unknown-503": [503, "synthetic_arbitrary_failure"],
    "denied-403": [403, "subscription_sharing_user_not_eligible"],
    "partial-stream": [200, "synthetic_partial_stream"],
  };
  const failure = failures[mode];
  if (mode !== "success" && !failure) throw Error("unknown synthetic transport mode");
  appendFileSync(${JSON.stringify(transportLog)}, JSON.stringify({
    at: Date.now(), kind: "post", name: body.text.format.name,
    mode, ...(failure ? { httpStatus: failure[0] } : {}),
  }) + "\\n");
  if (mode === "success") return success(input, init);
  if (mode === "partial-stream") return new Response(
    'data: {"type":"response.output_text.delta","delta":"partial"}\\n\\n',
    { headers: { "content-type": "text/event-stream" } },
  );
  return new Response(JSON.stringify({ error: { code: failure[1], message: failure[1] } }), {
    status: failure[0], headers: { "content-type": "application/json", "x-request-id": "req_synthetic_recovery_stop" },
  });
};
`,
      { mode: 0o600 },
    );

    return {
      root,
      directory,
      home,
      clock,
      recordsToken,
      release,
      ciReceiptHash: recoveryHash(ci),
      ciReceipt: ci,
      fallbackManifestHash,
      pool,
      verifyFallback: () =>
        verifyNorthRecoveryInventory(fallbackDirectory, release),
      selectFallback() {
        selectedDirectory = fallbackDirectory;
      },
      async setTransport(mode: RecoveryTransportMode) {
        await writeFile(modeFile + ".next", mode, { mode: 0o600 });
        await rename(modeFile + ".next", modeFile);
      },
      async transport(): Promise<
        Array<{
          kind: string;
          name: string;
          mode?: RecoveryTransportMode;
          httpStatus?: number;
        }>
      > {
        // Every provider POST is logged BEFORE generating its synthetic bytes;
        // response bookkeeping from the reused success preload isn't a POST.
        return (await readFile(transportLog, "utf8"))
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
          .filter((entry) => entry.kind !== "response");
      },
      async seedFailedTurn(fixture: {
        failedConversationId: string;
        failedTurn: CareTurn;
      }) {
        const owner = north150Hash(`records-v1:${recordsToken}`);
        const input = turnSchema.parse({
          requestId: fixture.failedTurn.requestId,
          twinId: null,
          revision: 0,
          message: fixture.failedTurn.message,
        });
        await pool!.query(
          "insert into care_conversations(id,owner,expires_at) values($1,$2,now()+interval '1 day')",
          [fixture.failedConversationId, owner],
        );
        const store = new PostgresStore(pool!, undefined, true, clock.now);
        expect(
          await store.claim(fixture.failedConversationId, owner, input),
        ).toBeNull();
        await store.finish(
          fixture.failedConversationId,
          owner,
          fixture.failedTurn,
        );
        const saved = await pool!.query(
          "select fingerprint,result from care_requests where id=$1 and conversation_id=$2",
          [input.requestId, fixture.failedConversationId],
        );
        expect(saved.rows).toEqual([
          {
            fingerprint: north150Hash(JSON.stringify(input)),
            result: fixture.failedTurn,
          },
        ]);
      },
      async seedMalformedGuide() {
        const owner = north150Hash(`records-v1:${recordsToken}`);
        const conversationId = randomUUID();
        const input = turnSchema.parse({
          requestId: randomUUID(),
          twinId: null,
          revision: 0,
          message: "Synthetic retained malformed Pal Care guide",
        });
        const guide = {
          text: "Synthetic retained historical guide; original malformed prose is not a fresh model answer.",
          steps: malformedGuideSteps.map(({ text }) => text),
          features: ["library" as const, "north" as const],
        };
        const turn: CareTurn = {
          requestId: input.requestId,
          message: input.message,
          answer: {
            outcome: "answered",
            mode: "live",
            context: null,
            revision: 0,
            text: guide.text,
            steps: guide.steps,
            sources: [],
            actions: [],
            conversationPlan: conversationPlanSchema.parse({
              task: "guidance",
              relation: "fresh",
              comparison: null,
              productSearch: "",
              productAction: "summary",
              careQuestion: "",
              clarification: "",
              guide,
              query: {
                outcome: "query",
                operation: "list",
                format: "cards",
                from: null,
                to: null,
                categories: [],
                origin: "all",
                receipt: "any",
                document: "any",
                price: "any",
                search: "",
              },
            }),
          },
        };
        await pool!.query(
          "insert into care_conversations(id,owner,expires_at) values($1,$2,now()+interval '1 day')",
          [conversationId, owner],
        );
        // REAL legacy fingerprint implementation and restricted role inspection;
        // no copied hash implementation, fresh prose publication, or inference.
        const store = new PostgresStore(pool!, undefined, true, clock.now);
        expect(await store.claim(conversationId, owner, input)).toBeNull();
        await store.finish(conversationId, owner, turn);
        const snapshot = async () =>
          (
            await pool!.query(
              "select id,conversation_id,fingerprint,md5(row_to_json(r)::text) hash,result from care_requests r where id=$1 and conversation_id=$2",
              [input.requestId, conversationId],
            )
          ).rows;
        const rows = await snapshot();
        expect(rows).toHaveLength(1);
        expect(rows[0].fingerprint).toBe(north150Hash(JSON.stringify(input)));
        expect(input).not.toHaveProperty("followupRequestId");
        return { conversationId, input, turn, rows, snapshot };
      },
      async start() {
        if (child)
          throw Error("isolated provider recovery child already started");
        if (selectedDirectory === fallbackDirectory)
          await verifyNorthRecoveryInventory(fallbackDirectory, release);
        stopping = false;
        output = "";
        child = spawn(
          process.execPath,
          [
            "--import",
            preload,
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
                throw Error(`isolated recovery child exited: ${output}`);
              // Readiness of THIS child, not another process already using 3117.
              if (!output.includes("Ready in")) return 0;
              try {
                return (
                  await fetch(providerFailureRecoveryLoopback + "/api/health")
                ).status;
              } catch {
                return 0;
              }
            },
            { timeout: 20000 },
          )
          .toBe(200);
        // Exercise the real, unmodified owner route after this child's startup.
        const ownerRead = await fetch(
          providerFailureRecoveryLoopback + "/api/ai/owner",
          {
            headers: { host: new URL(OWNER_ORIGIN).host },
          },
        );
        expect(ownerRead.status).toBe(200);
      },
      stop,
      async route(context: BrowserContext, recordsOwner: string) {
        if (recordsOwner !== north150Hash(`records-v1:${recordsToken}`))
          throw Error("exact isolated records owner required");
        await context.route("**/*", async (route) => {
          const request = route.request(),
            url = new URL(request.url());
          const dispatchedGeneration = generation;
          if (url.origin !== OWNER_ORIGIN)
            return route.abort("blockedbyclient");
          const headers = await request.allHeaders();
          // WebKit omits Cookie from allHeaders. Only synthetic jar cookies are
          // forwarded. This is NOT native private-HTTPS/cookie acceptance.
          const cookies = (await context.cookies(url.href)).filter((cookie) =>
            [OWNER_COOKIE, "palcare-records"].includes(cookie.name),
          );
          for (const cookie of cookies) {
            if (
              cookie.name === "palcare-records" &&
              cookie.value !== recordsToken
            )
              throw Error(
                "unexpected records cookie outside fixture namespace",
              );
            if (cookie.name === OWNER_COOKIE) {
              const state = JSON.parse(
                await readFile(
                  join(home, ".config/palcare-standing-owner/owner-state.json"),
                  "utf8",
                ),
              );
              if (
                !state.sessions.some(
                  (session: { tokenHash: string }) =>
                    session.tokenHash === north150Hash(cookie.value),
                )
              )
                throw Error("unexpected owner cookie outside synthetic ledger");
            }
          }
          if (!headers.cookie && cookies.length)
            headers.cookie = cookies
              .map((cookie) => `${cookie.name}=${cookie.value}`)
              .join("; ");
          let response: Awaited<ReturnType<typeof route.fetch>>;
          try {
            response = await route.fetch({
              url: providerFailureRecoveryLoopback + url.pathname + url.search,
              headers: {
                ...headers,
                host: new URL(OWNER_ORIGIN).host,
                connection: "close",
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
            const created = await response.json();
            if (
              !created ||
              typeof created !== "object" ||
              !("id" in created) ||
              typeof created.id !== "string" ||
              !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
                created.id,
              )
            )
              throw Error("invalid owned conversation-create response");
            // DB wall-clock retention only, scoped to this newly created owned
            // conversation. This cannot alter an owner/provider deadline.
            const updated = await pool!.query(
              "update care_conversations set expires_at=greatest(expires_at,now()+interval '1 day') where id=$1 and owner=$2",
              [created.id, recordsOwner],
            );
            expect(updated.rowCount).toBe(1);
          }
          try {
            await route.fulfill({ response });
          } catch (error) {
            if (dispatchedGeneration !== generation || request.failure())
              return;
            if (
              request.method() === "GET" &&
              url.pathname.startsWith("/_next/static/") &&
              error instanceof Error &&
              error.message.includes("Route is already handled")
            )
              return;
            throw error;
          }
        });
      },
      async dispose() {
        await stop();
        await pool!.query("delete from care_conversations where owner=$1", [
          north150Hash(`records-v1:${recordsToken}`),
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

/** Cookie and UA capture is locally fulfilled before any app/provider request. */
export async function installProviderRecoveryCookies(
  page: Page,
  token: string | undefined,
  recordsToken: string,
) {
  const url = OWNER_ORIGIN + "/__synthetic-provider-failure-agent";
  let agent = "";
  await page.route(url, async (route) => {
    agent = (await route.request().allHeaders())["user-agent"];
    await route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Synthetic recovery fixture</title>",
      headers: {
        "set-cookie": `${token ? `${OWNER_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict\n` : ""}palcare-records=${recordsToken}; Path=/; Secure; HttpOnly; SameSite=Strict`,
      },
    });
  });
  await page.goto(url);
  await page.unroute(url);
  expect(agent).not.toBe("");
  return agent;
}
