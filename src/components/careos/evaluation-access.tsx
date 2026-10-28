"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  EvaluationAccessStatus,
  EvaluationScope,
} from "@/lib/careos/evaluation-access";
import { Button } from "../ui/button";
import { OwnerConnection, type OwnerCommand } from "./owner-connection";

export function EvaluationAccess({
  initialAccess,
  ownerCommand,
}: {
  initialAccess: EvaluationAccessStatus;
  ownerCommand?: OwnerCommand;
}) {
  const [access, setAccess] = useState<EvaluationAccessStatus | null>(
    initialAccess,
  );
  const [scope, setScope] = useState<EvaluationScope>("customer");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const current = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    try {
      const r = await fetch("/api/ai/evaluation", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!r.ok) throw new Error("Status unavailable");
      const next: EvaluationAccessStatus = await r.json();
      if (!controller.signal.aborted) setAccess(next);
    } catch {
      if (!controller.signal.aborted) {
        setAccess(null);
        setStatus(
          "Connection unavailable. Reconnect your SSH tunnel, then check access. No model call was made.",
        );
      }
    }
  }, []);
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible" && !busy) void refresh();
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    const deadline =
      access?.window === "active" && access.expiresAt
        ? Date.parse(access.expiresAt)
        : null;
    const timer =
      deadline === null
        ? undefined
        : window.setTimeout(
            () => void refresh(),
            Math.max(0, deadline - Date.now() + 50),
          );
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      window.clearTimeout(timer);
      current.current?.abort();
    };
  }, [access, busy, refresh]);
  const authorized = access?.window === "active" && access.scopes[scope];
  return (
    <div className="space-y-4">
      <p>
        Use the same browser profile at <strong>http://127.0.0.1:3002</strong>.
        Normal refreshes, app restarts and SSH reconnections do not require
        another token while its cookie and approved window remain valid.
      </p>
      {access?.expiresAt && (
        <p>
          Testing window ends:{" "}
          <time dateTime={access.expiresAt}>{access.expiresAt}</time> (UTC).
        </p>
      )}
      {access?.window === "expired" && (
        <p role="alert">
          The approved testing window has expired. Ask the owner to renew it;
          entering a token cannot extend it. After legitimate renewal, authorize
          this browser through SSH if its expired cookies were removed.
        </p>
      )}
      {access?.window === "unavailable" && (
        <p role="alert">
          Private testing access is not enabled or its configuration is
          unavailable. Ask the owner to check the private launcher; do not enter
          a token yet.
        </p>
      )}
      {access?.window === "active" && (
        <ul className="space-y-2">
          <li>
            Customer CareOS:{" "}
            <strong>
              {access.scopes.customer
                ? "Authorized in this browser"
                : "Not authorized in this browser"}
            </strong>
            {access.scopes.customer && (
              <>
                {" "}
                ·{" "}
                <Link className="text-primary underline" href="/dashboard">
                  Open Customer CareOS
                </Link>
              </>
            )}
          </li>
          <li>
            AG Studio:{" "}
            <strong>
              {access.scopes.studio
                ? "Authorized in this browser"
                : "Not authorized in this browser"}
            </strong>
            {access.scopes.studio && (
              <>
                {" "}
                ·{" "}
                <Link
                  className="text-primary underline"
                  href="/merchant/intelligence"
                >
                  Open AG Studio
                </Link>
              </>
            )}
          </li>
        </ul>
      )}
      {access?.window === "active" && (
        <>
          {ownerCommand &&
            (!access.scopes.customer || !access.scopes.studio) && (
              <OwnerConnection
                command={ownerCommand}
                onConnected={async () => {
                  await refresh();
                  setStatus(
                    "Owner connection complete. Use your authorized workspace links above.",
                  );
                }}
              />
            )}
          <details open={ownerCommand ? undefined : true}>
            <summary className="min-h-11 cursor-pointer py-2">
              Advanced: private scope token
            </summary>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy || authorized) return;
                setBusy(true);
                setStatus("");
                try {
                  const r = await fetch("/api/ai/evaluation", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ scope, token }),
                  });
                  setToken("");
                  setStatus(
                    r.ok
                      ? "Scope authorized. Use its workspace link above."
                      : "Scope not authorized. Check the selected scope and token, or ask the owner about the testing window.",
                  );
                  await refresh();
                } catch {
                  setToken("");
                  setStatus(
                    "Connection unavailable. Reconnect the tunnel and check access before entering the token again.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="block">
                Evaluation scope
                <select
                  className="ml-3 rounded border bg-card p-2"
                  value={scope}
                  disabled={busy}
                  onChange={(e) => {
                    setScope(e.target.value as EvaluationScope);
                    setToken("");
                    setStatus("");
                  }}
                >
                  <option value="customer">Customer CareOS</option>
                  <option value="studio">AG Studio</option>
                </select>
              </label>
              {authorized ? (
                <p>
                  No token needed for this scope. Your browser is already
                  authorized.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Authorize this scope once per approved window. Private
                    browsing, clearing site data or changing the
                    hostname/profile can remove access. Customer and Studio
                    tokens are separate; never paste a ChatGPT credential.
                  </p>
                  <label className="block">
                    Private scope token
                    <input
                      type="password"
                      autoComplete="off"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      className="mt-2 block w-full rounded border bg-card p-2"
                    />
                  </label>
                  <Button disabled={busy || !/^[a-f0-9]{64}$/.test(token)}>
                    Authorize this browser
                  </Button>
                </>
              )}
            </form>
          </details>
        </>
      )}
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => {
          setStatus("");
          void refresh();
        }}
      >
        Check access
      </Button>
      <p role="status">{status}</p>
    </div>
  );
}
