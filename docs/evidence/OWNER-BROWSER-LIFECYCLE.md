# Private HTTPS owner-browser lifecycle investigation

## Implemented

Customer outcome / gate C–D: one understandable, durable browser-verification flow so CareOS can be used without repeated approval attempts. This slice reuses standing owner authentication; it adds no model, payment, database, public-hosting or quota authority.

The owner's personal Chrome failure is **not yet conclusively attributed**. Its screenshot establishes that CareOS received an unrecognized-browser state, not whether the cookie was missing, rejected or expired. Remote tools cannot inspect that profile's storage/settings/extensions. Do not call this resolved from an automated browser pass.

Confirmed application defects:

1. Pending request identity existed only in component state. Reload/navigation discarded its display, presenting another “Remember” action despite a live pending cookie. Repeating pair could overwrite that cookie with a new request while the host approved the old ID.
2. Finish displayed success based on its POST, independently of the subsequent GET's authentication result.
3. Every session-validation failure became the same `remembered:false`; mutation failures discarded the safe server error code. The owner could not distinguish waiting for approval, a missing cookie, a rejected proof or an origin failure.

Corrections:

- GET returns a bounded `browserAccess` classification and, **only with the matching pending cookie and browser binding**, the existing request ID/deadline. No secret or token hash is returned. Reload recovers that same request; explicit repeat-pair reuses pending/valid proof without resetting its expiry or adding a grant.
- AI Access polls read-only status while a known request awaits host approval, and refreshes on focus/visibility. Approval exposes the existing explicit Finish step; no automatic Finish/approval is added. CareOS refreshes on focus/visibility and same-document status updates.
- Pair/Finish perform GET read-back before success messaging. Missing/rejected cookies and safe server/network/origin errors get meaningful explanations. A successful GET proves the cookie was sent and accepted **at that moment**, not that a user's browser will retain it forever. HttpOnly cookie expiry/storage acceptance still requires browser-side observation.
- Public diagnostics distinguish missing-cookie, cookie-rejected, pending-approval, request-expired, session-expired, revoked, finish-needed and remembered. No-cookie responses cannot distinguish never-issued from deleted or naturally expired cookies. Fine-grained rejection reasons (including browser-agent mismatch) are logged only in the protected service journal, with a random diagnostic correlation ID; no headers, cookie values, token hashes, credential contents or User-Agent strings are logged.
- Exact HTTPS Origin/Host, `__Host-`/Secure/HttpOnly/Strict/Path=/, host-only scope, five-minute initial cookie, original 30-day absolute/seven-day idle bounds, revocation and standing-provider checks are preserved. Normal service restart reads the same protected on-disk state; it does not mint a signing secret or session.

## Verified

Initial running provenance: clean primary `main`, `9c1196f17064a11101f3922db6f4e4edf9df3ea9`, build `2Zl3iPEL1PVPFaU3F-2nT`, source hash `9532a5edb174bde1eb2c42c314af2cdd580ea489429ff9fad551dfec71b3a20c`. File owner is the service's owner account; state permissions are `0600`. Actual route success establishes service read/write access. No forwarded header is trusted instead of the configured exact Host/Origin.

Existing personal requests:

| Request | Created UTC | Approved UTC | Initial cookie would expire UTC |
| --- | --- | --- | --- |
| `5216af7c-5b7a-4202-9d2d-dd9c728b9149` | 02:34:49.299 | 02:35:45.787 | 02:39:49.299 |
| `8ad87d8f-d5ab-4545-8759-3760257655be` | 03:20:13.357 | 03:21:15.479 | 03:25:13.357 |

All dates above are 2026-10-30. Neither is revoked. Both predate completion-event instrumentation, so absent `finishedAt` **cannot prove that Finish was never attempted or succeeded**. The initial expiry is conditional: successful Finish would replace the temporary cookie with a persistent cookie. No historical access log captured enough information to identify the precise failing Chrome stage retrospectively.

**Real HTTPS before change:** at 03:59 UTC a separate controlled persistent Chromium profile visited the actual Tailscale origin, with no TLS bypass, rerouting or mocked responses. It reproduced pending-ID loss on reload. One exact CLI approval plus explicit Finish worked; GET returned HTTP 200, `remembered:true`, `browserCompletion:complete`. Browser storage showed Secure/HttpOnly/Strict/host-only/Path=/ on both cookies, initial expiry approximately five minutes and persistent expiry approximately 30 days. Reload stayed remembered. This rules out a general transport rejection on that path; it does not certify personal Chrome settings/profile.

**Isolated final-source checks:** lint, typecheck, format, production build, **794 unit tests**, **15 Chromium/Firefox/WebKit standing-access checks** and **20 conversation/recovery checks** pass. Regressions cover pending reload recovery, repeated pair preserving exact cookie/expiry, pending approval diagnostics, automatic read-only approval detection, cookie-loss read-back, invalid agent, missing/expired/revoked proof, original deadlines and unchanged accounting. Synthetic routed access tests are labeled isolated; they are not substituted for real HTTPS observations.

Actual post-deployment persistence/Send observations, exact deployed commit and CI are recorded in the final handoff and protected `/tmp/opencode/palcare-owner-lifecycle-20261030/` evidence. No live inference is required for this authentication diagnosis.

## Incomplete / blocked

The exact failure stage in the owner's Chrome remains blocked on one current-browser observation. Cookie/profile deletion, extensions, privacy settings, User-Agent changes and a missed five-minute Finish window are possibilities, not proven causes. Successful automated Chrome-compatible testing is not owner acceptance or real-device certification.

## Next — one read-only owner observation

In the **same Chrome profile/tab that fails**, open `/ai-evaluation`, click **Check status**, and report just the **Browser verification diagnostic** text and diagnostic ID. Do **not** click Remember or create a new request yet. This reads existing state; it consumes no AI request or authorization. Do not share cookie values, request headers, a HAR file or credential contents.

If deeper Chrome inspection is needed later: DevTools → Network → select the `/api/ai/owner` GET and inspect only status plus safe JSON `browserAccess`, `remembered`, `browserCompletion`, `diagnosticId`; Application → Cookies can show whether `__Host-palcare-owner` exists and its expiry/security flags without copying its Value. A missing proof cannot safely be reconstructed from an old public request ID. Only if actual evidence establishes that it is gone will a new explicitly approved pairing be necessary.
