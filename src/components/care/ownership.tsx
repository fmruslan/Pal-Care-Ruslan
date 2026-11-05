"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useId,
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
  careMilestones,
  careMilestoneLabel,
  careMilestoneState,
  careNextWindow,
  careMilestoneTopics,
} from "@/lib/care/summary";
import {
  ownershipTopic,
  type OwnershipFact,
  type OwnershipTopic,
  type OwnershipView,
} from "@/lib/care/ownership-contracts";

type JourneyContext = {
  view: OwnershipView;
  show: (topic: OwnershipTopic, opener?: HTMLElement) => void;
  focused: OwnershipTopic | null;
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
      <p className="font-semibold">
        {fact.consumer?.status ?? fact.status}
        {fact.simulation && fact.consumer ? " · Demo" : ""}
      </p>
      {fact.consumer && (
        <>
          <p className="text-base leading-7">{fact.consumer.summary}</p>
          <p className="text-sm leading-7">
            <strong>Next step:</strong> {fact.consumer.nextStep}
          </p>
        </>
      )}
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
            {fact.consumer?.action ?? fact.action.label}
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
  surface = "product",
}: {
  view: OwnershipView | null;
  children: ReactNode;
  surface?: "product" | "care";
}) {
  if (!view) return <>{children}</>;
  return (
    <ConnectedOwnershipScope view={view} surface={surface}>
      {children}
    </ConnectedOwnershipScope>
  );
}
function ConnectedOwnershipScope({
  view,
  children,
  surface,
}: {
  view: OwnershipView;
  children: ReactNode;
  surface: "product" | "care";
}) {
  const instance = useId();
  const scope = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<OwnershipTopic | null>(null);
  const [selected, setSelected] = useState<OwnershipTopic | null>(null);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const params = useSearchParams();
  const requested =
    surface === "product" ? ownershipTopic(params.get("milestone")) : null;
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
    if (surface === "care") return;
    const timer = setInterval(() => {
      if (!open && document.visibilityState === "visible") router.refresh();
    }, 60000);
    return () => clearInterval(timer);
  }, [open, router, surface]);
  useEffect(() => {
    if (surface !== "care") return;
    const receive = (event: Event) => {
      const value = (event as CustomEvent).detail;
      if (!value) {
        setFocused(null);
        return;
      }
      if (value.twinId !== view.twinId) return;
      const target = ownershipTopic(value.topic);
      if (
        value.revision === view.revision &&
        target &&
        view.facts.some((f) => f.topic === target)
      ) {
        setFocused(target);
      }
    };
    window.addEventListener("palcare-care-focus", receive);
    return () => window.removeEventListener("palcare-care-focus", receive);
  }, [surface, view]);
  useEffect(() => {
    if (!focused) return;
    const frame = requestAnimationFrame(() => {
      scope.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
      window.dispatchEvent(new Event("palcare-care-visible"));
    });
    return () => cancelAnimationFrame(frame);
  }, [focused, view.revision]);
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
        surface === "product" &&
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
  }, [view, surface]);
  const show = (value: OwnershipTopic, target?: HTMLElement) => {
    if (target && !target.closest("[data-ownership-panel]"))
      opener.current = target;
    setSelected(value);
    setOpen(true);
  };
  return (
    <Journey.Provider value={{ view, show, focused }}>
      <div
        ref={scope}
        data-ownership-scope={instance}
        data-ownership-surface={surface}
        data-ownership-twin={view.twinId}
        data-ownership-revision={view.revision}
        data-care-focused={focused ?? undefined}
        className={
          focused
            ? "rounded-2xl ring-2 ring-intelligence-foreground ring-offset-2 ring-offset-background"
            : undefined
        }
      >
        {children}
      </div>
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
                scope.current?.querySelector<HTMLElement>(
                  "[data-ownership-pill]",
                )
              )?.focus();
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="text-xl font-semibold">
                  {facts[0]?.consumer?.status ??
                    facts[0]?.title ??
                    "Ownership evidence"}
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
                  {facts.some((f) => f.simulation)
                    ? "Demo event · fictional purchase-care information. Review the source and conditions below; this is not a real delivery, coverage or payment outcome."
                    : "Your recorded facts and their sources. Payment, delivery, returns and safety remain independent."}
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
                evidenceSummary={
                  topic.startsWith("price")
                    ? facts
                        .map(
                          (fact) =>
                            `${fact.status}. ${fact.detail} ${fact.sources.map((source) => `${source.label}: ${source.href}`).join("; ")}`,
                        )
                        .join("\n")
                    : undefined
                }
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

export function OwnershipPill({ compact = false }: { compact?: boolean }) {
  const journey = useJourney();
  if (!journey)
    return (
      <span className="text-sm text-muted-foreground">
        Ownership evidence unavailable
      </span>
    );
  const { view, show } = journey;
  const fact = view.facts.find((f) => f.topic === view.pill.topic);
  return (
    <button
      data-ownership-pill
      data-ownership-twin={view.twinId}
      aria-haspopup="dialog"
      onClick={(event) => show(view.pill.topic, event.currentTarget)}
      className={`inline-flex min-h-11 max-w-full flex-wrap items-center rounded-full border ${fact?.consumer ? "gap-2 px-3 py-1.5 text-sm" : compact ? "gap-1.5 px-2.5 py-1 text-[11px] [overflow-wrap:normal] sm:text-xs" : "gap-2 px-4 py-2 text-sm"} text-left font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${view.pill.verified ? "border-success/30 bg-success-surface text-success" : view.pill.attention ? "border-warning/40 bg-warning-surface text-warning" : "border-primary/30 bg-secondary text-foreground"}`}
    >
      {view.pill.verified ? (
        <Check className="size-4 shrink-0" aria-hidden="true" />
      ) : (
        <OwnershipIcon topic={view.pill.topic} className="size-4 shrink-0" />
      )}
      <span>{fact?.consumer?.status ?? view.pill.label}</span>
      {fact?.consumer && fact.simulation && (
        <span
          className="rounded-full border border-current/25 px-2 py-0.5 text-xs font-medium"
          data-care-demo
        >
          Demo
        </span>
      )}
      <ChevronDown
        className={`${compact ? "hidden sm:block" : ""} size-4 shrink-0`}
        aria-hidden="true"
      />
    </button>
  );
}

export function OwnershipPrimaryAction() {
  const journey = useJourney();
  if (!journey) return null;
  const { view, show } = journey;
  const fact = view.facts.find((f) => f.topic === view.pill.topic);
  return (
    <button
      className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      aria-haspopup="dialog"
      data-care-primary-action
      onClick={(event) => show(view.pill.topic, event.currentTarget)}
    >
      {fact?.consumer?.action ?? "View details"}
      <ArrowRight className="size-4" aria-hidden="true" />
    </button>
  );
}

/** One saved-record refresh for the collection, never one timer per card. */
export function CareCollectionRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        !document.querySelector("[data-ownership-panel]")
      )
        router.refresh();
    }, 60000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}

export function OwnershipSummary({
  topic,
  secondary = false,
}: {
  topic: OwnershipTopic;
  secondary?: boolean;
}) {
  const journey = useJourney();
  const label = useId();
  if (!journey)
    return (
      <p className="text-xs text-muted-foreground">
        Ownership evidence unavailable; no status assumed.
      </p>
    );
  const { view, show, focused } = journey;
  const milestones = careMilestones(
    view,
    focused ?? (secondary ? null : topic),
  ).filter(
    (fact) =>
      !secondary ||
      !!view.simulation ||
      careMilestoneTopics.includes(fact.topic) ||
      fact.topic === focused ||
      (["returns", "refunds"].includes(fact.topic) &&
        ["recorded", "attention"].includes(fact.state)),
  );
  const next = careNextWindow(view);
  const selected = focused ? view.facts.filter((f) => f.topic === focused) : [];
  return (
    <div className="min-w-0" data-care-timeline>
      <p id={label} className="sr-only">
        {view.purchase.name} ownership summary. Compressed spacing is not
        elapsed time. Select a milestone for its evidence.
      </p>
      <div
        role="region"
        aria-labelledby={label}
        tabIndex={0}
        className="overflow-x-auto overscroll-x-contain focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ol className="flex min-w-full">
          {milestones.map((fact, index) => (
            <li
              key={fact.id}
              className={`relative flex-1 ${secondary ? "min-w-11" : "min-w-[3.25rem] sm:min-w-[4.5rem]"}`}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 100 20"
                preserveAspectRatio="none"
                className={`absolute top-0 w-full text-border ${secondary ? "h-3" : "h-5"}`}
              >
                <path
                  d={`M${index === 0 ? 50 : 0} 10H${index === milestones.length - 1 ? 50 : 100}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray={
                    fact.state === "recorded" ? undefined : "3 4"
                  }
                />
              </svg>
              <button
                data-care-milestone={fact.topic}
                data-milestone-state={fact.state}
                data-milestone-verified={fact.verified}
                aria-label={
                  secondary && view.simulation
                    ? undefined
                    : `${careMilestoneLabel(fact)}: ${fact.status}${fact.date ? `, ${displayDate(fact.date)}` : ""}`
                }
                aria-current={
                  (focused ?? view.pill.topic) === fact.topic
                    ? "step"
                    : undefined
                }
                title={
                  view.pill.topic === fact.topic
                    ? "Current recorded state"
                    : undefined
                }
                aria-haspopup="dialog"
                onClick={(event) => show(fact.topic, event.currentTarget)}
                className={`relative flex w-full flex-col items-center rounded-lg px-1 pb-1 text-center ${secondary && view.simulation ? "text-xs" : "text-[10px]"} [overflow-wrap:normal] hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring ${secondary ? `${view.simulation ? "min-h-11 leading-4" : "min-h-8 leading-3"} text-muted-foreground` : "min-h-[3.75rem] leading-4 sm:text-[11px]"} ${focused === fact.topic ? "bg-intelligence text-intelligence-foreground" : ""}`}
              >
                <span
                  className={`relative flex items-center justify-center rounded-full border ${secondary ? `size-3 ${fact.state === "recorded" ? "bg-primary" : "bg-card"}` : "size-5 bg-card"} ${view.pill.topic === fact.topic ? "ring-2 ring-primary/30 ring-offset-1 ring-offset-card" : ""} ${fact.state === "recorded" ? "border-primary text-primary" : fact.state === "upcoming" || fact.state === "attention" ? "border-intelligence-foreground text-intelligence-foreground" : "border-muted-foreground text-muted-foreground"} ${["unknown", "unavailable", "not-applicable"].includes(fact.state) ? "border-dashed" : ""}`}
                >
                  {!secondary &&
                    (fact.state === "recorded" && !fact.simulation ? (
                      <Check className="size-3" aria-hidden="true" />
                    ) : fact.state === "expired" ? (
                      <X className="size-3" aria-hidden="true" />
                    ) : (
                      <OwnershipIcon topic={fact.topic} className="size-3" />
                    ))}
                </span>
                {secondary ? (
                  <span className="mt-1">
                    {fact.topic === "price-window"
                      ? "Price"
                      : fact.topic === "return-window"
                        ? "Return"
                        : careMilestoneLabel(fact)}
                  </span>
                ) : (
                  <span className="mt-1 font-semibold">
                    <span className="sm:hidden">
                      {fact.topic === "purchase"
                        ? "Bought"
                        : fact.topic === "price-window"
                          ? "Price window"
                          : fact.topic === "return-window"
                            ? "Returns"
                            : careMilestoneLabel(fact)}
                    </span>
                    <span className="hidden sm:inline">
                      {careMilestoneLabel(fact)}
                    </span>
                  </span>
                )}
                {(!secondary ||
                  (!view.simulation &&
                    fact.date &&
                    ["price-window", "return-window", "warranty"].includes(
                      fact.topic,
                    ))) && (
                  <span
                    className={
                      fact.state === "upcoming"
                        ? "text-intelligence-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    {view.simulation ? " " : ""}
                    {fact.date
                      ? displayDate(fact.date)
                      : careMilestoneState(fact)}
                  </span>
                )}
                {!secondary && fact.date && fact.state !== "recorded" && (
                  <span className="text-muted-foreground">
                    {careMilestoneState(fact)}
                  </span>
                )}
                {secondary && view.simulation && (
                  <span className="sr-only">
                    {" "}
                    {fact.consumer?.status ?? fact.status}
                    {fact.date ? ` ${displayDate(fact.date)}` : ""}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
      </div>
      {next && !secondary && (
        <p className="mt-1 text-xs text-intelligence-foreground">
          Next recorded window: {careMilestoneLabel(next)} ·{" "}
          <time dateTime={next.date!}>{displayDate(next.date!)}</time> ·{" "}
          {careMilestoneState(next)} (not a coverage guarantee)
        </p>
      )}
      {selected.length > 0 && (
        <div
          data-care-focus-evidence={focused}
          className="mt-2 rounded-lg border border-intelligence-border bg-intelligence p-3 text-sm text-intelligence-foreground"
        >
          <p className="font-semibold">North ☆ · {selected[0].title}</p>
          {selected.map((fact) => (
            <p
              key={fact.id}
              data-care-focus-fact={fact.id}
              className="mt-1 leading-6"
            >
              {fact.status}. {fact.detail} {fact.provenance}.
            </p>
          ))}
          <button
            className="mt-1 min-h-11 font-semibold underline underline-offset-4"
            onClick={(event) => show(focused!, event.currentTarget)}
          >
            Review evidence & available actions
          </button>
        </div>
      )}
    </div>
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
