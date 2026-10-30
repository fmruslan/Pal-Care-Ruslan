"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "../ui/button";
import {
  browserAccessSchema,
  browserAccessMessage,
  browserActionError,
} from "./browser-access-state";

const statusSchema = z.object({
  remembered: z.boolean(),
  browserCompletion: z.enum(["not-verified", "finish-needed", "complete"]),
  browserAccess: browserAccessSchema,
  diagnosticId: z.uuid(),
  pairing: z.object({ id: z.uuid(), expiresAt: z.number() }).nullable(),
  policy: z.string(),
  revoked: z.boolean(),
  used: z.number(),
  remaining: z.number(),
  unknown: z.number(),
  liveEnabled: z.boolean(),
  provider: z.string(),
  providerBlocked: z.boolean(),
  requestLimit: z.number(),
  concurrency: z.number(),
  requestsPerMinute: z.number(),
});
async function readOwnerStatus() {
  const response = await fetch("/api/ai/owner", { cache: "no-store" });
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      typeof value.error === "string" ? value.error : "unavailable",
    );
  return statusSchema.parse(value);
}
export function OwnerSettings() {
  const [status, setStatus] = useState<z.infer<typeof statusSchema> | null>(
    null,
  );
  const [id, setId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const acceptStatus = useCallback((next: z.infer<typeof statusSchema>) => {
    setStatus(next);
    setId(next.pairing?.id ?? "");
    window.dispatchEvent(new Event("palcare-owner-status"));
    return next;
  }, []);
  const refresh = useCallback(async () => {
    return acceptStatus(await readOwnerStatus());
  }, [acceptStatus]);
  useEffect(() => {
    void readOwnerStatus()
      .then(acceptStatus)
      .catch(() =>
        setMessage(
          "AI settings are temporarily unavailable. Your saved records remain available.",
        ),
      );
  }, [acceptStatus]);
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible")
        void refresh().catch(() =>
          setMessage(browserActionError("unavailable")),
        );
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    // Read-only, only while a known request is awaiting host approval.
    const timer =
      status?.browserAccess === "pending-approval"
        ? window.setInterval(check, 3000)
        : undefined;
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [status?.browserAccess, refresh]);
  async function act(action: "pair" | "finish" | "logout" | "revoke") {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/ai/owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const value = await response.json();
      if (!response.ok)
        throw new Error(
          typeof value.error === "string" ? value.error : "denied",
        );
      const next = await refresh();
      if (
        action === "finish" &&
        (!next.remembered || next.browserCompletion !== "complete")
      )
        throw new Error("cookie_readback_failed");
      if (action === "pair" && next.browserAccess === "missing-cookie")
        throw new Error("cookie_readback_failed");
      if (action !== "pair") {
        setId("");
        setMessage(
          action === "finish"
            ? "Browser remembered. AI permission is unchanged."
            : action === "logout"
              ? "Signed out on this browser."
              : "AI permission revoked. Saved records remain available.",
        );
      }
    } catch (error) {
      setMessage(
        browserActionError(
          error instanceof Error ? error.message : "unavailable",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5" aria-label="Owner AI settings">
      <p>
        Remember this private browser once. AI use has its own approved limit,
        separate from browser access. Payments and refunds remain disabled.
      </p>
      <dl className="grid gap-3 rounded-xl border p-4 text-sm">
        <div>
          <dt className="font-semibold">Browser access</dt>
          <dd>
            {status?.remembered
              ? status.browserCompletion === "complete"
                ? "Remembered"
                : "Verified for this visit — finish remembering below"
              : "Not verified"}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">AI access</dt>
          <dd>
            {!status
              ? "Checking"
              : status.revoked
                ? "Permission revoked"
                : !status.liveEnabled || status.policy === "disabled"
                  ? "Not enabled — awaiting separate owner approval"
                  : status.providerBlocked
                    ? "Provider access unavailable — connection review needed"
                    : status.remaining === 0
                      ? "Approved usage limit reached"
                      : "Approved; subject to provider availability"}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Provider connection</dt>
          <dd>{status?.provider ?? "Not checked"}</dd>
        </div>
        <div>
          <dt className="font-semibold">Standing usage</dt>
          <dd>
            {status
              ? `${status.used} used · ${status.remaining} approved requests remaining · ${status.unknown} unknown/reserved`
              : "Not checked"}
          </dd>
        </div>
      </dl>
      {status && (
        <div
          className="space-y-2 rounded-xl border p-3 text-sm"
          aria-label="Browser verification diagnostic"
        >
          <p>{browserAccessMessage[status.browserAccess]}</p>
          <p className="break-all text-xs text-muted-foreground">
            Diagnostic: {status.browserAccess} · {status.diagnosticId}
          </p>
          {status.pairing && (
            <p>
              Finish before{" "}
              {new Date(status.pairing.expiresAt).toLocaleTimeString()} in this
              browser. Reloading preserves this request.
            </p>
          )}
        </div>
      )}
      {!!status?.requestLimit && (
        <p className="text-sm text-muted-foreground">
          Approved total: {status.requestLimit} provider requests. Up to{" "}
          {status.concurrency} in flight and {status.requestsPerMinute} per
          minute. Retries count too; unknown outcomes are not retried or
          refunded.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Historical testing remains expired: 33/50 attempts, including two
        unknown outcomes. Its unused requests are not available here. One chat
        message may use two requests. Purchases, documents and native Insights
        do not need live AI.
      </p>
      <div className="flex flex-wrap gap-3">
        {status?.remembered &&
          status.browserCompletion === "finish-needed" &&
          !id && (
            <Button disabled={busy} onClick={() => void act("finish")}>
              Finish remembering browser
            </Button>
          )}
        {!status?.remembered && !id && (
          <Button disabled={busy || !status} onClick={() => void act("pair")}>
            Remember this browser
          </Button>
        )}
        {status?.remembered && (
          <>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void act("logout")}
            >
              Sign out
            </Button>
            <Button
              variant="outline"
              disabled={busy || status.revoked || status.policy === "disabled"}
              onClick={() => {
                if (
                  window.confirm(
                    "Revoke AI permission for every remembered browser? This does not remove saved purchases.",
                  )
                )
                  void act("revoke");
              }}
            >
              Revoke AI permission
            </Button>
          </>
        )}
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void refresh().catch(() =>
              setMessage("Connection unavailable. Please try again later."),
            )
          }
        >
          Check status
        </Button>
      </div>
      {id && (
        <div className="space-y-3 rounded-xl border p-4">
          <h2 className="font-semibold">One-time owner verification</h2>
          <p className="text-sm">
            Approve only this request, shown in your own browser, using your
            existing trusted server access. It expires in five minutes and does
            not enable AI.
          </p>
          <code className="block break-all text-sm">
            pnpm exec tsx scripts/standing-owner.ts approve-browser {id}
          </code>
          <Button disabled={busy} onClick={() => void act("finish")}>
            Finish remembering browser
          </Button>
        </div>
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
      <a
        href="https://chatgpt.com/settings/usage"
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 items-center text-sm text-primary underline"
      >
        Manage ChatGPT plan usage
      </a>
    </section>
  );
}
