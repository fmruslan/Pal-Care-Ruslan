"use client";

import { useId, useState } from "react";
import { Button } from "../ui/button";

/** An editable preparation tool, not a return request or merchant write. */
export function ReturnDraft({
  name,
  model,
  purchasedOn,
  origin,
  receipt,
  topic = "return",
  evidenceSummary,
}: {
  name: string;
  model: string;
  purchasedOn: string;
  origin: string;
  receipt: string | null;
  topic?: "return" | "refund" | "warranty" | "price adjustment";
  evidenceSummary?: string;
}) {
  const fieldId = useId();
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  return (
    <section className="mt-5">
      <h3 className="font-semibold">Draft a message</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Start with this purchase’s details, then edit before copying. Nothing is
        sent, and eligibility isn’t confirmed. Use fictional information only.
      </p>
      {!draft ? (
        <Button
          variant="outline"
          className="mt-3"
          onClick={() =>
            setDraft(
              `Hello, could you help me check the ${topic} options for ${name} (${model}), purchased on ${purchasedOn}?\n\nPurchase: ${origin === "sandbox" ? "PayPal Sandbox purchase of fictional goods" : "fictional sample purchase"}.${receipt ? " A saved receipt is available in Pal Care." : " No receipt is available in the saved records."}${evidenceSummary ? `\n\nSaved details to check: ${evidenceSummary.slice(0, 2000)}` : ""}\n\nPlease confirm which terms apply, whether this purchase is eligible and what to do next. No return approval, coverage or refund is assumed.\n\nMy question: [add your question]`,
            )
          }
        >
          Draft {topic} message
        </Button>
      ) : (
        <>
          <label htmlFor={fieldId} className="mt-4 block text-sm font-semibold">
            Your {topic} draft · not sent
          </label>
          <textarea
            id={fieldId}
            rows={10}
            maxLength={4000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="mt-2 w-full rounded-xl border border-input bg-background p-4 text-base leading-7 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(draft);
                  setStatus("Message copied. Nothing was sent.");
                } catch {
                  setStatus(
                    "Copy unavailable. Select and copy the draft above.",
                  );
                }
              }}
            >
              Copy message
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setDraft("");
                setStatus(
                  "Draft discarded. Your purchase records haven’t changed.",
                );
              }}
            >
              Discard draft
            </Button>
          </div>
        </>
      )}
      <p role="status" className="mt-2 text-sm text-muted-foreground">
        {status}
      </p>
    </section>
  );
}
