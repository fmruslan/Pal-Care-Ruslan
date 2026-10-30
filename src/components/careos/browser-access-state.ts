import { z } from "zod";

export const browserAccessSchema = z.enum([
  "missing-cookie",
  "cookie-rejected",
  "pending-approval",
  "request-expired",
  "session-expired",
  "revoked",
  "finish-needed",
  "remembered",
]);
export type BrowserAccess = z.infer<typeof browserAccessSchema>;
export const browserAccessMessage: Record<BrowserAccess, string> = {
  "missing-cookie":
    "This browser did not send its verification cookie. It may have expired, been removed, or belong to another browser profile. Host approval alone cannot restore it.",
  "cookie-rejected":
    "This browser sent a cookie that could not be validated. Check that you are using the original browser profile; the protected server diagnostic can identify the rejection.",
  "pending-approval":
    "This browser’s verification request is waiting for host approval. Keep this request; do not create another one.",
  "request-expired":
    "The temporary verification request expired before approval. It cannot be completed.",
  "session-expired":
    "This browser session reached its absolute or inactivity expiry.",
  revoked: "This browser session was revoked. It cannot be reused.",
  "finish-needed":
    "Host approval is complete. Finish remembering this browser before its temporary cookie expires.",
  remembered: "This browser is remembered.",
};
export function browserActionError(code: string) {
  const messages: Record<string, string> = {
    careos_owner_pending_approval: browserAccessMessage["pending-approval"],
    careos_owner_missing_cookie: browserAccessMessage["missing-cookie"],
    careos_owner_cookie_rejected: browserAccessMessage["cookie-rejected"],
    careos_owner_request_expired: browserAccessMessage["request-expired"],
    careos_owner_session_expired: browserAccessMessage["session-expired"],
    careos_owner_revoked: browserAccessMessage.revoked,
    careos_owner_origin_rejected:
      "This request did not come from the configured private HTTPS address. Open Pal Care using its saved HTTPS bookmark.",
    careos_owner_pair_rate_limited:
      "Too many verification requests were created recently. Keep any existing request and check its status.",
    cookie_readback_failed:
      "Finish returned, but the next request did not confirm this browser. Check cookie storage in Chrome; no new approval or AI request was made.",
  };
  return (
    messages[code] ??
    "The server or connection could not complete this change. Check status before trying again; no AI request was sent."
  );
}
