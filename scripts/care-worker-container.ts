import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, lstat, rm, realpath } from "node:fs/promises";
import { createServer, connect, type Socket } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeWriterUrl } from "../src/db/authority";

export const CARE_WORKER_IMAGE =
  "node@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da";
const primary = "/home/bigrus/projects/palcare";

export function careWorkerTarget(value: string) {
  const url = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !["55432", "55440"].includes(url.port) ||
    !url.username ||
    !url.password ||
    url.searchParams.has("host")
  )
    throw Error("care_worker_target_rejected");
  return { url, port: Number(url.port) };
}

/** No model/owner files, admin URL, Docker socket or host network in the child. */
export function careWorkerContainerArgs(
  root: string,
  bridge: string,
  name: string,
) {
  const mounts = [
    [join(root, "src"), "/app/src"],
    [join(root, "node_modules"), "/app/node_modules"],
    [join(root, "package.json"), "/app/package.json"],
    [join(root, "tsconfig.json"), "/app/tsconfig.json"],
    [join(root, "scripts/care-records.ts"), "/app/scripts/care-records.ts"],
    [bridge, "/run/care-db"],
  ];
  return [
    "run",
    "--rm",
    "--pull",
    "never",
    "--name",
    name,
    "--network",
    "none",
    "--user",
    "1000:1000",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    "64",
    "--memory",
    "256m",
    "--cpus",
    "0.5",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=16m",
    "--workdir",
    "/app",
    ...mounts.flatMap(([source, target]) => [
      "--mount",
      `type=bind,src=${source},dst=${target},readonly`,
    ]),
    "--env",
    "CARE_HOST_WRITES_ENABLED",
    "--env",
    "CARE_WATCH_DATABASE_URL",
    CARE_WORKER_IMAGE,
    "node",
    "--import",
    "tsx",
    "scripts/care-records.ts",
    "check",
  ];
}

/** One-shot private Unix bridge to exactly one approved local PostgreSQL port.
 * It is not an HTTP proxy, public listener, provider client or persistent service. */
export async function launchCareWorker() {
  if (
    process.env.CARE_HOST_WRITES_ENABLED !== "true" ||
    process.getuid?.() !== 1000 ||
    (await realpath(process.cwd())) !== primary
  )
    throw Error("care_worker_host_scope_rejected");
  const { url, port } = careWorkerTarget(
    runtimeWriterUrl("CARE_WATCH_DATABASE_URL"),
  );
  const base = `/run/user/${process.getuid()}/palcare-care`;
  await mkdir(base, { recursive: true, mode: 0o700 });
  const info = await lstat(base);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid() ||
    (info.mode & 0o077) !== 0
  )
    throw Error("care_worker_bridge_not_private");
  const folder = await mkdtemp(join(base, "check-"));
  const name = `palcare-care-worker-${randomUUID()}`;
  const sockets = new Set<Socket>();
  const server = createServer((client) => {
    const database = connect({ host: "127.0.0.1", port });
    sockets.add(client);
    sockets.add(database);
    client.on("error", () => database.destroy());
    database.on("error", () => client.destroy());
    client.on("close", () => {
      sockets.delete(client);
      database.destroy();
    });
    database.on("close", () => {
      sockets.delete(database);
      client.destroy();
    });
    client.pipe(database);
    database.pipe(client);
  });
  server.maxConnections = 2;
  let child: ReturnType<typeof spawn> | undefined;
  const stopContainer = () => {
    spawn("docker", ["stop", "--time", "2", name], {
      stdio: "ignore",
      env: { PATH: "/usr/bin:/bin", NODE_ENV: "production" },
    });
  };
  const stop = () => {
    stopContainer();
    child?.kill("SIGTERM");
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((accept, reject) => {
      server.once("error", reject);
      server.listen(join(folder, `.s.PGSQL.${port}`), () => accept());
    });
    url.searchParams.set("host", "/run/care-db");
    const result = await new Promise<number>((accept, reject) => {
      const running = spawn(
        "docker",
        careWorkerContainerArgs(primary, folder, name),
        {
          stdio: "inherit",
          env: {
            PATH: "/usr/bin:/bin",
            NODE_ENV: "production",
            CARE_HOST_WRITES_ENABLED: "true",
            CARE_WATCH_DATABASE_URL: url.toString(),
          },
        },
      );
      child = running;
      timeout = setTimeout(() => {
        stop();
        reject(Error("care_worker_deadline"));
      }, 45000);
      running.once("error", reject);
      running.once("exit", (code) => accept(code ?? 1));
    });
    if (result !== 0) throw Error("care_worker_container_failed");
  } finally {
    if (timeout) clearTimeout(timeout);
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((accept) => server.close(() => accept()));
    await rm(folder, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  launchCareWorker().catch(() => {
    console.error(
      "Care isolated checker stopped; no financial/model request or authority renewal was performed.",
    );
    process.exitCode = 1;
  });
}
