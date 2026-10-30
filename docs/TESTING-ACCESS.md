# CareOS testing access — request preparation, not activation

Open **https://greatbison.tail9e8802.ts.net:8444/ai-evaluation**, or choose **Testing access** inside CareOS.

1. Read the recorded window state/expiry. **Check access** is a read-only local status GET, not provider validation or refresh.
2. Choose a requested duration (one or four hours) and Customer chat / CareOS Insights-planning scopes.
3. **Prepare testing request**, then **Copy request for OpenCode**. This prepares/copies text in your browser only; nothing is submitted to a server or queue. Paste it into your existing owner OpenCode conversation for review.
4. The owner/agent must independently verify owner authority, fresh usage/unknowns/provider blocks, exact UTC expiry and secure HTTPS browser-pairing changes before approving/activating anything. A copied request is **not approval or owner identity proof**.

**Current limit:** HTTPS pairing/renewal/activation are still disabled. This UI does not restore live chat, display protected usage journals to arbitrary tailnet visitors, approve itself, or implement automatic one-click renewal. Used/limit/remaining/unknown counts must be checked privately on GreatBison before approval. A remembered browser cannot extend testing/spending authority.

## “Refresh the token” means two different things

- **Testing permission expired:** OAuth refresh does not fix this. A separately approved bounded testing window and appropriate HTTPS owner/browser authorization are needed. The existing localhost grant is not valid on HTTPS.
- **Provider access token expired:** the existing subscription adapter supports serialized server-side refresh during authorized use. This page neither calls the provider nor refreshes/reconnects credentials. A lost/uncertain refresh remains blocked for owner investigation; no automatic second refresh or sign-in is attempted here. Do not independently refresh/revoke the copied Mac provider session; GreatBison owns that refresh chain.
- Never paste an OpenAI API key, ChatGPT access/refresh token or private scope token into this UI or OpenCode chat. If real provider sign-in becomes necessary, use the separately reviewed official sign-in flow with exact owner authorization, not manual token editing.

The [official accounts/session guidance](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions) describes standard OAuth refresh near expiry, storing replacement tokens and serializing refreshes to avoid rotation races. It does not renew Pal Care's separate testing window. This documentation review makes no provider request or credential change.

## Verification and boundaries

This is a customer usability slice for capability C, not model acceptance or a new owner-login system. Uses the existing status endpoint and trusted owner OpenCode channel, no dependency/database/API-write/permission expansion. Request preparation/copy is browser memory/clipboard only, discarded on navigation/reload or selection changes. Refresh errors replace stale status with unavailable. No counters/deadlines/provider registrations, unknown attempts, financial evidence or credentials change. No new HTTP renewal/approval route, no cookie issuance and no model/paid/financial call.

New unit checks cover bounded proposals, scope injection/duplicate rejection, no executable command/credential payload, status validation and truthful rendered states. Actual HTTPS UI verification checks chat link, expiry/status, read-only refresh, prepare/copy, scope/duration changes, zero-scope rejection, GET-outage recovery, accessibility and zero mutation/cookie/model behavior on desktop/mobile. Actual results are recorded in STATUS/handoff after execution, not inferred from this plan.

The earlier proposal of a complete on-site owner session panel is **not fully implemented**: secure owner recognition, authenticated HTTPS pairing, activation, private live allowance display and renewed-session acceptance remain separate work/approval. Provider auth is not validated by local metadata or a green page. GitHub Actions, human/real-Mac feedback and actual live-model testing are separate.
