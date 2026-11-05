// Opt-in GreatBison host proof; credentials always belong to a disposable DB.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { careWorkerContainerArgs } from "../../scripts/care-worker-container";

const exec = promisify(execFile);
export async function workerHostProof(
  url: string,
  mode: "care" | "protection",
) {
  const parsed = new URL(url);
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(parsed.port, "55440");
  assert.ok(parsed.pathname.endsWith("_test"));
  const flag =
    mode === "protection"
      ? "CARE_PROTECTION_WORKER_ENABLED"
      : "CARE_HOST_WRITES_ENABLED";
  const key =
    mode === "protection"
      ? "CARE_PROTECTION_DATABASE_URL"
      : "CARE_WATCH_DATABASE_URL";
  const env: NodeJS.ProcessEnv = {
    PATH: "/usr/bin:/bin",
    NODE_ENV: "production",
    [flag]: "true",
    [key]: url,
  };
  const script =
    mode === "protection"
      ? "scripts/protection-worker-container.ts"
      : "scripts/care-worker-container.ts";
  // Run the unmodified entry/bridge/authority/checker, not just a Docker argument assertion.
  const result = await exec(process.execPath, ["--import", "tsx", script], {
    env,
    timeout: 55000,
  });
  const outcome = JSON.parse(result.stdout.trim().split("\n").at(-1)!);
  assert.equal(typeof outcome.checked, "number");
  const bridge = await mkdtemp("/tmp/opencode/protection-isolation-");
  try {
    const probe = `
      import assert from 'node:assert/strict';
      import { readFile, writeFile } from 'node:fs/promises';
      import { connect } from 'node:net';
      import { networkInterfaces } from 'node:os';
      assert.equal(process.getuid(),1000);
      assert.deepEqual(Object.keys(networkInterfaces()),['lo']);
      for (const file of ['/app/.env.local','/var/run/docker.sock','/home/bigrus/.config/palcare-standing-owner/owner-state.json','/root/.aws/credentials']) await assert.rejects(readFile(file));
      await assert.rejects(writeFile('/app/package.json','forbidden'));
      await assert.rejects(writeFile('/root-write-proof','forbidden'));
      for (const host of ['127.0.0.1','1.1.1.1']) await assert.rejects(new Promise((resolve,reject)=>{const socket=connect({host,port:443});socket.setTimeout(800,()=>socket.destroy(Error('timeout')));socket.once('error',reject);socket.once('connect',()=>{socket.destroy();resolve();});}));
      assert.equal(Object.keys(process.env).filter(key=>/DATABASE_URL$/.test(key)).length,1);
      assert.equal(process.env.CAREOS_API_KEY,undefined);
      const status=await readFile('/proc/self/status','utf8');assert.match(status,/NoNewPrivs:\\s+1/);assert.match(status,/CapEff:\\s+0+/);
      console.log(JSON.stringify({uid:1000,network:'none',filesystem:'read-only',ownerFiles:'denied',dockerSocket:'denied',modelCredential:'absent',noNewPrivileges:true}));
    `;
    const args = careWorkerContainerArgs(
      process.cwd(),
      bridge,
      `palcare-proof-${randomUUID()}`,
      mode,
    ).slice(0, -5);
    const proof = await exec(
      "docker",
      [...args, "node", "--input-type=module", "-e", probe],
      { env, timeout: 15000 },
    );
    assert.equal(JSON.parse(proof.stdout.trim()).network, "none");
    return { ...outcome, hostIsolation: "passed" };
  } finally {
    await rm(bridge, { recursive: true, force: true });
  }
}
