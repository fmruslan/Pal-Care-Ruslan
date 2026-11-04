"use client";

import { useState } from "react";
import { Button } from "../ui/button";

/** An editable preparation tool, not a return request or merchant write. */
export function ReturnDraft({
  name,
  model,
  purchasedOn,
  origin,
  receipt,
}: {
  name: string;
  model: string;
  purchasedOn: string;
  origin: string;
  receipt: string | null;
}) {
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  return (
    <section className="mt-5">
      <h3 className="font-semibold">Prepare your next step</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Prepare a message using this exact purchase. This does not submit a
        return, contact a merchant or establish eligibility. Use fictional
        information only.
      </p>
      {!draft ? (
        <Button
          variant="outline"
          className="mt-3"
          onClick={() =>
            setDraft(
              `Hello, I would like to check the return options for ${name} (${model}), purchased on ${purchasedOn}.\n\nRecord: ${origin === "sandbox" ? "PayPal Sandbox purchase of fictional goods" : "fictional sample purchase"}.${receipt ? " A saved receipt is available in Pal Care." : " No receipt is available in the saved records."}\n\nPlease confirm the applicable policy, eligibility and any required next steps. No return approval or refund is assumed.\n\nReason for enquiry: [add your reason]`,
            )
          }
        >
          Prepare return message
        </Button>
      ) : (
        <>
          <label
            htmlFor="return-draft"
            className="mt-4 block text-sm font-semibold"
          >
            Editable return enquiry · not sent
          </label>
          <textarea
            id="return-draft"
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
                setStatus("Draft cleared. Purchase records are unchanged.");
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
