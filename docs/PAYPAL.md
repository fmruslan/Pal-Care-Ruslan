# Stage 2 — PayPal Sandbox setup and verification

**Stage 2's Definition of Done is not yet satisfied.** Operational tests confirmed Sandbox credentials authenticate and an actual order was created/retrieved. Buyer approval encountered a hosted PayPal rejection; capture and automatic Twin creation have not been verified end to end. The original local checkout subsequently expired. The UI redesign does not fix either approval or expiry behavior. Nothing silently substitutes mock payments.

## Configure securely

1. Sign in to the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/). Create/select a **Sandbox REST application** associated with your sandbox business merchant.
2. Obtain its **Sandbox Client ID** and **Secret**. Obtain the **13-character merchant ID** for that sandbox business account (not its email, app ID, or buyer ID).
3. Create/use a separate **Sandbox personal buyer** with sufficient fictional funds. Enter buyer credentials only on PayPal's sandbox site; never put buyer passwords in Pal Care's files, submission repository or logs. Never use your real PayPal account/card in this flow.
4. Configure these values in git-ignored `.env.local`, or Render's environment settings:

```dotenv
DEMO_DATA_SOURCE=database
PAYPAL_CHECKOUT_ENABLED=true
PAYPAL_ENVIRONMENT=sandbox
APP_ORIGIN=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_MERCHANT_ID=
```

Blank values above are intentional, **not credentials**. Fill them privately. Keep the existing `DATABASE_URL`; optionally use a dedicated `CHECKOUT_DATABASE_URL` credential for the write service **pointing to the same database**, not a second database. No `NEXT_PUBLIC_` PayPal variables are used. Client ID, secret and OAuth tokens never reach the browser.

`APP_ORIGIN` is the exact canonical origin without a trailing slash/path: local testing can use `http://localhost:3000` or `http://127.0.0.1:3000`; deployed testing should use your Render HTTPS origin. Tailscale/other plain-HTTP hostnames are not accepted. Use an SSH tunnel and localhost origin when working from the Mac, or deploy on HTTPS. Do not derive callbacks or authorize mutations from a request's untrusted Host header. Restart the application after configuration changes.

5. Apply migrations and seed with `pnpm db:migrate` and `pnpm db:seed`.
6. Render's Blueprint deliberately leaves checkout **disabled**. After deployment/configuration, explicitly enable it in Render. Review Blueprint re-sync behavior so a later sync does not unexpectedly re-disable checkout. Keep public database access blocked and use least-privilege application roles before expanding beyond this demo.

## Actual end-to-end verification checklist

1. Open `/shop` in the app browser. It must say **PayPal Sandbox only**, with enabled purchase buttons. Both dashboards remain freely browsable.
2. Choose a fictional product. Pal Care saves the trusted price/product/policy and request keys before creating the actual sandbox order.
3. Continue to PayPal Sandbox, approve using the fictional buyer, and return in the **same browser**. Browser checkout cookies are not portable between Postman, browsers or hosts.
4. On return, the client submits a same-origin capture POST. Pal Care retrieves and validates the order, requests capture once, retrieves order/capture details, and creates the Twin atomically only if both completed evidence checks pass.
5. Confirm the new Twin says **Verified PayPal Sandbox**, shows provider order/capture references, and appears in `/dashboard`, `/vault`, documents and merchant counts. Existing sample Twins must still say **Sample**.
6. In the operator terminal, use the **local checkout UUID** from `/checkout/:uuid`, not the provider order ID:

```bash
pnpm paypal:verify LOCAL_CHECKOUT_UUID
```

This command performs **read-only** provider/DB verification; it never creates or captures payments. A successful result requires current Orders v2 and Payments v2 responses plus the saved Twin/receipt. It prints selected evidence only, not credentials or payer data. Save the run evidence privately; do not mark Stage 2 complete solely from unit/CI results.

7. Repeat the capture/status action for the same checkout: it must return the same Twin and no second charge. Verify the provider operation in PayPal's Sandbox activity/API logs.
8. Exercise buyer cancellation, an unapproved return, provider failure/negative testing, and an interrupted response. None may create a completed Twin without authoritative evidence. Provider declines and actual sandbox negative tests remain unverified until credentials are available.

## Pending and failed checkouts

The UI separates order creation, buyer approval, pending capture, failed/declined, cancelled, review-required and completed states. Return query parameters are never payment evidence. Creation retries reuse the saved request UUID/body within two hours. Unknown capture outcomes **never blindly resubmit capture**: the same browser's “Check / complete” action retrieves provider state and reconciles the original attempt.

A pending capture that stays unconfirmed, expired creation, lost browser cookie, or verification mismatch needs operator investigation. Never reset an attempted-capture marker, fabricate a completed state or start another payment to hide uncertainty. A manual cancellation only stops an unattempted local checkout; it does not reverse a PayPal capture or imply a refund.

## Documents and privacy

Twins snapshot product/merchant information, purchase date, exact integer price, policy version and provider references. Pal Care generates a sandbox receipt after verification. The demo policy and any available original sample care card are attached as **sample documents**. No manufacturer manual or warranty has been supplied; those are not invented. All displayed product/customer records are fictional and public; no raw payer profile or complete provider response is stored.

## Official references and Postman

- [PayPal Orders v2](https://developer.paypal.com/api/orders/v2) and [Payments v2](https://developer.paypal.com/api/payments/v2).
- [Official server SDK](https://github.com/paypal/PayPal-TypeScript-Server-SDK/tree/2.5.0) and [Next.js guide](https://developer.paypal.com/guides/nextjs-checkout).
- [PayPal idempotency](https://developer.paypal.com/api/rest/reference/idempotency): reuse each request ID for the same operation/payload, not a fresh ID on retries.
- [Official Postman workspace](https://www.postman.com/paypal). Its [official GitHub backup](https://github.com/paypal/postman-collections/blob/main/Collections/PayPal_Checkout_Flows.json) was reviewed for PayPal create/approval/capture shapes. Fork current official collections in Postman and keep secrets in a private local environment/vault; never export populated secrets.
- `postman/PalCare-Sandbox.postman_collection.json` covers Pal Care's session-bound routes. Browser approval and Postman use different cookie jars: if creating in Postman, return to the same Postman cookie jar for capture after manually approving the supplied URL. Prefer the app browser for the full judging flow.

## Webhooks

**Not implemented or verified in Stage 2.** Completion currently relies on direct authenticated retrieval. There is no unverified webhook endpoint. Public HTTPS, a registered PayPal webhook ID, signature verification and actual delivery/replay testing are required before claiming webhook support. No webhook ID or simulated webhook can substitute for actual capture evidence.
