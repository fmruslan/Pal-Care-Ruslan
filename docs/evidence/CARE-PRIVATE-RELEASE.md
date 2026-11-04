# Care private release — 2026-11-04

## Implemented / deployed

The approved **Care / Purchases / Insights** application is deployed at **https://greatbison.tail9e8802.ts.net:8444/dashboard**. `/` opens Care. Dated purchases, documents, native Insights, one-field North and original authentication/accounting remain. Release commit **`b28e666c0eab083869a0097cd15d3580594e0320`**, build **`ujDtkNWNDgg7ZZAC68zxi`**, source SHA-256 **`b83b1de35e873308f3b868c6c1c42466142749c6e6c16428e1762360070ec8ef`**. Actual HTTPS/runtime checks passed at **20:19–20:22 UTC**; the initial persistence-off smoke also passed.

The exact approved SQL hash **`42b332cf5d6ce22483c28669115149ddf76014c809a1be0af17b055b1f3973a7`** was applied through the selected versioned **`drizzle/care`** lane, not root `db:migrate`. API 0016 remains unapplied. Three independent restricted Care logins were provisioned. The first reader connection correctly failed because the application DB denies CONNECT by default; provisioning resumed with the **same** credential and explicit CONNECT for only the three new logins. No existing login, membership, password or PUBLIC grant was changed.

Only the Care reader URL enters the web runtime; reporter/worker URLs remain in protected host files. The actual web process has no Care writer, migration/admin, paid-model API or PayPal-secret credential. Source-backed manual reporting remains host-private; no public writer or financial capability was introduced.

## Verified — exact-commit CI

[Run 41901418734](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/41901418734) passed all three mandatory jobs for **`b28e666`**:

| Job | Actual elapsed | Results |
| --- | --- | --- |
| Foundation — fixtures | 20m 26s | lint/format/types, **1,393 units**, **118 PostgreSQL tests**, build, failure/offline/deterministic checks, **930 browser/accessibility checks** |
| Foundation — database | 20m 59s | same baseline gates, **930 browser/accessibility checks**, **6 injected Guardian flows** |
| Native acceptance | 15m 41s | **118 PostgreSQL**, build, **33 access**, **178 Firefox/WebKit**, **14 injected Sol/actual-tool checks** |

Jobs began together at **19:54:16 UTC**, finishing by **20:15:15 UTC**. These timings are observations, not a claimed benchmark speedup. Full coverage stayed in the three existing parallel jobs; no retry/threshold/deadline relaxation or test removal was used to accelerate release. The earlier local **166/180 compatibility** failure, focused corrections and interrupted local rerun remain separately recorded in STATUS rather than relabeled as passes.

## Verified — actual application / checker / rollback

- Real HTTPS checks covered default Care, all three navigation destinations, five preserved purchases, provider-free kettle-receipt search/document contents, native Insights canvas, exact Care details, 390px reflow and actual readiness. The smoke dispatched **zero writes/external calls** and observed **zero application errors**. Browser emulation is not real-device testing.
- The host-installed hourly timer runs the pinned non-root/read-only/network-disabled container and private Unix DB bridge described in [the exact approval](../CARE-PERSISTENCE-APPROVAL.md). The real service exited successfully. One saved fictional Forma sample watch was paused before its first check; the checker skipped it. Resume allowed its first due check; an early repeat did not change the check timestamp. Post-success pause/resume/due preservation and expiry also passed dedicated-DB tests; no actual timestamp was rewritten to force an early repeat or simulate expiry.
- Actual watch: first successful catalog check **2026-11-04T20:19:20.051Z**, next due **2026-11-05T20:19:20.051Z**, fictional catalog observation **USD 129.00**, expiry **2026-12-04T20:18:12.252Z**. The hourly sweep is not hourly price polling or real-time market monitoring. This expiry precedes the judge-access-through-December-15 constraint; it is not automatically extended.
- Actual records contain **zero new return cases / zero manual case events / one watch**. No return/warranty facts were inserted just to populate cards. Fictional goods have no real shipping/warranty; price differences are not verified savings or refund eligibility.
- The original **`4773506`** rollback snapshot was restarted **after** the additive migration using its unchanged original restricted credentials; both readiness and actual HTTPS Home passed. Restoring the candidate then passed full HTTPS tracking-on smoke. Rollback disables new worker paths/restores application assets/configuration, never drops additive history or restores stale credentials/authorization/accounting.
- Final read-only preservation verified unchanged fingerprints for **25 static original tables**, including purchases/documents/payment/policy evidence; existing passwords/memberships and all original web settings matched. Conversation/request/rate/accounting tables legitimately advance for new authorized work and are not restored. Private artifacts stay outside Git under `/tmp/opencode/palcare-care/`.

## Verified — genuine North, partial only

One approved disposable browser made **four questions / four counted GPT-6.1 Sol-medium calls**, all completed with actual HTTP-200/token-usage evidence. Receipt → all five purchases/totals (**USD 307 Sample / USD 129 Verified Sandbox**) → Audio (**three purchases / USD 218 Sample / USD 129 Verified Sandbox**) → native chart passed. The actual SDK state was read back independently, validating chart/KPI types/mappings, selected chart, layout and exact scoped purchase-ID predicate; the accessible source summary showed the three Audio purchases. A success string alone was not the proof.

The remaining navigation/care portion stopped because the **acceptance script toggled History closed** before looking for an older result. No product or provider failure was established by that selector timeout; it is not a complete North-aftercare acceptance pass. The browser was revoked and remembered-access denial verified. Historical sessions/policy and every prior event were preserved. Final accounting: **263/300 reserved / 37 remaining / one historical unknown / zero new unknowns**. No retry campaign, replacement browser, reapproval, identity rotation, reset or paid fallback was used. The one-new-browser authorization is now consumed/revoked; additional agent-driven genuine aftercare checks need a new exact browser decision, not inference from remaining quota.

## Incomplete / blocked / next

**Incomplete:** remaining genuine Pi-care / new Care tool / enquiry continuity checks, owner hands-on and real-device review. The separate 200-case campaign, real merchant/carrier/warranty integrations, public judging/license coverage, financial/webhook acceptance and any expired original capability remain separate. The conservative submission cutoff is **November 12, 2026, 12:00 PM PST**; judge access through **December 15, 2026** does not renew credentials, the watch or licenses.

**Blocked:** no blocker to owner testing of the deployed site. Remaining agent-driven genuine aftercare acceptance cannot create another authorized browser under the consumed one-browser approval. The website remains running; no critical product regression was found to require application rollback.

**Next:** owner tests the live Care site using existing legitimate access; decide separately whether to authorize another bounded genuine-aftercare browser check. The release-evidence documentation follow-up changes no application source; its own exact-commit CI/build receipts are tracked separately. During that follow-up the verified **b28e666** application remains available on the same private route, with an integrity-checked same-build restart fallback at `/tmp/opencode/palcare-care/live-b28e666/`. No serving `.next` assets are rebuilt in place.
