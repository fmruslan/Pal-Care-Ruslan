"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Check, X, RefreshCw, ArrowRight } from "lucide-react";
import { Button } from "../ui/button";
import { ReturnDraft } from "./return-draft";
import { displayDate } from "@/lib/demo/presentation";
import {
  ownershipTopic,
  type OwnershipFact,
  type OwnershipTopic,
  type OwnershipView,
} from "@/lib/care/ownership-contracts";

type JourneyContext = {
  view: OwnershipView;
  show: (topic: OwnershipTopic, opener?: HTMLElement) => void;
};
const Journey = createContext<JourneyContext | null>(null);
function useJourney() {
  return useContext(Journey);
}

/** Decorative original SVG; the adjacent HTML label/button carries semantics. */
export function OwnershipIcon({
  topic,
  className = "size-5",
}: {
  topic: string;
  className?: string;
}) {
  const path =
    topic === "safety"
      ? "M12 3 2 21h20L12 3Zm0 6v5m0 3v1"
      : topic === "delivery"
        ? "M3 5h11v12H3V5Zm11 5h4l3 5v2h-7M7 19a2 2 0 1 0-4 0 2 2 0 0 0 4 0Zm14 0a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z"
        : ["returns", "refunds"].includes(topic)
          ? "M7 7h8a6 6 0 1 1-6 6M7 7l4-4M7 7l4 4"
          : ["price", "price-window", "watch"].includes(topic)
            ? "M4 5h8l8 8-7 7-9-9V5Zm4 4h.01M12 12l4 4"
            : ["warranty", "return-window"].includes(topic)
              ? "M5 5h14v15H5V5Zm3-2v4m8-4v4M5 10h14m-10 4h6m-6 3h3"
              : topic === "north"
                ? "m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"
                : "m3 7 9-4 9 4v12l-9 3-9-3V7Zm0 0 9 4 9-4m-9 4v11";
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

function FactDetails({ fact }: { fact: OwnershipFact }) {
  return (
    <div className="space-y-3" data-ownership-fact={fact.id}>
      <p className="font-semibold">{fact.status}</p>
      <p className="text-sm leading-7 text-muted-foreground">{fact.detail}</p>
      <p className="text-xs leading-6 text-muted-foreground">
        {fact.provenance}
        {fact.date
          ? ` · ${displayDate(fact.date)}`
          : " · Event date not established"}
      </p>
      {fact.recordedAt && (
        <p className="text-xs leading-5 text-muted-foreground">
          Recorded or observed{" "}
          <time dateTime={fact.recordedAt}>{displayDate(fact.recordedAt)}</time>
        </p>
      )}
      {fact.sources.length > 0 && (
        <ul className="space-y-1">
          {fact.sources.map((source, index) => (
            <li key={`${source.href}:${index}`}>
              <Link
                className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4"
                href={source.href}
              >
                {source.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {fact.action && (
        <Button asChild variant="outline">
          <Link href={fact.action.href}>
            {fact.action.label}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      )}
    </div>
  );
}

export function OwnershipScope({
  view,
  children,
}: {
  view: OwnershipView | null;
  children: ReactNode;
}) {
  if (!view) return <>{children}</>;
  return (
    <ConnectedOwnershipScope view={view}>{children}</ConnectedOwnershipScope>
  );
}
function ConnectedOwnershipScope({
  view,
  children,
}: {
  view: OwnershipView;
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<OwnershipTopic | null>(null);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const params = useSearchParams();
  const requested = ownershipTopic(params.get("milestone"));
  const router = useRouter();
  const [refreshing, refresh] = useTransition();
  const previousRevision = useRef(view.revision);
  const [changed, setChanged] = useState(false);
  const topic = selected ?? view.pill.topic;
  const facts = view.facts.filter((f) => f.topic === topic);
  const selectedKey = `${view.twinId}:${requested ?? ""}`;
  const lastLink = useRef("");
  useEffect(() => {
    if (lastLink.current === selectedKey) return;
    const frame = requestAnimationFrame(() => {
      lastLink.current = selectedKey;
      if (requested && view.facts.some((f) => f.topic === requested)) {
        setSelected(requested);
        setOpen(true);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedKey, requested, view.facts]);
  useEffect(() => {
    if (previousRevision.current !== view.revision) {
      previousRevision.current = view.revision;
      const frame = requestAnimationFrame(() => setChanged(true));
      return () => cancelAnimationFrame(frame);
    }
  }, [view.revision]);
  // Saved-record refresh only. Never poll an external source/model or interrupt
  // someone reading a modal. Tab visibility bounds background work.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!open && document.visibilityState === "visible") router.refresh();
    }, 60000);
    return () => clearInterval(timer);
  }, [open, router]);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      window.dispatchEvent(new Event("palcare-ownership-visible")),
    );
    return () => cancelAnimationFrame(frame);
  }, [open, topic, view.revision]);
  useEffect(() => {
    const receive = (event: Event) => {
      const value = (event as CustomEvent).detail;
      const target = ownershipTopic(value?.topic);
      if (
        value?.twinId === view.twinId &&
        value?.revision === view.revision &&
        target &&
        view.facts.some((f) => f.topic === target)
      ) {
        setSelected(target);
        setOpen(true);
      }
    };
    window.addEventListener("palcare-open-ownership", receive);
    return () => window.removeEventListener("palcare-open-ownership", receive);
  }, [view]);
  const show = (value: OwnershipTopic, target?: HTMLElement) => {
    if (target && !target.closest("[data-ownership-panel]"))
      opener.current = target;
    setSelected(value);
    setOpen(true);
  };
  return (
    <Journey.Provider value={{ view, show }}>
      {children}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-2xl border bg-card p-5 shadow-xl [overflow-wrap:anywhere] sm:p-7"
            data-ownership-panel="true"
            data-ownership-twin={view.twinId}
            data-ownership-topic={topic}
            data-ownership-revision={view.revision}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              (
                opener.current ??
                document.querySelector<HTMLElement>("[data-ownership-pill]")
              )?.focus();
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="text-xl font-semibold">
                  {facts[0]?.title ?? "Ownership evidence"}
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
                  Your recorded facts and their sources. Payment, delivery,
                  returns and safety remain independent.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close ownership evidence"
                >
                  <X aria-hidden="true" />
                </Button>
              </Dialog.Close>
            </div>
            <div className="mt-5 space-y-5">
              {facts.map((fact) => (
                <FactDetails key={fact.id} fact={fact} />
              ))}
            </div>
            {[
              "returns",
              "return-window",
              "refunds",
              "warranty",
              "price",
              "price-window",
            ].includes(topic) && (
              <ReturnDraft
                key={`${view.twinId}:${topic}`}
                {...view.purchase}
                topic={
                  topic === "refunds"
                    ? "refund"
                    : topic === "warranty"
                      ? "warranty"
                      : topic.startsWith("price")
                        ? "price adjustment"
                        : "return"
                }
              />
            )}
            <details className="mt-6 border-t pt-2">
              <summary className="min-h-11 cursor-pointer py-3 font-semibold">
                All ownership states
              </summary>
              <ul className="space-y-2">
                {view.facts.map((fact) => (
                  <li key={fact.id}>
                    <button
                      onClick={(event) => show(fact.topic, event.currentTarget)}
                      className="flex min-h-11 w-full items-start gap-3 rounded-lg p-2 text-left text-sm hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <OwnershipIcon
                        topic={fact.topic}
                        className="mt-1 size-4 shrink-0 text-primary"
                      />
                      <span>
                        {fact.title}
                        <span className="mt-1 block text-muted-foreground">
                          {fact.status} · {fact.provenance}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
            <details className="mt-3 border-t pt-2">
              <summary className="min-h-11 cursor-pointer py-3 font-semibold">
                Recorded ownership history
              </summary>
              <p className="mb-4 text-xs leading-6 text-muted-foreground">
                Available source-labeled history, not a claim of complete
                carrier or merchant coverage. Original sample reminders are not
                verified lifecycle changes.
              </p>
              <ol className="space-y-6 border-l pl-4">
                {view.history.map((fact) => (
                  <li key={fact.id}>
                    <p className="mb-2 text-sm font-semibold">
                      {fact.title}
                      {fact.date ? ` · ${displayDate(fact.date)}` : ""}
                    </p>
                    <FactDetails fact={fact} />
                  </li>
                ))}
              </ol>
            </details>
            {(!view.complete || view.unavailable.length > 0) && (
              <p
                role="status"
                className="mt-4 text-sm leading-6 text-muted-foreground"
              >
                Some evidence is unavailable or incomplete
                {view.unavailable.length
                  ? `: ${view.unavailable.join(", ")}`
                  : ""}
                . Missing information is not an all-clear.
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <span className="text-xs text-muted-foreground">
                Saved-record view ·{" "}
                <time dateTime={view.asOf}>{displayDate(view.asOf)}</time>
              </span>
              <Button
                variant="ghost"
                disabled={refreshing}
                onClick={() => refresh(() => router.refresh())}
              >
                <RefreshCw aria-hidden="true" />
                {refreshing ? "Refreshing records…" : "Refresh saved facts"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {changed && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          The ownership view has updated. The current pill and timeline use the
          refreshed facts and dates; earlier North answers retain their original
          as-of evidence.
        </p>
      )}
    </Journey.Provider>
  );
}

export function OwnershipPill() {
  const journey = useJourney();
  if (!journey)
    return (
      <span className="text-sm text-muted-foreground">
        Ownership evidence unavailable
      </span>
    );
  const { view, show } = journey;
  return (
    <button
      data-ownership-pill
      data-ownership-twin={view.twinId}
      aria-haspopup="dialog"
      onClick={(event) => show(view.pill.topic, event.currentTarget)}
      className={`inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border px-4 py-2 text-left text-sm font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${view.pill.verified ? "border-success/30 bg-success-surface text-success" : view.pill.attention ? "border-warning/40 bg-warning-surface text-warning" : "border-primary/30 bg-secondary text-foreground"}`}
    >
      {view.pill.verified ? (
        <Check className="size-4 shrink-0" aria-hidden="true" />
      ) : (
        <OwnershipIcon topic={view.pill.topic} className="size-4 shrink-0" />
      )}
      <span>{view.pill.label}</span>
      <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
    </button>
  );
}

export function OwnershipTimeline() {
  const journey = useJourney();
  if (!journey)
    return (
      <p
        role="status"
        className="my-5 rounded-xl border p-4 text-sm text-muted-foreground"
      >
        Ownership evidence is temporarily unavailable. Your original purchase
        and receipt remain available; no missing status was assumed.
      </p>
    );
  const { view, show } = journey;
  return (
    <section
      id="ownership"
      aria-labelledby="ownership-heading"
      className="my-6 min-w-0 rounded-2xl border bg-card p-4 sm:p-6"
      data-ownership-revision={view.revision}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="ownership-heading" className="text-lg font-semibold">
            Your ownership timeline
          </h2>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            Compressed timeline · spacing is not elapsed time. Select a
            milestone for evidence.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-intelligence-foreground">
          <OwnershipIcon topic="north" className="size-4" />
          Same facts as North
        </span>
      </div>
      <div
        className="mt-5 overflow-x-auto overscroll-x-contain pb-2"
        role="region"
        aria-label="Ownership milestones"
        tabIndex={0}
      >
        <ol className="flex min-w-full items-stretch">
          {view.facts.map((fact, index) => (
            <li key={fact.id} className="relative w-40 shrink-0 grow sm:w-44">
              <svg
                viewBox="0 0 160 32"
                preserveAspectRatio="none"
                aria-hidden="true"
                className="absolute left-0 top-1 h-8 w-full overflow-visible text-border"
              >
                <path
                  d={`M${index === 0 ? 80 : 0} 16H${index === view.facts.length - 1 ? 80 : 160}`}
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  strokeDasharray={
                    fact.state === "recorded" ? undefined : "3 5"
                  }
                />
              </svg>
              <button
                data-ownership-milestone={fact.topic}
                onClick={(event) => show(fact.topic, event.currentTarget)}
                className="group relative flex min-h-40 w-full flex-col items-center rounded-xl px-2 py-1 text-center transition-colors hover:bg-secondary motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full border bg-card ${fact.verified ? "border-success text-success" : fact.state === "attention" ? "border-warning text-warning" : "border-primary/50 text-primary"}`}
                >
                  <OwnershipIcon topic={fact.topic} className="size-4" />
                </span>
                <span className="mt-3 text-sm font-semibold">{fact.title}</span>
                <span className="mt-1 text-xs leading-5 text-muted-foreground">
                  {fact.date
                    ? displayDate(fact.date)
                    : fact.state === "not-applicable"
                      ? "Fictional goods"
                      : "Date not established"}
                </span>
                <span className="mt-1 text-xs leading-5 text-muted-foreground">
                  {fact.status}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <details className="mt-3 border-t pt-1">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
          Expand dates, sources & actions
        </summary>
        <ol className="space-y-5">
          {view.facts.map((fact) => (
            <li key={fact.id} className="rounded-xl border p-4">
              <h3 className="mb-3 font-semibold">{fact.title}</h3>
              <FactDetails fact={fact} />
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
