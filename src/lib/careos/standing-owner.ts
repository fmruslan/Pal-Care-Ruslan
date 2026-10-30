import { createHash, randomBytes, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { CareError } from "./contracts";
import { PilotFiles } from "./subscription/files";

export const OWNER_COOKIE = "__Host-palcare-owner";
export const OWNER_ORIGIN = "https://greatbison.tail9e8802.ts.net:8444";
export const OWNER_MAX_AGE = 30 * 86400000;
export const OWNER_IDLE = 7 * 86400000;
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const scope = z.enum(["customer", "customer-studio"]);
const time = z.number().int().nonnegative();
export const standingPolicySchema = z.strictObject({
  id: z.uuid(),
  approvedAt: time,
  provider: z.literal("chatgpt-subscription"),
  model: z.literal("gpt-6.1-sol"),
  reasoning: z.literal("medium"),
  origin: z.literal(OWNER_ORIGIN),
  scopes: z
    .array(scope)
    .min(1)
    .max(2)
    .refine((v) => new Set(v).size === v.length),
  requestLimit: z.number().int().min(1).max(500),
  concurrency: z.literal(1),
  requestsPerMinute: z.number().int().min(1).max(10),
  creditsDisabledConfirmed: z.literal(true),
  providerPermissionConfirmed: z.literal(true),
  historicalJournalHash: digest,
});
const eventSchema = z.strictObject({
  id: z.uuid(),
  at: time,
  kind: z.enum([
    "pair",
    "approve",
    "approve-policy",
    "provider-block",
    "logout",
    "touch",
    "revoke-session",
    "revoke-policy",
    "reserve",
    "completed",
    "unknown",
    "failed",
  ]),
  subject: z.string().min(1).max(200),
  observation: z
    .object({
      httpStatus: z.number().int().min(100).max(599).optional(),
      requestId: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,128}$/)
        .optional(),
      usage: z
        .object({
          inputTokens: time,
          outputTokens: time,
          totalTokens: time,
          cachedTokens: time,
          cacheWriteTokens: time.nullable(),
          reasoningTokens: time,
        })
        .optional(),
    })
    .optional(),
});
const stateSchema = z.strictObject({
  version: z.literal(1),
  policy: standingPolicySchema.nullable(),
  sessions: z
    .array(
      z.strictObject({
        id: z.uuid(),
        tokenHash: digest,
        agentHash: digest,
        createdAt: time,
        lastSeen: time,
        approvedAt: time.nullable(),
        revoked: z.boolean(),
      }),
    )
    .max(128),
  events: z.array(eventSchema).max(3000),
});
type State = z.infer<typeof stateSchema>;
export type OwnerProof = { token?: string; agent: string };
export const ownerFiles = () =>
  new PilotFiles(join(homedir(), ".config/palcare-standing-owner"));
const deny = (code: string): never => {
  throw new CareError(`careos_owner_${code}`, 403);
};

/** Host-private logical append-only journal. Never pruned, reset or auto-recovered.
 * Atomic/fsynced snapshots retain every event. Host/root can alter files: this is
 * not tamper-proof storage. A crashed active reservation blocks new dispatch. */
export class StandingOwner {
  constructor(
    public files = ownerFiles(),
    private now = () => Date.now(),
  ) {}
  private async state(): Promise<State> {
    return stateSchema.parse(
      (await this.files.read("owner-state.json")) ?? {
        version: 1,
        policy: null,
        sessions: [],
        events: [],
      },
    );
  }
  private async change<T>(work: (s: State) => T) {
    return this.files.locked(async () => {
      const s = await this.state();
      const result = work(s);
      await this.files.write("owner-state.json", stateSchema.parse(s));
      return result;
    }, ".owner-access-lock");
  }
  private event(
    s: State,
    kind: z.infer<typeof eventSchema>["kind"],
    subject: string,
  ) {
    s.events.push({ id: randomUUID(), at: this.now(), kind, subject });
  }
  private session(s: State, proof: OwnerProof) {
    if (!proof.token || !/^[a-f0-9]{64}$/.test(proof.token))
      return deny("signin_required");
    const entry = s.sessions.find((v) => v.tokenHash === hash(proof.token!));
    if (
      !entry ||
      entry.revoked ||
      entry.agentHash !== hash(proof.agent) ||
      entry.approvedAt === null ||
      this.now() < entry.createdAt ||
      this.now() >= entry.createdAt + OWNER_MAX_AGE ||
      this.now() >= entry.lastSeen + OWNER_IDLE
    )
      return deny("signin_required");
    return entry;
  }
  private allowed(
    s: State,
    proof: OwnerProof,
    selected: z.infer<typeof scope>,
    enabled: boolean,
  ) {
    this.session(s, proof);
    const p = s.policy;
    if (!enabled || !p || s.events.some((e) => e.kind === "revoke-policy"))
      return deny("ai_disabled");
    if (s.events.some((e) => e.kind === "provider-block"))
      return deny("provider_unavailable");
    if (!p.scopes.includes(selected)) return deny("scope_denied");
    const reservations = s.events.filter((e) => e.kind === "reserve");
    if (reservations.length >= p.requestLimit) return deny("quota_exhausted");
    if (
      reservations.some(
        (e) =>
          !s.events.some(
            (v) =>
              v.subject === e.subject &&
              ["completed", "failed", "unknown"].includes(v.kind),
          ),
      )
    )
      return deny("busy");
    if (
      reservations.filter((e) => e.at > this.now() - 60000).length >=
      p.requestsPerMinute
    )
      return deny("rate_limited");
    return p;
  }
  async pair(agent: string) {
    const token = randomBytes(32).toString("hex");
    return this.change((s) => {
      if (
        s.events.filter((e) => e.kind === "pair" && e.at > this.now() - 3600000)
          .length >= 10
      )
        return deny("pair_rate_limited");
      const id = randomUUID();
      s.sessions.push({
        id,
        tokenHash: hash(token),
        agentHash: hash(agent),
        createdAt: this.now(),
        lastSeen: this.now(),
        approvedAt: null,
        revoked: false,
      });
      this.event(s, "pair", id);
      return { id, token };
    });
  }
  /** Only the local owner CLI calls this. No web approval endpoint. */
  async approve(id: string) {
    z.uuid().parse(id);
    return this.change((s) => {
      const entry = s.sessions.find((v) => v.id === id);
      if (
        !entry ||
        entry.revoked ||
        entry.approvedAt !== null ||
        this.now() >= entry.createdAt + 300000 ||
        this.now() < entry.createdAt
      )
        return deny("pair_expired");
      entry.approvedAt = this.now();
      this.event(s, "approve", id);
    });
  }
  /** Exact separate owner approval required; never called by HTTP/startup. */
  async installPolicy(value: unknown) {
    const policy = standingPolicySchema.parse(value);
    return this.change((s) => {
      if (
        s.policy ||
        s.events.some((e) => e.kind === "reserve") ||
        policy.approvedAt > this.now()
      )
        return deny("policy_already_set_or_invalid");
      s.policy = policy;
      this.event(s, "approve-policy", hash(JSON.stringify(policy)));
    });
  }
  async authenticate(proof: OwnerProof) {
    return this.change((s) => {
      const entry = this.session(s, proof);
      // Bound write volume; absolute lifetime never slides.
      if (this.now() - entry.lastSeen >= 3600000) {
        entry.lastSeen = this.now();
        this.event(s, "touch", entry.id);
      }
      return entry.id;
    });
  }
  async revokeSession(id: string) {
    return this.change((s) => {
      const entry = s.sessions.find((v) => v.id === id);
      if (!entry) return deny("signin_required");
      entry.revoked = true;
      this.event(s, "revoke-session", id);
    });
  }
  async logout(proof: OwnerProof) {
    return this.change((s) => {
      const entry = this.session(s, proof);
      entry.revoked = true;
      this.event(s, "logout", entry.id);
    });
  }
  async revokePolicy(proof: OwnerProof) {
    return this.change((s) => {
      this.session(s, proof);
      this.event(s, "revoke-policy", s.policy?.id ?? "disabled");
    });
  }
  async assertDispatch(
    proof: OwnerProof,
    selected: z.infer<typeof scope>,
    enabled: boolean,
  ) {
    // Same cross-process lock as logout/revocation/accounting, not the provider lock.
    return this.files.locked(async () => {
      this.allowed(await this.state(), proof, selected, enabled);
    }, ".owner-access-lock");
  }
  async reserve(
    proof: OwnerProof,
    selected: z.infer<typeof scope>,
    key: string,
    enabled: boolean,
  ) {
    z.string().min(1).max(200).parse(key);
    return this.change((s) => {
      this.allowed(s, proof, selected, enabled);
      if (s.events.some((e) => e.kind === "reserve" && e.subject === key))
        return deny("already_dispatched");
      this.event(s, "reserve", key);
    });
  }
  async settle(
    key: string,
    outcome: "completed" | "failed" | "unknown",
    observation?: unknown,
  ) {
    return this.change((s) => {
      if (
        !s.events.some((e) => e.kind === "reserve" && e.subject === key) ||
        s.events.some(
          (e) =>
            ["completed", "failed", "unknown"].includes(e.kind) &&
            e.subject === key,
        )
      )
        return deny("settlement_conflict");
      this.event(s, outcome, key); // All outcomes retain one charged request.
      if (observation)
        s.events.at(-1)!.observation =
          eventSchema.shape.observation.parse(observation);
    });
  }
  async assertHistoricalJournal(value: unknown) {
    const s = await this.state();
    if (
      !s.policy ||
      s.policy.historicalJournalHash !== hash(JSON.stringify(value))
    )
      return deny("history_mismatch");
  }
  async blockProvider() {
    return this.change((s) => {
      this.event(s, "provider-block", "permission-or-usage-denied");
    });
  }
  async status(proof: OwnerProof) {
    await this.files.prepare();
    const s = await this.state();
    let remembered = false;
    try {
      this.session(s, proof);
      remembered = true;
    } catch {
      /* No authority from status. */
    }
    const used = s.events.filter((e) => e.kind === "reserve").length;
    return {
      remembered,
      providerBlocked: s.events.some((e) => e.kind === "provider-block"),
      policy: s.policy ? "approved" : "disabled",
      revoked: s.events.some((e) => e.kind === "revoke-policy"),
      used,
      remaining: s.policy ? Math.max(0, s.policy.requestLimit - used) : 0,
      unknown: s.events.filter(
        (e) =>
          e.kind === "reserve" &&
          !s.events.some(
            (v) =>
              ["completed", "failed"].includes(v.kind) &&
              v.subject === e.subject,
          ),
      ).length,
    };
  }
}

export function assertOwnerRequest(request: Request, mutation: boolean) {
  if (
    request.headers.get("host") !== new URL(OWNER_ORIGIN).host ||
    ((mutation || request.headers.has("origin")) &&
      request.headers.get("origin") !== OWNER_ORIGIN) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return deny("origin_rejected");
}
