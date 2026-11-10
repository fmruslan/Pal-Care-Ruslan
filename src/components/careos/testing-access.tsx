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
        "Access checked. Nothing was renewed or reconnected, and no AI question was sent.",
      );
    } catch {
      setAccess(null);
      setMessage(
        "We couldn’t check access. Check your Tailscale connection and try again. Access hasn’t been granted; saved purchases, documents and Insights are still available.",
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
              ? "Testing window open · this browser still needs permission"
              : "Testing access unavailable"}
        </p>
        {access?.expiresAt && (
          <p className="mt-2 break-words text-sm">
            Recorded window ends:{" "}
            <time dateTime={access.expiresAt}>{access.expiresAt}</time> (UTC).
          </p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          Saved purchases, documents and Insights remain available. Reopening
          the site does not renew AI access.
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
        <h3 className="font-semibold">Will signing in again restore access?</h3>
        <p>
          <strong>Not if the testing window has expired.</strong> Signing in to
          the AI provider and having permission to use North are separate.
          Signing in again won’t extend an approved window.
        </p>
        <p>
          This page doesn’t check or reconnect the AI provider. If a new sign-in
          is needed, the owner must use the approved provider sign-in process
          separately. Never paste an OpenAI key, ChatGPT token or refresh token
          here or into chat.
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
          Reaching this private site doesn’t verify you as the owner. Review the
          request in your existing owner OpenCode conversation. This page only
          prepares text; browser connection and activation remain separate and
          are currently disabled here.
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
          <legend className="text-sm font-semibold">
            What would you like to use?
          </legend>
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
                ? "North Star chat"
                : "North Star help with my Insights"}
            </label>
          ))}
        </fieldset>
        <p className="text-sm">
          Only the existing remaining AI allowance can be used, after the owner
          checks access, usage and expiry. This request doesn’t add allowance,
          reset usage or renew access automatically.
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
          Back to Care
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
