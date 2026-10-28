import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { CareError } from "./contracts";
import {
  assertEvaluationAccess,
  evaluationSettings,
  type EvaluationScope,
} from "./evaluation-access";
import { PilotFiles } from "./subscription/files";
import { sessionSchema } from "./subscription/session";

export const PAIR_COOKIE = "palcare-owner-pairing";
export const pairingScopes = z
  .array(z.enum(["customer", "studio"]))
  .min(1)
  .max(2)
  .refine((s) => new Set(s).size === s.length);
const applicationSchema = z.strictObject({
  origin: z.url(),
  customer: z.string().regex(/^[a-f0-9]{64}$/),
  studio: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.number().int().positive(),
});
const entrySchema = z.strictObject({
  id: z.uuid(),
  browserHash: z.string().regex(/^[a-f0-9]{64}$/),
  scopes: pairingScopes,
  createdAt: z.number().int(),
  expiresAt: z.number().int(),
  state: z.enum(["pending", "approved", "consumed"]),
});
const stateSchema = z.strictObject({
  window: z.string(),
  entries: z.array(entrySchema).max(32),
});
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

// No provider/registration reads, session writes, network, or database authority.
export async function ownerWindow(files: PilotFiles, now = Date.now()) {
  await files.prepare();
  const session = sessionSchema.parse(await files.read("session.json"));
  const app = applicationSchema.parse(await files.read("application.json"));
  const origin = new URL(app.origin);
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.origin !== app.origin
  )
    throw new CareError("owner_window_expired_or_changed", 403);
  if (
    session.expiresAt <= now ||
    session.expiresAt !== app.expiresAt ||
    !session.creditsDisabledConfirmed
  )
    throw new CareError("owner_window_expired_or_changed", 403);
  const env = {
    APP_ORIGIN: app.origin,
    CAREOS_EVALUATION_ENABLED: "true",
    CAREOS_EVALUATION_EXPIRES_AT: new Date(app.expiresAt).toISOString(),
    CAREOS_CUSTOMER_ACCESS_HASH: hash(app.customer),
    CAREOS_STUDIO_ACCESS_HASH: hash(app.studio),
  };
  evaluationSettings(env, now);
  return {
    app,
    env,
    fingerprint: hash(
      JSON.stringify([
        session.id,
        session.approvedAt,
        app.origin,
        app.expiresAt,
        env.CAREOS_CUSTOMER_ACCESS_HASH,
        env.CAREOS_STUDIO_ACCESS_HASH,
      ]),
    ),
  };
}

async function checked(
  files: PilotFiles,
  env: Record<string, string | undefined>,
  now: number,
) {
  if (env.CAREOS_OWNER_PAIRING_ENABLED !== "true")
    throw new CareError("owner_pairing_disabled", 403);
  const window = await ownerWindow(files, now);
  if (
    env.APP_ORIGIN !== window.app.origin ||
    env.CAREOS_EVALUATION_EXPIRES_AT !== window.env.CAREOS_EVALUATION_EXPIRES_AT
  )
    throw new CareError("owner_window_expired_or_changed", 403);
  for (const scope of ["customer", "studio"] as const)
    assertEvaluationAccess(scope, window.app[scope], env, now);
  return window;
}

async function state(files: PilotFiles, fingerprint: string) {
  const raw = await files.read("owner-access.json");
  const stored = raw ? stateSchema.parse(raw) : null;
  return stored?.window === fingerprint
    ? stored
    : { window: fingerprint, entries: [] as z.infer<typeof entrySchema>[] };
}
function view(e: z.infer<typeof entrySchema>) {
  return {
    requestId: e.id,
    scopes: e.scopes,
    expiresAt: new Date(e.expiresAt).toISOString(),
    approved: e.state === "approved",
  };
}
function matching(
  entries: z.infer<typeof entrySchema>[],
  browser: string | undefined,
  now: number,
) {
  if (!/^[a-f0-9]{64}$/.test(browser ?? "")) return undefined;
  return entries.find(
    (e) =>
      e.browserHash === hash(browser!) &&
      e.expiresAt > now &&
      e.state !== "consumed",
  );
}
export async function requestOwnerAccess(
  files: PilotFiles,
  env: Record<string, string | undefined>,
  scopes: EvaluationScope[],
  now = Date.now(),
) {
  const requested = pairingScopes.parse(scopes);
  return files.locked(async () => {
    const w = await checked(files, env, now),
      s = await state(files, w.fingerprint);
    // Persistent per-window cap, plus per-hour and burst bounds. No transcript cleanup resets these.
    if (
      s.entries.length >= 32 ||
      s.entries.filter((e) => e.createdAt > now - 3600000).length >= 12 ||
      s.entries.some((e) => e.createdAt > now - 5000)
    )
      throw new CareError("owner_pairing_rate_limited", 429);
    const browser = randomBytes(32).toString("hex");
    const entry = {
      id: randomUUID(),
      browserHash: hash(browser),
      scopes: requested,
      createdAt: now,
      expiresAt: Math.min(now + 300000, w.app.expiresAt),
      state: "pending" as const,
    };
    s.entries.push(entry);
    await files.write("owner-access.json", s);
    return { pairing: view(entry), browser };
  }, ".owner-access-lock");
}
export async function ownerAccessStatus(
  files: PilotFiles,
  env: Record<string, string | undefined>,
  browser: string | undefined,
  now = Date.now(),
) {
  const w = await checked(files, env, now),
    s = await state(files, w.fingerprint);
  const entry = matching(s.entries, browser, now);
  return entry ? view(entry) : null;
}
// Host-CLI only. No HTTP approval action exists. The caller must already have the
// owner account's OS/SSH authority and explicitly name the browser request/scopes.
export async function approveOwnerAccess(
  files: PilotFiles,
  id: string,
  scopes: EvaluationScope[],
  now = Date.now(),
) {
  z.uuid().parse(id);
  const selected = pairingScopes.parse(scopes).toSorted();
  return files.locked(async () => {
    const w = await ownerWindow(files, now),
      s = await state(files, w.fingerprint);
    const entry = s.entries.find(
      (e) => e.id === id && e.expiresAt > now && e.state === "pending",
    );
    if (
      !entry ||
      JSON.stringify(entry.scopes.toSorted()) !== JSON.stringify(selected)
    )
      throw new CareError("owner_pairing_not_pending_or_scope_mismatch", 403);
    entry.state = "approved";
    await files.write("owner-access.json", s);
    return view(entry);
  }, ".owner-access-lock");
}
export async function completeOwnerAccess(
  files: PilotFiles,
  env: Record<string, string | undefined>,
  browser: string | undefined,
  id: string,
  now = Date.now(),
) {
  return files.locked(async () => {
    const w = await checked(files, env, now),
      s = await state(files, w.fingerprint);
    const entry = matching(s.entries, browser, now);
    if (!entry || entry.id !== id)
      throw new CareError("owner_pairing_missing_or_expired", 403);
    if (entry.state !== "approved") return null;
    entry.state = "consumed";
    // Burn before issuing cookies: an interrupted response requires a new pairing,
    // never a replayable grant. Original scope values/deadline are unchanged.
    await files.write("owner-access.json", s);
    return { scopes: entry.scopes, app: w.app };
  }, ".owner-access-lock");
}
