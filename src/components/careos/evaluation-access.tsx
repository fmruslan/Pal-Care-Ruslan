"use client";
import { useState } from "react";
import { Button } from "../ui/button";
export function EvaluationAccess() {
  const [scope, setScope] = useState("customer"),
    [token, setToken] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
          const r = await fetch("/api/ai/evaluation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scope, token }),
          });
          setToken("");
          setStatus(
            r.ok
              ? "Scope authorized. Return to your purchase or merchant workspace."
              : "Evaluation is disabled, expired or this scope token is invalid.",
          );
        } catch {
          setStatus("Connection unavailable. No model call was made.");
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <label className="block">
        Evaluation scope
        <select
          className="ml-3 rounded border bg-card p-2"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="customer">Customer CareOS</option>
          <option value="studio">Merchant Studio</option>
        </select>
      </label>
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
      <Button disabled={busy || token.length !== 64}>
        Authorize this browser
      </Button>
      <p role="status">{status}</p>
    </form>
  );
}
