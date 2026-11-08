import { constants } from "node:fs";
import { lstat, mkdir, open, rename, realpath, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { setTimeout as delay } from "node:timers/promises";

export class PilotError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
/** Publication may already be visible. Never release the transition's owner
 * lock or retry automatically; explicit host inspection is required. */
export class PilotTransitionPublicationUncertainError extends PilotError {
  constructor(cause: unknown) {
    super("pilot_transition_publication_uncertain_inspect_owner_lock");
    this.cause = cause;
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
  | "standing-approval.json"
  | "evaluation-approval.json"
  | "quota-campaign-approval.json"
  | "quota-campaign-extension-approval.json"
  | "evaluation-recovery.json"
  | "evaluation-recovery-transition.json"
  | "north-review-origin-approval.json"
  | "north-review-origin-request.json";

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
    return (await this.snapshot(name))?.value ?? null;
  }
  /** Same protected descriptor supplies both parsed data and exact byte digest. */
  async snapshot(name: FileName) {
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
        const raw = await handle.readFile("utf8");
        return {
          value: JSON.parse(raw) as unknown,
          hash: createHash("sha256").update(raw).digest("hex"),
        };
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
    await this.publishSnapshot(temp, name);
    await this.syncDirectory();
  }
  protected async publishSnapshot(temp: string, name: FileName) {
    await rename(temp, join(this.directory, name));
  }
  protected async openDirectory() {
    return open(this.directory, "r");
  }
  private async syncDirectory() {
    const directory = await this.openDirectory();
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
    mode?: "recovery-transition",
  ): Promise<T> {
    if (mode && name !== ".owner-access-lock")
      throw new PilotError("pilot_invalid_transition_lock");
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
    let retain = false;
    try {
      if (mode === "recovery-transition") {
        // Establish a durable denial sentinel BEFORE authority publication.
        // A crash/uncertain publication leaves this same lock across restart.
        retain = true;
        await lock.sync();
        await this.syncDirectory();
        retain = false;
      }
      return await work();
    } catch (error) {
      if (
        mode === "recovery-transition" &&
        error instanceof PilotTransitionPublicationUncertainError
      )
        retain = true;
      throw error;
    } finally {
      await lock.close();
      if (!retain)
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
    mode?: "recovery-transition",
  ): Promise<T> {
    const until = Date.now() + waitMs;
    for (;;) {
      signal?.throwIfAborted();
      let entered = false;
      try {
        return await this.locked(
          async () => {
            entered = true;
            signal?.throwIfAborted();
            return work();
          },
          name,
          mode,
        );
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
  /** Opt-in only for the one-shot transition. Ordinary locks keep their existing
   * behavior. Uncertain publication deliberately strands .owner-access-lock. */
  async lockedRecoveryTransition<T>(work: () => Promise<T>) {
    return this.lockedWaiting(
      work,
      ".owner-access-lock",
      undefined,
      2000,
      "recovery-transition",
    );
  }
  async registration() {
    const raw = await this.read("registration.json");
    return raw ? registrationSchema.parse(raw) : null;
  }
}
