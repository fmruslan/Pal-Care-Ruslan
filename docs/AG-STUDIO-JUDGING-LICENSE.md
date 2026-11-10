# Official AG Studio hackathon judging key

**Verified November 9, 2026; key not issued or configured.** No separate trial has been activated. Existing license gates/notices remain unchanged.

AG Grid's [November 6 official article](https://www.ag-grid.com/blog/build-a-payments-dashboard-without-building-a-dashboard/) explicitly states:

> Note that hackathon entries do not require a licence – for the judging period, we will take care of the licence key.

This is the preferred sponsor arrangement, superseding this pass's earlier trial proposal. The article does not specify a key request form, exact expiry, allowed hosts/versions or AI-module entitlement. It links to [AG Grid's official Discord](https://discord.gg/NtXRduFYp); its footer also offers the [contact form](https://www.ag-grid.com/about/) and [support portal](https://ag-grid.zendesk.com/). No authenticated Discord/support connection is available to this coding session; no request has been submitted on the owner's behalf.

## Owner action — send to the hackathon team

> Hello AG Grid team — I'm entering Pal Care in the PayPal AI Hackathon / Best Use of AG Grid. Your November 6 article says AG Grid will handle the judging-period license key. What is the official procedure to receive and configure it?
>
> Our app's accessibility-fix candidate pins ag-studio and ag-studio-react 3.1.0 (Charts 14.3.0 / AG-18794), with 3.0.0 retained as a rollback. We use native grid/chart/KPI widgets, original custom React/SVG widgets, and AgStudioAiModule with the Studio Agent Framework and a bounded custom runner. No standalone Enterprise Grid/Charts instances are embedded in our custom widgets.
>
> Please confirm the appropriate version-compatible key/setup, Agent Framework/AI-module entitlement, permitted private preview and independently hosted judge deployment/demo-video use, required hostname information, and exact expiry/time zone covering judging through December 15, 2026. Do we need any action before the November 12 noon Pacific submission cutoff? Please send the key privately, not in a public channel.

Provide the final judge hostname privately if requested; private Tailscale access is not independent judge hosting. Never send North/provider/database credentials or personal purchase documents.

## Setup after the sponsor responds

1. Record the sponsor's non-secret entitlement, approved hosts/version and actual expiry. Clarify any uncovered deployment/AI/judging scope before claiming it resolved. Do not infer activation from the article alone.
2. Use the version-matched official installation instructions. The **3.1.0** React public API exports `AgStudioProvider` with `licenseKey` and optional `modules`; it configures the application's `AgStudioLicenseManager`. A shared provider can cover Care and Insights, preserving existing `AgStudioAiModule` registration. Reconfirm the actually deployed version before configuring the key; do not create an unrelated second instance.
3. Keep the supplied key outside Git/logs/screenshots and pass it using the supported runtime configuration. Browser license validation may require the vendor key client-side; it must not be treated as an application authentication secret or bundled with provider credentials. Review the exact supported configuration once the key is issued.
4. Under the existing PR/release process, verify legitimate runtime validation on **Care and Insights**, retained native/agent functionality and expected watermark removal. Do not use CSS, patched validation or hidden notices. Existing application presentation gates are separate and remain conservative.
5. Record configured/verified status and expiry in STATUS and the release handoff. Independent judge deployment and authorized public North remain separate gates. A paid purchase or separate trial is not authorized by this procedure.
