import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { createLocalJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import {
  PilotError,
  PilotFiles,
  type Registration,
  registrationSchema,
} from "./files";

export const ISSUER = "https://auth.openai.com";
export const RESOURCE = "https://api.openai.com/v1";
export const AUTHORIZE = `${ISSUER}/api/accounts/authorize`;
export const TOKEN = `${ISSUER}/api/accounts/oauth/token`;
export const REVOKE = `${ISSUER}/api/accounts/oauth/revoke`;
export const JWKS = `${ISSUER}/.well-known/jwks.json`;
export const SCOPES =
  "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
export type Transport = typeof fetch;

// Shared local/VM authorization; no redirects, raw-body diagnostics or credential URLs.
export async function smallJson(
  url: string,
  init: RequestInit = {},
  transport: Transport = fetch,
) {
  const response = await transport(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const reader = response.body?.getReader();
  if (!reader) throw new PilotError("pilot_empty_http_response");
  const chunks: Uint8Array[] = [];
  // Subscription catalogs include rich metadata and can exceed OAuth payloads.
  // Only this exact read-only endpoint gets 2 MiB; token/JWKS bounds stay 256 KiB.
  const maxBytes = url === `${RESOURCE}/models` ? 2097152 : 262144;
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes)
        throw new PilotError("pilot_http_response_too_large");
      chunks.push(value);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new PilotError(`pilot_http_${response.status}_invalid_json`);
    }
    if (!response.ok) {
      const error =
        raw && typeof raw === "object" && "error" in raw ? raw.error : null;
      const known = [
        "invalid_grant",
        "invalid_client",
        "invalid_refresh_token",
        "token_expired",
        "refresh_token_expired",
        "refresh_token_invalidated",
        "refresh_token_reused",
      ];
      throw new PilotError(
        typeof error === "string" && known.includes(error)
          ? `pilot_oauth_${error}`
          : `pilot_http_${response.status}`,
      );
    }
    return raw;
  } finally {
    await reader.cancel();
  }
}
export function authorizeRequest(
  hostId: string,
  redirectUri: string,
  clientId?: string,
) {
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const url = new URL(AUTHORIZE);
  url.search = new URLSearchParams({
    client_id: clientId ?? "dynamic_agent_client",
    ...(!clientId ? { agent_name_hint: "Pal Care — CareOS" } : {}),
    ext_agent_host_id: hostId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    resource: RESOURCE,
    state,
    nonce,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  }).toString();
  // No id_token_hint/login_hint in printed URLs. Returning users select their account.
  return { url: url.toString(), state, nonce, verifier, redirectUri, clientId };
}
export type PendingAuth = ReturnType<typeof authorizeRequest>;
const same = (a: string, b: string) => {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
export function callbackResult(url: URL, pending: PendingAuth) {
  for (const key of ["state", "code", "client_id", "error"])
    if (url.searchParams.getAll(key).length > 1)
      throw new PilotError("pilot_invalid_callback");
  if (!same(url.searchParams.get("state") ?? "", pending.state))
    throw new PilotError("pilot_state_mismatch");
  if (url.searchParams.has("error"))
    throw new PilotError("pilot_authorization_declined");
  const code = url.searchParams.get("code");
  const supplied = url.searchParams.get("client_id");
  const clientId = supplied ?? pending.clientId;
  if (
    !code ||
    code.length > 4096 ||
    !clientId ||
    clientId.length > 256 ||
    clientId === "dynamic_agent_client" ||
    (pending.clientId && clientId !== pending.clientId)
  )
    throw new PilotError("pilot_registration_mismatch");
  return { code, clientId };
}
export async function verifyIdentity(
  idToken: string,
  clientId: string,
  nonce: string,
  transport: Transport = fetch,
) {
  const keys = await smallJson(JWKS, {}, transport);
  const jwks = z
    .object({ keys: z.array(z.record(z.string(), z.unknown())).min(1).max(32) })
    .parse(keys);
  const { payload } = await jwtVerify(idToken, createLocalJWKSet(jwks), {
    issuer: ISSUER,
    audience: clientId,
    algorithms: ["RS256"],
    requiredClaims: ["exp", "iat", "sub", "nonce"],
  });
  if (
    typeof payload.sub !== "string" ||
    !payload.sub.length ||
    payload.sub.length > 256 ||
    typeof payload.nonce !== "string" ||
    !same(payload.nonce, nonce) ||
    (payload.azp !== undefined && payload.azp !== clientId)
  )
    throw new PilotError("pilot_identity_mismatch");
  return payload.sub;
}
const tokenResponse = z.object({
  access_token: z.string().min(1).max(32768),
  refresh_token: z.string().min(1).max(32768),
  id_token: z.string().min(1).max(32768).optional(),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().min(1).max(3600),
  scope: z.string().max(4096),
});
function tokensFrom(raw: unknown, nonce: string, retainedIdToken?: string) {
  const t = tokenResponse.parse(raw);
  const idToken = t.id_token ?? retainedIdToken;
  const scopes = t.scope.split(/\s+/).filter(Boolean);
  if (
    !idToken ||
    !["openid", "resource.invoke", "chatgpt.tokens.use.direct"].every((s) =>
      scopes.includes(s),
    )
  )
    throw new PilotError("pilot_plan_permission_missing");
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    idToken,
    nonce,
    scopes,
    savedAt: Date.now(),
    expiresAt: Date.now() + t.expires_in * 1000,
  };
}
export async function exchange(
  files: PilotFiles,
  pending: PendingAuth,
  result: { code: string; clientId: string },
  transport: Transport = fetch,
) {
  const old = await files.registration();
  // Retain the newly issued registration even if code exchange fails. Never mix clients.
  if (old && old.clientId !== result.clientId)
    throw new PilotError("pilot_registration_mismatch");
  const registration: Registration = old ?? {
    format: "palcare-chatgpt-pilot-v1",
    clientId: result.clientId,
  };
  await files.write("registration.json", registration);
  const raw = await smallJson(
    TOKEN,
    {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: result.clientId,
        code: result.code,
        code_verifier: pending.verifier,
        redirect_uri: pending.redirectUri,
        resource: RESOURCE,
      }),
    },
    transport,
  );
  const tokens = tokensFrom(raw, pending.nonce);
  const subject = await verifyIdentity(
    tokens.idToken,
    result.clientId,
    pending.nonce,
    transport,
  );
  if (registration.subject && subject !== registration.subject)
    throw new PilotError("pilot_identity_mismatch");
  await files.write("registration.json", {
    ...registration,
    subject,
    tokens,
    refreshPending: false,
  });
}
// This listener is used on the Mac, never on a public or Tailscale interface.
export async function signIn(
  files: PilotFiles,
  openBrowser: (url: string) => void,
  transport: Transport = fetch,
) {
  const hostId = await files.hostId();
  const registration = await files.registration();
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new PilotError("pilot_callback_listener_failed");
  const host = `127.0.0.1:${address.port}`;
  const pending = authorizeRequest(
    hostId,
    `http://${host}/auth/callback`,
    registration?.clientId,
  );
  let handling = false;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new PilotError("pilot_signin_timed_out")),
        300000,
      );
      const finish = (error?: unknown) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      server.on("request", (req: IncomingMessage, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Referrer-Policy", "no-referrer");
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'none'; frame-ancestors 'none'",
        );
        if (
          req.method !== "GET" ||
          req.headers.host !== host ||
          !req.url ||
          req.url.length > 8192
        ) {
          res.writeHead(400).end("Invalid callback");
          return;
        }
        const url = new URL(req.url, `http://${host}`);
        if (
          url.origin !== `http://${host}` ||
          url.pathname !== "/auth/callback" ||
          handling
        ) {
          res.writeHead(404).end();
          return;
        }
        let result;
        try {
          result = callbackResult(url, pending);
        } catch (error) {
          res
            .writeHead(400)
            .end("Sign-in was not completed. Return to Terminal.");
          if (
            !(error instanceof PilotError) ||
            error.code !== "pilot_state_mismatch"
          )
            finish(error);
          return;
        }
        handling = true;
        void exchange(files, pending, result, transport).then(
          () => {
            res
              .writeHead(200, { "Content-Type": "text/plain; charset=utf-8" })
              .end(
                "CareOS connected. No inference or credential transfer occurred. Return to Terminal and review ChatGPT Settings > Usage.",
              );
            finish();
          },
          (error) => {
            res
              .writeHead(400)
              .end("CareOS sign-in failed. Return to Terminal.");
            finish(error);
          },
        );
      });
      try {
        openBrowser(pending.url);
      } catch (error) {
        finish(error);
      }
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
// Caller holds PilotFiles.locked for all refresh/import/run operations.
export async function accessToken(
  files: PilotFiles,
  transport: Transport = fetch,
) {
  const r = await files.registration();
  if (!r?.tokens || !r.subject) throw new PilotError("pilot_signin_required");
  if (
    !r.tokens.scopes.includes("chatgpt.tokens.use.direct") ||
    !r.tokens.scopes.includes("resource.invoke")
  )
    throw new PilotError("pilot_plan_permission_missing");
  if (r.refreshPending)
    throw new PilotError("pilot_refresh_unknown_reauthorize");
  if (r.tokens.expiresAt > Date.now() + 60000) return r.tokens.accessToken;
  // A lost refresh response may have rotated the token. Do not try it twice.
  await files.write("registration.json", { ...r, refreshPending: true });
  let raw;
  try {
    raw = await smallJson(
      TOKEN,
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: r.clientId,
          refresh_token: r.tokens.refreshToken,
          resource: RESOURCE,
        }),
      },
      transport,
    );
  } catch (error) {
    if (
      error instanceof PilotError &&
      error.code.startsWith("pilot_oauth_") &&
      error.code !== "pilot_oauth_invalid_client"
    )
      await files.write("registration.json", {
        format: r.format,
        clientId: r.clientId,
        subject: r.subject,
      });
    throw error;
  }
  const tokens = tokensFrom(raw, r.tokens.nonce, r.tokens.idToken);
  // Refresh ID tokens need not carry the original nonce; a rotated ID token is
  // not used to replace the original, nonce-validated account identity.
  tokens.idToken = r.tokens.idToken;
  await files.write("registration.json", {
    ...r,
    tokens,
    refreshPending: false,
  });
  return tokens.accessToken;
}
export async function importRegistration(
  files: PilotFiles,
  transport: Transport = fetch,
) {
  await files.hostId(); // VM identity is separate and is NEVER imported from the Mac.
  const incoming = registrationSchema.parse(await files.read("incoming.json"));
  const existing = await files.registration();
  if (
    !incoming.tokens ||
    !incoming.subject ||
    incoming.refreshPending ||
    (existing &&
      (existing.clientId !== incoming.clientId ||
        (existing.subject && existing.subject !== incoming.subject)))
  )
    throw new PilotError("pilot_import_mismatch");
  const subject = await verifyIdentity(
    incoming.tokens.idToken,
    incoming.clientId,
    incoming.tokens.nonce,
    transport,
  );
  if (subject !== incoming.subject)
    throw new PilotError("pilot_identity_mismatch");
  if (existing?.tokens)
    throw new PilotError("pilot_already_imported_do_not_overwrite");
  await files.write("registration.json", incoming);
  await files.removeIncoming();
}
export async function signOut(files: PilotFiles, transport: Transport = fetch) {
  const r = await files.registration();
  if (!r?.tokens) return true;
  let revoked = false;
  try {
    const result = await transport(REVOKE, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      body: new URLSearchParams({
        token: r.tokens.refreshToken,
        token_type_hint: "refresh_token",
        client_id: r.clientId,
      }),
    });
    revoked = result.status === 200;
    await result.body?.cancel();
  } catch {
    // Caller must explain that remote revocation was not confirmed.
  } finally {
    await files.write("registration.json", {
      format: r.format,
      clientId: r.clientId,
      subject: r.subject,
    });
  }
  return revoked;
}
