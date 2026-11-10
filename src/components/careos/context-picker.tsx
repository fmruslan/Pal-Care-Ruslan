"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { z } from "zod";
import {
  careContextSchema,
  type CareContext,
  type PurchaseChoice,
} from "@/lib/careos/contracts";
import { Button } from "../ui/button";
import { PurchaseChoiceLabel } from "./purchase-choices";
import { useVisibleViewport } from "./use-visible-viewport";

const choicesSchema = z.strictObject({
  choices: z
    .array(
      z.strictObject({
        context: careContextSchema,
        purchasedOn: z.iso.date(),
        provenance: z.enum(["Sample", "Verified Sandbox"]),
      }),
    )
    .max(100),
});

export function ContextPicker({
  open,
  onOpenChange,
  onSelect,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onSelect: (context: CareContext | null) => void;
  returnFocus?: RefObject<HTMLButtonElement | null>;
}) {
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<PurchaseChoice[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const viewport = useVisibleViewport();
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch("/api/careos/context", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("context_unavailable");
        const value = choicesSchema.parse(await response.json());
        if (!controller.signal.aborted) {
          setChoices(value.choices);
          setState("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error");
      });
    return () => controller.abort();
  }, [open, retry]);
  function select(value: CareContext | null) {
    onSelect(value);
    onOpenChange(false);
  }
  const words = query.trim().toLowerCase();
  const matches = choices.filter((choice) =>
    `${choice.context.name} ${choice.context.model} ${choice.purchasedOn} ${choice.provenance} ${choice.context.twinId?.slice(-6)}`
      .toLowerCase()
      .includes(words),
  );
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-background/70 backdrop-blur-sm" />
        <Dialog.Content
          ref={viewport}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            search.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus?.current?.focus();
          }}
          className="careos-context-picker fixed top-1/2 left-1/2 z-[71] flex max-h-[85dvh] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border bg-card p-4 shadow-lift"
        >
          <div className="flex items-center justify-between gap-2">
            <Dialog.Title className="text-lg font-semibold">
              Choose a purchase
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Focus your next question on one purchase, or use all saved
            purchases. Choosing here won’t send a question.
          </Dialog.Description>
          <label
            htmlFor="careos-context-search"
            className="mt-4 text-sm font-medium"
          >
            Search saved purchases
          </label>
          <input
            ref={search}
            id="careos-context-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={200}
            className="mt-2 min-h-11 rounded-xl border border-input bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-ring"
            placeholder="Product, model or purchase date"
          />
          <Button
            variant="outline"
            className="my-3 justify-start"
            onClick={() => select(null)}
          >
            Use all purchases
          </Button>
          <div
            className="min-h-0 space-y-2 overflow-y-auto overscroll-contain p-1"
            aria-label="Saved purchase choices"
          >
            {state === "loading" && (
              <p role="status">Loading saved purchases…</p>
            )}
            {state === "error" && (
              <div role="alert">
                <p>
                  We couldn’t load your purchases. Your current selection hasn’t
                  changed. Try loading them again.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setState("loading");
                    setRetry((v) => v + 1);
                  }}
                >
                  Try loading purchases again
                </Button>
              </div>
            )}
            {state === "ready" && !matches.length && (
              <p role="status" className="text-sm text-muted-foreground">
                No saved purchases match. Try a product name, model or date.
              </p>
            )}
            {state === "ready" &&
              matches.map((choice) => (
                <button
                  key={choice.context.twinId}
                  type="button"
                  className="w-full rounded-xl border border-input p-3 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => select(choice.context)}
                >
                  <PurchaseChoiceLabel choice={choice} />
                </button>
              ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
