"use client";

import { useId, useState } from "react";
import type { PurchaseChoice } from "@/lib/careos/contracts";
import { displayDate } from "@/lib/demo/presentation";
import { Button } from "../ui/button";

export function PurchaseChoices({
  choices,
  active,
  onContinue,
}: {
  choices: PurchaseChoice[];
  active: boolean;
  onContinue: (choice: PurchaseChoice) => void;
}) {
  const groupId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = choices.find(
    (choice) => selectedId !== null && choice.context.twinId === selectedId,
  );

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!active || !selected) return;
        onContinue(selected);
      }}
    >
      <fieldset disabled={!active} className="min-w-0 space-y-3">
        <legend className="text-sm font-semibold">Choose a purchase</legend>
        {choices.map((choice, index) => (
          <label
            key={choice.context.twinId}
            htmlFor={`${groupId}-${index}`}
            className={`flex min-h-11 items-start gap-3 rounded-xl border border-input p-3 text-sm ${active ? "cursor-pointer" : "cursor-default"} ${selectedId === choice.context.twinId ? "bg-secondary text-secondary-foreground" : "bg-card text-foreground"}`}
          >
            <input
              id={`${groupId}-${index}`}
              type="radio"
              name={groupId}
              value={choice.context.twinId ?? ""}
              checked={
                selectedId !== null && selectedId === choice.context.twinId
              }
              disabled={!active || !choice.context.twinId}
              onChange={() => setSelectedId(choice.context.twinId)}
              className="mt-1 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <span className="min-w-0 break-words">
              <span className="block font-medium">
                {choice.context.name} · {choice.context.model}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                <time dateTime={choice.purchasedOn}>
                  {displayDate(choice.purchasedOn)}
                </time>{" "}
                · {choice.provenance} · PC-
                {choice.context.twinId?.slice(-6).toUpperCase()}
              </span>
            </span>
          </label>
        ))}
        <Button
          type="submit"
          disabled={!active || !selected}
          className="w-full whitespace-normal text-left"
        >
          Use this purchase and continue
        </Button>
      </fieldset>
      {!active && (
        <p className="text-xs text-muted-foreground">
          This earlier choice is inactive. Ask a new question to continue.
        </p>
      )}
    </form>
  );
}
