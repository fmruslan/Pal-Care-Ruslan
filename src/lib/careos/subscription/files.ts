import { constants } from "node:fs";
import { lstat, mkdir, open, rename, realpath, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { setTimeout as delay } from "node:timers/promises";

export class PilotError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
const token = z.string().min(1).max(32768);
export const registrationSchema = z.strictObject({
  format: z.literal("palcare-chatgpt-pilot-v1"),
  clientId: z
    .string()
    .min(1)
    .max(256)
    .refine((v) => v !== "dynamic_agent_client"),
  subject: z.string().min(1).max(256).optional(),
  refreshPending: z.boolean().optional(),
  tokens: z
    .strictObject({
      accessToken: token,
      refreshToken: token,
      idToken: token,
      nonce: token,
      scopes: z.array(z.string().max(128)).max(32),
      expiresAt: z.number().int().positive(),
      savedAt: z.number().int().positive(),
    })
    .optional(),
});
export type Registration = z.infer<typeof registrationSchema>;
type FileName =
  | "host.json"
  | "registration.json"
  | "incoming.json"
  | "pilot.json"
  | "session.json"
  | "application.json"
  | "owner-access.json"
  | "preservation.json"
  | "quality.json"
  | "owner-state.json"
  | "standing-approval.json";

// Protected host storage. No environment loader or database dependency.
// A stale lock is deliberately NOT stolen: inspect an interrupted run first.
export class PilotFiles {
  constructor(public directory: string) {}
  async prepare() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const s = await lstat(this.directory);
    if (
      !s.isDirectory() ||
      s.isSymbolicLink() ||
      (await realpath(this.directory)) !== resolve(this.directory) ||
      s.uid !== process.getuid?.() ||
      s.mode & 0o077
    )
      throw new PilotError("pilot_unsafe_directory");
  }
  async read(name: FileName): Promise<unknown | null> {
    let handle;
    try {
      handle = await open(
        join(this.directory, name),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new PilotError("pilot_unsafe_file");
    }
    try {
      const s = await handle.stat();
      if (
        !s.isFile() ||
        s.uid !== process.getuid?.() ||
        s.mode & 0o077 ||
        s.nlink !== 1 ||
        s.size >
          (["quality.json", "owner-state.json"].includes(name)
            ? 1048576
            : 131072)
      )
        throw new PilotError("pilot_unsafe_file");
      try {
        return JSON.parse(await handle.readFile("utf8"));
      } catch {
        throw new PilotError("pilot_file_invalid_json");
      }
    } finally {
      await handle.close();
    }
  }
  async write(name: FileName, value: unknown) {
    // Refuse unsafe existing targets, even though rename itself does not follow them.
    await this.read(name);
    const body = JSON.stringify(value, null, 2) + "\n";
    if (
      Buffer.byteLength(body) >
      (["quality.json", "owner-state.json"].includes(name) ? 1048576 : 131072)
    )
      throw new PilotError("pilot_file_too_large");
    // Private host state is provisioned at runtime, never a deployment asset.
    const temp = join(
      /* turbopackIgnore: true */ this.directory,
      `.${name}.${randomUUID()}`,
    );
    const handle = await open(/* turbopackIgnore: true */ temp, "wx", 0o600);
    try {
      await handle.writeFile(body);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, join(this.directory, name));
    const directory = await open(this.directory, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
  async removeIncoming() {
    await this.read("incoming.json");
    await unlink(join(this.directory, "incoming.json"));
  }
  async locked<T>(
    work: () => Promise<T>,
    name: ".lock" | ".evaluation-lock" | ".owner-access-lock" = ".lock",
  ): Promise<T> {
    await this.prepare();
    let lock;
    try {
      lock = await open(
        /* turbopackIgnore: true */ join(
          /* turbopackIgnore: true */ this.directory,
          name,
        ),
        "wx",
        0o600,
      );
    } catch {
      throw new PilotError("pilot_locked_inspect_before_recovery");
    }
    try {
      return await work();
    } finally {
      await lock.close();
      await unlink(join(/* turbopackIgnore: true */ this.directory, name));
    }
  }
  async hostId() {
    const saved = await this.read("host.json");
    if (saved)
      return z
        .strictObject({
          hostId: z
            .string()
            .regex(
              /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
            ),
        })
        .parse(saved).hostId;
    const hostId = `urn:uuid:${randomUUID()}`;
    await this.write("host.json", { hostId });
    return hostId;
  }
  /** Wait for contention, never steal a stale lock or replay work that started. */
  async lockedWaiting<T>(
    work: () => Promise<T>,
    name: ".lock" | ".owner-access-lock" = ".lock",
    signal?: AbortSignal,
    waitMs = 2000,
  ): Promise<T> {
    const until = Date.now() + waitMs;
    for (;;) {
      signal?.throwIfAborted();
      let entered = false;
      try {
        return await this.locked(async () => {
          entered = true;
          signal?.throwIfAborted();
          return work();
        }, name);
      } catch (error) {
        if (
          entered ||
          !(error instanceof PilotError) ||
          error.code !== "pilot_locked_inspect_before_recovery" ||
          Date.now() >= until
        )
          throw error;
        await delay(20, undefined, { signal });
      }
    }
  }
  async registration() {
    const raw = await this.read("registration.json");
    return raw ? registrationSchema.parse(raw) : null;
  }
}
