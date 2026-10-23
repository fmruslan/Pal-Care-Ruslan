"use client";
import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { money } from "@/lib/demo/presentation";
import type { GuardianOverview } from "@/lib/price-guardian/contracts";

type Access = {
  session: { actions: string[]; case_id: string | null } | null;
  refundsEnabled: boolean;
  readsEnabled: boolean;
};
export function OperatorPanel({ overview }: { overview: GuardianOverview }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [access, setAccess] = useState<Access | null>(null),
    [code, setCode] = useState(""),
    [notice, setNotice] = useState(""),
    [posting, setBusy] = useState(false);
  const busy = posting || refreshing;
  useEffect(() => {
    let current = true;
    void fetch("/api/operator/session", { cache: "no-store" })
      .then(async (r) => {
        if (r.ok && current) setAccess(await r.json());
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);
  async function post(path: string, body: unknown) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setNotice(
          response.status === 403
            ? "Operator access was rejected. Public browsing grants no merchant authority."
            : response.status === 429
              ? "A persistent safety limit was reached. Stop and review; do not retry repeatedly."
              : "Action unavailable, stale, or disabled. No completed financial outcome is implied. Refresh and inspect the saved case before proceeding.",
        );
        return;
      }
      if (path.endsWith("/session")) {
        setCode("");
        const r = await fetch(path, { cache: "no-store" });
        if (r.ok) setAccess(await r.json());
        setNotice(
          "Operator capability activated for its permitted actions only.",
        );
      } else {
        const saved = (await response.json()) as GuardianOverview;
        if (!Array.isArray(saved.cases))
          throw new Error("Invalid saved projection");
        setNotice(
          "Action recorded. Refreshing from saved state; a pending workflow is not a completed financial outcome.",
        );
        startRefresh(() => router.refresh());
      }
    } catch {
      setNotice(
        "Connection interrupted. Inspect saved state before repeating any action.",
      );
      startRefresh(() => router.refresh()); // Retrieval only; never replay a mutation.
    } finally {
      setBusy(false);
    }
  }
  const actions = access?.session?.actions ?? [],
    scope = access?.session?.case_id;
  return (
    <section
      className="rounded-3xl border bg-card p-5 sm:p-7"
      aria-labelledby="operator-heading"
    >
      <h2 id="operator-heading" className="section-title">
        Protected merchant actions
      </h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        Public visitors can inspect records, not change prices or approve
        refunds. A private, short-lived operator capability is required. This is
        not customer registration.
      </p>
      {!access?.session && (
        <form
          className="mt-5 flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void post("/api/operator/session", { code });
          }}
        >
          <label className="min-w-0 flex-1 text-sm">
            One-time private activation code
            <Input
              type="password"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={64}
              className="mt-2"
              required
            />
          </label>
          <Button
            type="submit"
            disabled={busy || code.length !== 64}
            className="self-end"
          >
            Activate operator access
          </Button>
        </form>
      )}
      {access?.session && (
        <div className="mt-5 space-y-4">
          <p className="text-sm font-semibold">
            Scoped operator access active. Financial execution:{" "}
            {access.refundsEnabled ? "explicit scope required" : "disabled"}.
          </p>
          <div className="flex flex-wrap gap-3">
            {actions.includes("policy:publish") && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void post("/api/operator/guardian", {
                    action: "publish-policy",
                  })
                }
              >
                Approve future policy v2
              </Button>
            )}
            {actions.includes("price:publish") && (
              <>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void post("/api/operator/guardian", {
                      action: "publish-price",
                      direction: "drop",
                      requestId: crypto.randomUUID(),
                    })
                  }
                >
                  Publish controlled $109 price
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void post("/api/operator/guardian", {
                      action: "publish-price",
                      direction: "restore",
                      requestId: crypto.randomUUID(),
                    })
                  }
                >
                  Restore controlled $129 price
                </Button>
              </>
            )}
          </div>
          {overview.cases
            .filter((c) => c.id === scope)
            .map((c) => (
              <div key={c.id} className="rounded-2xl border p-4">
                <p className="text-sm font-semibold">
                  {c.productName} · revision {c.revision} ·{" "}
                  {money(c.amountMinor)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Saved state: {c.state.replaceAll("_", " ")} ·{" "}
                  {c.state === "completed" && c.verifiedAt
                    ? "independently verified Sandbox outcome"
                    : "not a completed refund"}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {actions.includes("case:approve") &&
                    ["awaiting_approval", "approved"].includes(c.state) && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void post("/api/operator/guardian", {
                            action: "approve",
                            caseId: c.id,
                            revision: c.revision,
                            requestId: crypto.randomUUID(),
                          })
                        }
                      >
                        Approve {money(c.amountMinor)} proposal · no dispatch
                      </Button>
                    )}
                  {actions.includes("refund:execute") && (
                    <Button
                      disabled={
                        busy || !access.refundsEnabled || c.state !== "approved"
                      }
                      onClick={() =>
                        void post("/api/operator/guardian", {
                          action: "execute",
                          caseId: c.id,
                          revision: c.revision,
                        })
                      }
                    >
                      Execute scoped Sandbox refund
                    </Button>
                  )}
                  {actions.includes("refund:reconcile") && (
                    <Button
                      variant="outline"
                      disabled={busy || !access.readsEnabled}
                      onClick={() =>
                        void post("/api/operator/guardian", {
                          action: "reconcile",
                          caseId: c.id,
                        })
                      }
                    >
                      Reconcile existing refund · provider reads only
                    </Button>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-secondary p-4 text-sm text-secondary-foreground"
        >
          {notice}
        </p>
      )}
    </section>
  );
}
