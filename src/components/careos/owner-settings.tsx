"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "../ui/button";

const statusSchema = z.object({
  remembered: z.boolean(),
  policy: z.string(),
  revoked: z.boolean(),
  used: z.number(),
  remaining: z.number(),
  unknown: z.number(),
  liveEnabled: z.boolean(),
  provider: z.string(),
});
export function OwnerSettings() {
  const [status, setStatus] = useState<z.infer<typeof statusSchema> | null>(
    null,
  );
  const [id, setId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    const response = await fetch("/api/ai/owner", { cache: "no-store" });
    if (!response.ok) throw new Error("unavailable");
    setStatus(statusSchema.parse(await response.json()));
  }
  useEffect(() => {
    void fetch("/api/ai/owner", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        setStatus(statusSchema.parse(await response.json()));
      })
      .catch(() =>
        setMessage(
          "AI settings are temporarily unavailable. Your saved records remain available.",
        ),
      );
  }, []);
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
      if (!response.ok) throw new Error("denied");
      if (action === "pair")
        setId(z.object({ id: z.uuid() }).parse(await response.json()).id);
      else {
        setId("");
        setMessage(
          action === "finish"
            ? "Browser remembered. AI permission is unchanged."
            : action === "logout"
              ? "Signed out on this browser."
              : "AI permission revoked. Saved records remain available.",
        );
      }
      await refresh();
    } catch {
      setMessage(
        "Could not complete this change. Check your owner connection and try again; no AI request was sent.",
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
          <dd>{status?.remembered ? "Remembered" : "Not verified"}</dd>
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
      <p className="text-sm text-muted-foreground">
        Historical testing remains expired: 33/50 attempts, including two
        unknown outcomes. Its unused requests are not available here. One chat
        message may use two requests. Purchases, documents and native Insights
        do not need live AI.
      </p>
      <div className="flex flex-wrap gap-3">
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
