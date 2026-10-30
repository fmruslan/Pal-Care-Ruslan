# CareOS Send / known-unsent recovery

## Implemented

The reported dashboard symptom was a client-state defect, not evidence of provider failure or exhausted quota. `unavailable` disabled Send/suggested actions for **any** pending question, including `status: not-sent`; the textarea used a different predicate and stayed editable. A pre-turn conversation bootstrap failure could leave that hint indefinitely, including after browser approval. The exact message “Your question wasn’t sent. Clear this conversation to start again.” came from this path. The original bootstrap's exact HTTP/transport failure is not recoverable from the generic UI message; it is not claimed proven to be a credential error.

The old actual HTTPS build `f5b0e72` and build provenance matched the primary checkout. At diagnosis the policy remained active at **2/300 used / 298 remaining**, with no provider block. Host approval existed for the owner request; that alone did not prove Chrome retained its cookie or completed persistence.

Changes:

- Known pre-turn failures and legacy null-conversation pending hints become **editable unsent drafts**, not outstanding provider work. Users can ask a new question or edit the old one without Clear/deleting saved history. The newest ten validated hints are tab-local, bounded and expire after 24 hours. They are never trusted authority or automatically submitted. Choosing an unsent draft does not overwrite a different current draft.
- A confirmed expired/missing conversation can bootstrap a new conversation only if there is **no uncertain request bound to the old ID**. Dispatched/unknown requests retain their exact identities and GET-only reconciliation; no automatic retry or budget refund is introduced.
- Submission keeps a draft when authorization/restoration rejects admission and retains any different draft typed while a request runs.
- On opening CareOS, before each explicit send and on window focus, owner mode reads the real current browser's `/api/ai/owner` response. Unverified, unavailable, exhausted and revoked states have specific wording and a direct AI-access/check route. Status reads do not refresh credentials, call models or grant permission. Normal server-managed access-token refresh remains compatible with Ready state.
- Send and AI suggestions share the same state gate. They are disabled while busy/uncertain, unauthorized or without active remaining permission; a known-unsent draft no longer blocks them. The server still checks every request independently.
- Browser state now distinguishes host approval from a recorded **Finish remembering browser** step. Legacy valid cookies can finish directly from AI access without another host approval. Finish requires the originating approved cookie, exact HTTPS Origin/Host and browser binding; it records completion once and sets cookie expiry to the **original** absolute session deadline, never extending it. There is no automatic migration/approval or policy change. A server marker is not a remote inspection of Chrome's cookie settings.

## Verified

**Before fix, actual private HTTPS:** a fresh disposable anonymous browser with the exact legacy `hello` hint reproduced editable text + disabled Send/suggestions. All browser mutations were blocked before dispatch; zero model calls. Evidence: `/tmp/opencode/palcare-composer-recovery-20261030/before.json` and `before.png`.

Isolated lint/typecheck/format/build, **792 units**, **20 conversation browsers**, **12 cross-engine standing-access browsers** and **10 injected-Sol/Insights/recovery/expiry** checks pass. The focused browsers cover legacy hello migration, explicit edit/new request identity, existing-history preservation, failed bootstrap recovery, expired conversation hints, uncertain GET-only recovery, current draft preservation, real isolated owner cookies/finish/revocation and enabled/disabled Send/suggestions. Finish records completion only once and never extends the original absolute deadline. Synthetic provider metadata/fixture answers are not new live provider proof. Actual post-refresh observations and final commit/synchronization are reported at handoff, after execution.

## Incomplete / blocked

The agent cannot inspect the owner's remote Chrome cookie. The owner chose **“I’ll test in Chrome”**, explicitly declining a new production acceptance-browser grant. No new real browser was approved by the agent for this slice, and no model request is needed to diagnose or verify UI state. Actual authenticated Chrome Send/response remains owner acceptance, not silently substituted by mocked HTTP or the earlier live-AI checkpoint.

The earlier exact `f5b0e72` CI [40995827440](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/40995827440) failed the same two database-mode mobile Insights screenshots, **538 database browsers passed**, later stages skipped. Reviewed failures retain the fixture-vs-database provenance text mismatch (1,800/1,946 pixels). No screenshot baseline/threshold is changed here; it is separate from chat recovery.

## Next

Refresh the existing HTTPS Chrome tab. Open CareOS: the panel now checks that browser's real status. If it is verified for the visit but completion was not recorded, AI access offers **Finish remembering browser** directly while that approved cookie is valid. If it is genuinely missing/expired, the page explains the existing secure pairing requirement; neither Tailscale nor host approval can recreate a missing secret automatically. With current authorization, edit the saved unsent question or type a new one and Send. Unknown outcomes must still be reconciled, not replayed.
