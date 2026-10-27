import { z } from "zod";
import { accessToken, type Transport } from "./auth";
import { PilotFiles, PilotError } from "./files";
import { streamStructured, safeFailure } from "./pilot";

import { SUBSCRIPTION_SESSION } from "./policy";
export { SUBSCRIPTION_SESSION };
const attemptSchema = z.object({
  key: z.string().min(1).max(160),
  scope: z.enum(["customer", "studio", "diagnostic"]),
  schema: z.string().max(80),
  attemptedAt: z.string(),
  state: z.enum(["unknown", "completed", "failed"]),
  summary: z.record(z.string(), z.unknown()),
  error: z.string().optional(),
});
export const sessionSchema = z.strictObject({
  id: z.literal(SUBSCRIPTION_SESSION),
  approvedAt: z.string(),
  expiresAt: z.number().int().positive(),
  creditsDisabledConfirmed: z.literal(true),
  requestLimit: z.union([z.literal(30), z.literal(50)]),
  blocked: z.string().nullable(),
  attempts: z.array(attemptSchema).max(50),
});
export async function authorizeSession(files: PilotFiles) {
  if (await files.read("session.json"))
    throw new PilotError("subscription_session_already_authorized");
  await files.write("session.json", {
    id: SUBSCRIPTION_SESSION,
    approvedAt: new Date().toISOString(),
    expiresAt: Date.now() + 86400000,
    creditsDisabledConfirmed: true,
    requestLimit: 30,
    blocked: null,
    attempts: [],
  });
}
export async function subscriptionSession(files: PilotFiles) {
  const result = sessionSchema.safeParse(await files.read("session.json"));
  if (!result.success || result.data.expiresAt <= Date.now())
    throw new PilotError("subscription_session_not_authorized_or_expired");
  if (result.data.blocked) throw new PilotError("subscription_session_blocked");
  return result.data;
}
export async function extendSessionTo50(files: PilotFiles) {
  const session = await subscriptionSession(files);
  // Increase only the cap, never history, expiry, provider blocks or pilot data.
  if (session.requestLimit === 30)
    await files.write("session.json", { ...session, requestLimit: 50 });
}
// One lock covers refresh, durable dispatch marker and SSE consumption. No token
// or prompt storage. Fixed global allowance is independent of API-dollar buckets.
export async function subscriptionStructured<T extends z.ZodType>(options: {
  files: PilotFiles;
  scope: "customer" | "studio" | "diagnostic";
  requestId: string;
  payload: string;
  schema: T;
  name: string;
  prompt?: string;
  signal: AbortSignal;
  transport?: Transport;
}) {
  return options.files.locked(async () => {
    const session = await subscriptionSession(options.files);
    const key = `${options.scope}:${options.requestId}:${options.name}`;
    if (session.attempts.some((a) => a.key === key))
      throw new PilotError("subscription_request_already_dispatched");
    if (session.attempts.length >= session.requestLimit)
      throw new PilotError("subscription_session_request_limit");
    const token = await accessToken(options.files, options.transport);
    let attempt: z.infer<typeof attemptSchema> | undefined;
    try {
      const result = await streamStructured({
        accessToken: token,
        payload: options.payload,
        schema: options.schema,
        name: options.name,
        prompt: options.prompt,
        signal: options.signal,
        transport: options.transport,
        beforeDispatch: async () => {
          const previous = session.attempts.at(-1);
          if (previous && Date.now() - Date.parse(previous.attemptedAt) < 500)
            throw new PilotError("subscription_rate_limit");
          attempt = {
            key,
            scope: options.scope,
            schema: options.name,
            attemptedAt: new Date().toISOString(),
            state: "unknown",
            summary: {},
          };
          session.attempts.push(attempt);
          await options.files.write("session.json", session);
        },
        observe: (summary) => {
          if (attempt) Object.assign(attempt.summary, summary);
        },
      });
      if (attempt) attempt.state = "completed";
      return result;
    } catch (error) {
      if (attempt) {
        attempt.error = safeFailure(error);
        if (attempt.summary.status === "completed") attempt.state = "failed";
        if (
          [401, 403, 429].includes(Number(attempt.summary.httpStatus)) ||
          /subscription_sharing_|chatpass_v2_|pilot_http_40[13]|pilot_oauth_/.test(
            attempt.error,
          )
        )
          session.blocked = attempt.error;
      }
      throw error;
    } finally {
      if (attempt) await options.files.write("session.json", session);
    }
  });
}
