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
          "Waiting for your SSH approval. Run the command below, then finish this connection.",
        );
      else if (!r.ok)
        setMessage(
          r.status === 429
            ? "Pairing requests are limited. Wait a minute before trying again; access has not been granted."
            : "Pairing is missing, expired or unavailable. Check the testing window, then start a new connection.",
        );
      else if (action === "request") setPairing((await r.json()).pairing);
      else {
        setPairing(null);
        await onConnected();
      }
    } catch {
      setMessage(
        "Connection unavailable. Reconnect the SSH tunnel and use Check access before starting another request. No model call was made.",
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
        No private token copying. Your SSH login authorizes a short-lived
        request for this browser only; localhost access alone is not owner
        authentication.
      </p>
      {!pairing ? (
        <>
          <fieldset disabled={busy} className="space-y-2">
            <legend>Allow these scopes for this approved window</legend>
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
                {scope === "customer" ? "Customer CareOS" : "AG Studio"}
              </label>
            ))}
          </fieldset>
          <Button
            disabled={busy || !scopes.length}
            onClick={() => void act("request")}
          >
            Connect selected scopes via SSH
          </Button>
        </>
      ) : (
        <>
          <p>
            Requested:{" "}
            <strong>
              {pairing.scopes
                .map((s) =>
                  s === "customer" ? "Customer CareOS" : "AG Studio",
                )
                .join(" + ")}
            </strong>
            . Pairing expires{" "}
            <time dateTime={pairing.expiresAt}>{pairing.expiresAt}</time>.
          </p>
          <p>
            Run this command in a new Mac Terminal tab. It approves only this
            browser request. It does not start another tunnel or extend the
            testing window.
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
                  "SSH approval command copied. Run it in a new Mac Terminal tab, then finish the connection here.",
                );
              } catch {
                setMessage(
                  "Select the command above and copy it into a new Mac Terminal tab, then finish the connection here.",
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
