"use client";

import type { PurchaseChoice } from "@/lib/careos/contracts";
import { displayDate } from "@/lib/demo/presentation";
import { Button } from "../ui/button";

export function PurchaseChoiceLabel({ choice }: { choice: PurchaseChoice }) {
  return (
    <span className="min-w-0 break-words">
      <span className="block font-medium">
        {choice.context.name} · {choice.context.model}
      </span>
      <span className="mt-1 block text-sm text-muted-foreground">
        <time dateTime={choice.purchasedOn}>
          {displayDate(choice.purchasedOn)}
        </time>{" "}
        ·{" "}
        {choice.provenance === "Sample"
          ? "Example purchase"
          : choice.provenance}
      </span>
    </span>
  );
}

export function PurchaseChoices({
  choices,
  active,
  onChoose,
  onDismiss,
  selectedId,
}: {
  choices: PurchaseChoice[];
  active: boolean;
  onChoose: (choice: PurchaseChoice) => void;
  onDismiss: () => void;
  selectedId?: string | null;
}) {
  if (!active) {
    const selected = choices.find(
      (choice) => choice.context.twinId === selectedId,
    );
    return (
      <p className="text-sm text-muted-foreground">
        {selected
          ? `Selected ${selected.context.name} · ${displayDate(selected.purchasedOn)} · ${selected.provenance}. Your next question uses this purchase.`
          : "Earlier purchase options. Use Choose a purchase to change the selection for your next question."}
      </p>
    );
  }
  return (
    <section
      aria-label="Choose a purchase"
      className="space-y-2 rounded-xl border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Which purchase do you mean?</h3>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Choose the purchase you mean so North uses the right receipt and
        details. You can also ask something else.
      </p>
      {choices.map((choice) => (
        <button
          key={choice.context.twinId}
          type="button"
          disabled={!choice.context.twinId}
          className="w-full rounded-xl border border-input bg-card p-3 text-left text-base hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={() => onChoose(choice)}
        >
          <PurchaseChoiceLabel choice={choice} />
        </button>
      ))}
    </section>
  );
}
