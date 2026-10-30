"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type {
  EvaluationAccessStatus,
  EvaluationScope,
} from "@/lib/careos/evaluation-access";
import {
  testingAccessRequest,
  testingAccessStatusSchema,
} from "@/lib/careos/testing-access-request";
import { Button } from "../ui/button";

export function TestingAccess({
  initialAccess,
}: {
  initialAccess: EvaluationAccessStatus;
}) {
  const [access, setAccess] = useState<EvaluationAccessStatus | null>(
    initialAccess,
  );
  const [hours, setHours] = useState<1 | 4>(4);
  const [scopes, setScopes] = useState<EvaluationScope[]>([
    "customer",
    "studio",
  ]);
  const [request, setRequest] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const checking = useRef(false);
  async function checkAccess() {
    if (checking.current) return;
    checking.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/ai/evaluation", {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error();
      setAccess(testingAccessStatusSchema.parse(await response.json()));
      setMessage(
        "Access checked. No token refresh, renewal or model call was performed.",
      );
    } catch {
      setAccess(null);
      setMessage(
        "Status unavailable. Check your Tailscale connection and try again. Access has not been granted.",
      );
    } finally {
      checking.current = false;
      setBusy(false);
    }
  }
  function changed() {
    setRequest("");
    setMessage("");
  }
  return (
    <section aria-labelledby="testing-access-title" className="space-y-5">
      <h2 id="testing-access-title" className="text-xl font-semibold">
        Testing access
      </h2>
      <div className="rounded-xl border bg-card p-4">
        <p className="font-semibold">
          {access?.window === "expired"
            ? "Testing session expired"
            : access?.window === "active"
              ? "Testing window active · browser permission still required"
              : "Testing access unavailable"}
        </p>
        {access?.expiresAt && (
          <p className="mt-2 break-words text-sm">
            Recorded window ends:{" "}
            <time dateTime={access.expiresAt}>{access.expiresAt}</time> (UTC).
          </p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          Saved purchases, documents and native Insights remain available.
          Reopening the site does not renew AI access.
        </p>
        <Button
          variant="outline"
          className="mt-3"
          disabled={busy}
          onClick={() => void checkAccess()}
        >
          Check access
        </Button>
      </div>
      <div className="space-y-2 text-sm leading-6">
        <h3 className="font-semibold">Do I need to refresh a token?</h3>
        <p>
          <strong>Not for an expired testing window.</strong> Pal Care testing
          permission and your provider sign-in are different. Refreshing an
          OAuth token cannot renew testing permission.
        </p>
        <p>
          The existing server adapter supports provider-token refresh during
          authorized use. This page neither checks provider validity nor
          refreshes/reconnects it. If sign-in is genuinely required, the owner
          must use the approved provider sign-in flow separately. Never paste an
          OpenAI key, ChatGPT token or refresh token here or into chat.
        </p>
      </div>
      <form
        className="space-y-4 rounded-xl border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!scopes.length) return;
          setRequest(testingAccessRequest({ hours, scopes }));
          setMessage(
            "Request prepared in this page only—not sent or approved. Copy it to your existing owner OpenCode conversation for review.",
          );
        }}
      >
        <h3 className="font-semibold">Request testing access</h3>
        <p className="text-sm text-muted-foreground">
          This site cannot establish owner identity from tailnet access alone.
          Approval stays in your existing owner OpenCode conversation; no new
          login system or SSH tunnel is needed. HTTPS browser pairing and
          activation are still separate, currently disabled steps.
        </p>
        <label className="block text-sm">
          Requested duration
          <select
            className="mt-2 block min-h-11 rounded-xl border border-input bg-card px-3"
            value={hours}
            onChange={(event) => {
              changed();
              setHours(Number(event.target.value) as 1 | 4);
            }}
          >
            <option value={1}>1 hour</option>
            <option value={4}>4 hours</option>
          </select>
        </label>
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold">Requested scopes</legend>
          {(["customer", "studio"] as const).map((scope) => (
            <label
              key={scope}
              className="flex min-h-11 items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                checked={scopes.includes(scope)}
                onChange={(event) => {
                  changed();
                  setScopes((current) =>
                    event.target.checked
                      ? [...current, scope]
                      : current.filter((s) => s !== scope),
                  );
                }}
              />
              {scope === "customer"
                ? "Customer CareOS chat"
                : "CareOS planning for my Insights"}
            </label>
          ))}
        </fieldset>
        <p className="text-sm">
          Allowance: existing remaining requests only, after fresh owner
          verification. Counts and exact expiry must be reviewed before
          activation. No quota reset or automatic renewal.
        </p>
        <Button disabled={!scopes.length}>Prepare testing request</Button>
      </form>
      {request && (
        <div className="space-y-3">
          <label className="block text-sm font-semibold">
            Testing access request (not a token)
            <textarea
              readOnly
              rows={12}
              value={request}
              className="mt-2 w-full rounded-xl border border-input bg-card p-3 text-sm leading-6"
            />
          </label>
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(request);
                setMessage(
                  "Request copied. Paste it into your owner OpenCode conversation. Nothing has been renewed or activated.",
                );
              } catch {
                setMessage(
                  "Clipboard unavailable. Select and copy the request text above. Nothing was sent or activated.",
                );
              }
            }}
          >
            Copy request for OpenCode
          </Button>
        </div>
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
      <nav
        aria-label="Back to saved records"
        className="flex flex-wrap gap-4 text-sm font-semibold text-primary"
      >
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center underline"
        >
          Back to Home
        </Link>
        <Link
          href="/insights"
          className="inline-flex min-h-11 items-center underline"
        >
          Open Insights
        </Link>
      </nav>
    </section>
  );
}
