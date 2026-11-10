"use client";
import { useEffect, useState } from "react";
import type { EvaluationScope } from "@/lib/careos/evaluation-access";
import { Button } from "../ui/button";

export type OwnerCommand = { target: string; pnpm: string; directory: string };
type Pairing = {
  requestId: string;
  scopes: EvaluationScope[];
  expiresAt: string;
  approved: boolean;
};
const quote = (s: string) =>
  /^[a-zA-Z0-9_./:@,-]+$/.test(s) ? s : "'" + s.replaceAll("'", "'\\''") + "'";

export function OwnerConnection({
  command,
  onConnected,
}: {
  command: OwnerCommand;
  onConnected: () => Promise<void>;
}) {
  const [scopes, setScopes] = useState<EvaluationScope[]>([
    "customer",
    "studio",
  ]);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/ai/owner-access", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          if (!controller.signal.aborted) setPairing(data.pairing);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const remote = pairing
    ? `${quote(command.pnpm)} --dir ${quote(command.directory)} exec tsx scripts/owner-access.ts approve ${pairing.requestId} --scopes ${pairing.scopes.join(",")}`
    : "";
  const sshCommand = `ssh -t ${quote(command.target)} ${quote(remote)}`;
  async function act(action: "request" | "complete") {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/ai/owner-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "request"
            ? { action, scopes }
            : { action, requestId: pairing?.requestId },
        ),
      });
      if (r.status === 202)
        setMessage(
          "Waiting for owner approval. Run the SSH command below, then finish the connection here.",
        );
      else if (!r.ok)
        setMessage(
          r.status === 429
            ? "Too many connection requests. Wait a minute before trying again. Access hasn’t been granted."
            : "This browser connection is missing, expired or unavailable. Check access before starting a new request.",
        );
      else if (action === "request") setPairing((await r.json()).pairing);
      else {
        setPairing(null);
        await onConnected();
      }
    } catch {
      setMessage(
        "We couldn’t check the connection. Use Check access before starting another request. No AI question was sent; saved purchases, documents and Insights are still available.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Owner browser connection"
      className="space-y-4 rounded-xl border p-4"
    >
      <h2 className="font-semibold">Connect this browser as the owner</h2>
      <p>
        Approve this browser through your owner SSH account—no private token to
        copy. Opening the site alone doesn’t verify you as the owner.
      </p>
      {!pairing ? (
        <>
          <fieldset disabled={busy} className="space-y-2">
            <legend>
              Choose what this browser can use during the approved window
            </legend>
            {(["customer", "studio"] as const).map((scope) => (
              <label key={scope} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={(e) =>
                    setScopes((current) =>
                      e.target.checked
                        ? [...current, scope]
                        : current.filter((s) => s !== scope),
                    )
                  }
                />
                {scope === "customer" ? "North Star chat" : "AG Studio"}
              </label>
            ))}
          </fieldset>
          <Button
            disabled={busy || !scopes.length}
            onClick={() => void act("request")}
          >
            Request selected access via SSH
          </Button>
        </>
      ) : (
        <>
          <p>
            Requested:{" "}
            <strong>
              {pairing.scopes
                .map((s) =>
                  s === "customer" ? "North Star chat" : "AG Studio",
                )
                .join(" + ")}
            </strong>
            . This connection request expires{" "}
            <time dateTime={pairing.expiresAt}>{pairing.expiresAt}</time>.
          </p>
          <p>
            Run this command in your terminal. It approves only this browser
            request and doesn’t extend the testing window.
          </p>
          <pre
            className="overflow-x-auto whitespace-pre-wrap break-all rounded border bg-accent p-3 text-sm"
            aria-label="SSH owner approval command"
          >
            {sshCommand}
          </pre>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(sshCommand);
                setMessage(
                  "SSH approval command copied. Run it in your terminal, then finish the connection here.",
                );
              } catch {
                setMessage(
                  "Select and copy the command above. Run it in your terminal, then finish the connection here.",
                );
              }
            }}
          >
            Copy SSH approval command
          </Button>
          <p className="text-sm text-muted-foreground">
            Approve only the request displayed in your own browser here—not an
            unsolicited command or code from another person. The identifier is
            not a private token; the browser’s separate HttpOnly pairing secret
            is also required.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void act("complete")}>
              Finish owner connection
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setPairing(null)}
            >
              Start a new request
            </Button>
          </div>
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
