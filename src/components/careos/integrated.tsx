"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowUp, FileText, History, Search, X } from "lucide-react";
import { useOptionalCareOS } from "./provider";
import { AssistantName } from "../assistant-name";
import { RecordsResultView } from "./records-result";
import { PurchaseChoices } from "./purchase-choices";
import { ContextPicker } from "./context-picker";
import { Button } from "../ui/button";
import { libraryHref, type LibraryQuery } from "@/lib/library-navigation";
import {
  documentPreviewId,
  isLiteralLibrarySearch,
} from "@/lib/north-presentation";
import type { CareContext, CareTurn } from "@/lib/careos/contracts";
import type { PendingQuestion } from "./conversation-client";
import { displayDate } from "@/lib/demo/presentation";
import { ownerSendMessage, type OwnerSendState } from "./owner-status";

export type IntegratedNorthState = {
  isOpen: boolean;
  ownershipNotice: string;
  ownershipNoticeFor: string | null;
  turns: CareTurn[];
  activeId: string | null;
  historyOpen: boolean;
  setHistoryOpen: (value: boolean) => void;
  openHistory: () => void;
  choose: (id: string) => void;
  close: () => void;
  open: () => void;
  draft: string;
  setDraft: (value: string) => void;
  submit: () => void;
  ask: (message: string) => void;
  pending: PendingQuestion | null;
  choiceAvailable: boolean;
  busy: boolean;
  blocked: boolean;
  error: string;
  context: CareContext | null;
  select: (context: CareContext | null) => void;
  recordsSubmission: string | null;
  consumeRecords: () => void;
  navigate: () => void;
  check: () => void;
  clear: () => void;
  unsent: PendingQuestion[];
  ownerAccess: boolean;
  ownerState: OwnerSendState;
  accessMessage: string;
  mode: string;
  expired: boolean;
  accessDisabled: boolean;
  onChoice: (message: string, context: CareContext) => void;
  dismissedChoices: string[];
  dismissChoice: (id: string) => void;
  recoverable: string | null;
  connected: boolean;
  applySaved: () => void;
};

/** One inline outlet in the existing main. The root coordinator survives routes. */
export function NorthWorkspaceSlot() {
  const assistant = useOptionalCareOS();
  const pathname = usePathname();
  return (
    <>
      <div
        id="north-workspace"
        ref={assistant?.setWorkspaceElement}
        data-north-workspace-slot
      />
      {assistant?.integrated &&
        !assistant.integrated.isOpen &&
        !["/dashboard", "/purchases", "/documents"].includes(pathname) && (
          <div className="my-5 flex flex-wrap items-center gap-3">
            <Button
              variant="intelligence"
              onClick={assistant.open}
              aria-label="Ask North Star"
            >
              Ask <AssistantName />
            </Button>
            <button
              type="button"
              onClick={assistant.integrated.openHistory}
              className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
            >
              <History className="size-4" aria-hidden="true" />
              History
            </button>
          </div>
        )}
    </>
  );
}

export function NorthCollection({ children }: { children: ReactNode }) {
  const assistant = useOptionalCareOS();
  const pathname = usePathname();
  return assistant?.integrated?.isOpen && pathname !== "/dashboard" ? null : (
    <>{children}</>
  );
}

export function NorthSearch({
  query,
  searchIndex,
  footer,
}: {
  query: LibraryQuery;
  searchIndex: string[];
  footer?: ReactNode;
}) {
  const assistant = useOptionalCareOS();
  const north = assistant?.integrated;
  const router = useRouter();
  const [value, setValue] = useState(query.q);
  const composing = useRef(false);
  const history = () => {
    north?.openHistory();
  };
  if (north?.isOpen) return null;
  const text = north?.draft || value;
  const submit = (forceSearch = false) => {
    if (!text.trim()) return;
    if (forceSearch || isLiteralLibrarySearch(text, searchIndex) || !north) {
      north?.close();
      north?.setDraft("");
      router.push(libraryHref(query, { q: text.trim(), page: 1 }));
    } else {
      if (north.busy || north.pending) {
        north.openHistory();
        return;
      }
      setValue("");
      north.setDraft(text);
      north.ask(text);
    }
  };
  return (
    <div className="mb-4" data-north-search>
      <form
        role="search"
        aria-label="Search or ask North"
        className="north-unified-search flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-intelligence-border bg-card px-3 shadow-sm focus-within:ring-2 focus-within:ring-intelligence-foreground"
        onSubmit={(e) => {
          e.preventDefault();
          if (!composing.current) submit(true);
        }}
      >
        <button
          type="submit"
          aria-label="Search"
          disabled={!text.trim()}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground disabled:opacity-40"
        >
          <Search className="size-5" aria-hidden="true" />
        </button>
        <label className="sr-only" htmlFor="library-search">
          Search products and documents
        </label>
        <input
          id="library-search"
          name="q"
          type="search"
          value={text}
          maxLength={2000}
          placeholder="Find a receipt, product, or ask North..."
          autoComplete="off"
          className="h-13 min-w-0 flex-1 bg-transparent text-base outline-none"
          onChange={(e) => {
            setValue(e.target.value);
            north?.setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.nativeEvent.isComposing &&
              !composing.current &&
              e.keyCode !== 229
            ) {
              e.preventDefault();
              if (!e.repeat) submit();
            }
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
        />
        <button
          type="button"
          aria-label="Ask North Star"
          disabled={north?.busy || !!north?.pending}
          onClick={() => {
            if (text.trim() && north) {
              setValue("");
              north.ask(text);
            } else north?.open();
          }}
          className="inline-flex min-h-11 max-w-full shrink-0 items-center justify-center gap-1 rounded-xl px-2 text-sm font-semibold text-intelligence-foreground"
        >
          <span>Ask North</span>
          <span aria-hidden="true" className="text-2xl">
            ☆
          </span>
        </button>
      </form>
      {north?.pending && (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          An earlier question is still pending. Search saved records here, or
          open History to check it; nothing is resent automatically.
        </p>
      )}
      <div
        className={
          footer
            ? "mt-3 flex flex-wrap items-center justify-between gap-2"
            : "flex justify-end"
        }
      >
        {footer}
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={history}
        >
          <History className="size-3.5" aria-hidden="true" />
          History
        </button>
      </div>
    </div>
  );
}

function DocumentPreview({
  href,
  title,
  label,
  headingLevel,
}: {
  href: string;
  title: string;
  label: string;
  headingLevel: 2 | 3;
}) {
  const PreviewHeading = headingLevel === 2 ? "h2" : "h3";
  const id = documentPreviewId(href);
  const [content, setContent] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    void fetch(`/api/documents/${id}/download`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (
          !response.ok ||
          !response.headers.get("content-type")?.startsWith("text/plain")
        )
          throw Error("preview_unavailable");
        const text = await response.text();
        if (text.length > 65536) throw Error("preview_too_large");
        if (!controller.signal.aborted) setContent(text);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [id]);
  if (!id) return null;
  return (
    <section
      className="north-document-preview grid gap-5 rounded-2xl border bg-card p-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] sm:p-6"
      aria-label="Receipt and document preview"
    >
      <div className="min-w-0 rounded-xl border bg-background p-5 shadow-sm">
        {content !== null ? (
          <pre
            aria-label="Document contents"
            className="font-sans text-sm leading-7 whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
          >
            {content}
          </pre>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            {failed
              ? "Preview unavailable. Open the original saved document below."
              : "Loading your saved document…"}
          </p>
        )}
      </div>
      <div className="flex min-w-0 flex-col items-start justify-center gap-3">
        <FileText className="size-8 text-primary" aria-hidden="true" />
        <PreviewHeading className="text-lg font-semibold">
          {title}
        </PreviewHeading>
        <p className="text-sm text-muted-foreground">{label}</p>
        <Button asChild>
          <Link href={href}>View full receipt or document</Link>
        </Button>
        <Button asChild variant="outline">
          <a href={`/api/documents/${id}/download`}>Download text</a>
        </Button>
      </div>
    </section>
  );
}

export function IntegratedNorthView({
  state: s,
}: {
  state: IntegratedNorthState;
}) {
  const pathname = usePathname();
  // Care retains its page heading/cards beside North; collection routes replace
  // their collection. Keep one page-level heading through recovery and History.
  const collectionPage = ["/purchases", "/documents"].includes(pathname);
  const QuestionHeading = collectionPage ? "h1" : "h2";
  const historyOpen = s.historyOpen,
    setHistoryOpen = s.setHistoryOpen;
  const [pickerOpen, setPickerOpen] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const contextTrigger = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLElement>(null);
  const composing = useRef(false);
  const active = s.activeId
    ? s.turns.find((t) => t.requestId === s.activeId)
    : s.turns.at(-1);
  const PendingHeading = active ? "h2" : QuestionHeading;
  const unavailableResult = !!s.activeId && !active && !s.pending && !s.busy;
  const answer = active?.answer;
  const doc = answer?.careCalendarRange
    ? undefined
    : answer?.sources.find((source) => documentPreviewId(source.href));
  useEffect(() => {
    root.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, []);
  useEffect(() => {
    // Focus only deliberate entry, not each delayed answer. This avoids
    // reopening a mobile keyboard or stealing focus from someone reading.
    if (!s.pending && !s.recordsSubmission)
      composer.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <section
      ref={root}
      role="dialog"
      aria-modal="false"
      aria-label="North Star"
      tabIndex={-1}
      className="north-inline-workspace careos-assistant my-4 min-w-0 scroll-mt-5"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !pickerOpen) {
          e.preventDefault();
          s.close();
        }
      }}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div className="text-lg font-semibold text-intelligence-foreground">
          <AssistantName />
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-muted-foreground"
            onClick={() => setHistoryOpen(!historyOpen)}
            aria-expanded={historyOpen}
          >
            <History className="size-4" aria-hidden="true" />
            History
          </button>
          <button
            type="button"
            aria-label="Close North Star"
            onClick={s.close}
            className="inline-flex size-11 items-center justify-center rounded-xl"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
      </header>
      {historyOpen && (
        <section
          aria-label="Previous North results"
          className="mb-5 rounded-2xl border bg-card p-4"
        >
          <h2 className="mb-3 font-semibold">History</h2>
          {!s.turns.length && (
            <p className="text-sm text-muted-foreground">
              No saved results yet. Ask a question below.
            </p>
          )}
          <ol className="space-y-1">
            {s.turns.map((turn) => (
              <li key={turn.requestId}>
                <button
                  type="button"
                  onClick={() => {
                    s.choose(turn.requestId);
                    setHistoryOpen(false);
                    composer.current?.focus({ preventScroll: true });
                  }}
                  className="min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                  aria-current={
                    active?.requestId === turn.requestId ? "true" : undefined
                  }
                >
                  {turn.message}
                </button>
              </li>
            ))}
          </ol>
          <details className="mt-3 border-t pt-3">
            <summary className="min-h-11 cursor-pointer text-sm">
              Conversation settings
            </summary>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/ai-evaluation"
                className="inline-flex min-h-11 items-center text-sm text-primary underline"
              >
                AI access
              </Link>
              <button
                type="button"
                disabled={s.busy}
                onClick={s.clear}
                className="min-h-11 text-sm underline"
              >
                Clear conversation history
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {s.mode === "fixture"
                ? "Demo · no live AI"
                : s.mode === "subscription"
                  ? "Using ChatGPT plan"
                  : s.mode === "responses"
                    ? "Model assistance · check sources"
                    : "Model unavailable"}
              . Clearing never resets usage or removes purchases.
            </p>
          </details>
        </section>
      )}
      <div
        className="careos-context mb-4 flex flex-wrap items-center justify-between gap-2 text-sm"
        aria-label="Persistent purchase context"
        role="region"
      >
        <span className="text-muted-foreground">
          <strong className="font-medium text-foreground">
            {s.context
              ? `${s.context.name} · ${s.context.model}`
              : "All saved purchases"}
          </strong>
          {s.context?.purchasedOn && (
            <span className="ml-2 text-xs">
              {displayDate(s.context.purchasedOn)} ·{" "}
              {s.context.origin === "sandbox" ? "Verified Sandbox" : "Sample"}
            </span>
          )}
        </span>
        <div className="flex">
          <button
            ref={contextTrigger}
            type="button"
            onClick={() => setPickerOpen(true)}
            className="min-h-11 px-3 text-sm text-muted-foreground"
          >
            Change context
          </button>
          {s.context && (
            <button
              type="button"
              aria-label="Remove purchase context"
              onClick={() => s.select(null)}
              className="size-11"
            >
              <X className="mx-auto size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <ContextPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={s.select}
        returnFocus={contextTrigger}
      />
      <div
        className="careos-transcript space-y-5"
        role="region"
        aria-label="North Star conversation"
        tabIndex={0}
      >
        {(s.expired ||
          s.accessDisabled ||
          (s.ownerAccess && s.ownerState !== "ready")) && (
          <div
            role="status"
            aria-label="Browser AI access"
            className="rounded-xl border bg-warning-surface p-4 text-sm text-warning"
          >
            <p>
              {s.expired
                ? "AI access expired. Saved purchases, documents and Insights remain available."
                : s.accessDisabled
                  ? "AI access is unavailable. Saved records remain available."
                  : ownerSendMessage[s.ownerState]}
            </p>
            {s.accessMessage && <p>{s.accessMessage}</p>}
            <Link
              href="/ai-evaluation"
              className="inline-flex min-h-11 items-center underline"
            >
              Open AI access
            </Link>
            <button
              type="button"
              className="min-h-11 px-3 underline"
              onClick={s.open}
            >
              Check AI access
            </button>
          </div>
        )}
        {unavailableResult && (
          <>
            <QuestionHeading className="sr-only">
              Saved result unavailable
            </QuestionHeading>
            <p role="status" className="rounded-xl border bg-card p-4 text-sm">
              This saved result is no longer available. Choose an available
              result from History; nothing was resent or applied.
            </p>
          </>
        )}
        {!active && !s.pending && !unavailableResult && (
          <div className="rounded-2xl border bg-card p-5">
            <QuestionHeading className="text-xl font-semibold">
              What would you like to find?
            </QuestionHeading>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask for a receipt, explore your purchases, or get care guidance.
              Your results appear here.
            </p>
          </div>
        )}
        {active && (
          <article
            data-request-id={active.requestId}
            className="space-y-4"
            data-native-north-result
            data-answer-mode={answer!.mode}
          >
            <QuestionHeading
              data-user-message
              className="text-xl leading-8 font-semibold tracking-tight sm:text-2xl"
            >
              {active.message}
            </QuestionHeading>
            <div data-latest-answer="" className="space-y-4">
              <p className="careos-answer text-base leading-7">
                {answer!.text}
              </p>
              {(answer!.mode !== "live" ||
                answer!.outcome === "unavailable") && (
                <p className="text-xs text-muted-foreground">
                  {answer!.outcome === "unavailable"
                    ? "North could not finish this answer."
                    : answer!.mode === "fixture"
                      ? "Demo response · no live AI"
                      : "From saved records · no model call"}
                </p>
              )}
              {answer!.context && (
                <p data-answer-scope className="text-xs text-muted-foreground">
                  {answer!.context.name} · {answer!.context.model} ·{" "}
                  {answer!.context.purchasedOn &&
                    displayDate(answer!.context.purchasedOn)}{" "}
                  ·{" "}
                  {answer!.context.origin === "sandbox"
                    ? "Verified Sandbox"
                    : "Sample"}
                  {answer!.context.twinId &&
                    ` · PC-${answer!.context.twinId.slice(-6).toUpperCase()}`}
                </p>
              )}
              {answer!.questionScope === "library" && (
                <p data-answer-scope className="sr-only">
                  saved-purchase library · filters and coverage below
                </p>
              )}
              {doc && doc.href !== pathname && (
                <DocumentPreview
                  key={doc.href}
                  headingLevel={collectionPage ? 2 : 3}
                  href={doc.href}
                  title={doc.title}
                  label={doc.label}
                />
              )}
              {answer!.recordsResult && (
                <RecordsResultView
                  key={active.requestId}
                  requestId={active.requestId}
                  headingLevel={collectionPage ? 2 : 3}
                  presentation="inline"
                  result={answer!.recordsResult}
                  intent={answer!.recordsPresentation}
                  autoApply={s.recordsSubmission === active.requestId}
                  onAutoApplyStarted={s.consumeRecords}
                  onNavigate={s.navigate}
                />
              )}
              {!!answer!.steps.length && (
                <ul className="list-disc space-y-3 pl-6 text-base leading-7">
                  {answer!.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              )}
              {answer!.resolution && (
                <details className="rounded-xl border bg-card p-4">
                  <summary className="min-h-11 cursor-pointer font-medium">
                    Care details and limitations
                  </summary>
                  <dl className="space-y-3">
                    {(
                      [
                        ["Known", "known"],
                        ["Missing", "missing"],
                        ["Next step", "next"],
                        ["Finished when", "finished"],
                      ] as const
                    ).map(([name, key]) => (
                      <div key={key}>
                        <dt className="font-medium">{name}</dt>
                        <dd className="text-sm text-muted-foreground">
                          {answer!.resolution![key]}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
              {answer!.outcome === "selection" &&
              answer!.purchaseChoices?.length ? (
                <PurchaseChoices
                  choices={answer!.purchaseChoices}
                  active={
                    s.choiceAvailable &&
                    active.requestId === s.turns.at(-1)?.requestId &&
                    !s.dismissedChoices.includes(active.requestId)
                  }
                  onDismiss={() => {
                    s.dismissChoice(active.requestId);
                    composer.current?.focus({ preventScroll: true });
                  }}
                  onChoose={(choice) =>
                    s.onChoice(active.message, choice.context)
                  }
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {answer!.actions
                    .filter((action) => !doc || action.href !== doc.href)
                    .map((action) => (
                      <Button
                        asChild
                        variant="outline"
                        key={`${action.href}:${action.label}`}
                      >
                        <Link href={action.href} onClick={s.navigate}>
                          {action.label}
                        </Link>
                      </Button>
                    ))}
                </div>
              )}
              {s.recoverable === active.requestId &&
                (s.connected ? (
                  <Button onClick={s.applySaved} disabled={s.busy}>
                    Apply saved view
                  </Button>
                ) : (
                  <Link
                    href="/insights"
                    className="inline-flex min-h-11 items-center text-primary underline"
                  >
                    Return to Insights to apply saved view
                  </Link>
                ))}
              {answer!.ownershipAsOf && (
                <p className="text-xs leading-6 text-muted-foreground">
                  Ownership answer as of{" "}
                  <time dateTime={answer!.ownershipAsOf}>
                    {displayDate(answer!.ownershipAsOf!)}
                  </time>
                  . Earlier answers keep their original evidence; open the
                  milestone or ask again for current saved facts.
                </p>
              )}
              {s.ownershipNotice &&
                s.ownershipNoticeFor === active.requestId && (
                  <p
                    role="status"
                    className="text-sm leading-6 text-intelligence-foreground"
                  >
                    {s.ownershipNotice}
                  </p>
                )}
              {!!answer!.sources.length && (
                <details className="rounded-xl border bg-card px-4 text-sm">
                  <summary className="min-h-11 cursor-pointer py-3">
                    Sources ({answer!.sources.length})
                  </summary>
                  <ul className="space-y-4 pb-4">
                    {answer!.sources.map((source) => (
                      <li key={source.id}>
                        <Link
                          href={source.href}
                          className="font-medium text-primary underline"
                          onClick={s.navigate}
                        >
                          {source.title}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {source.label}
                        </p>
                        {source.excerpt && (
                          <blockquote className="mt-2 border-l-2 pl-3 leading-6">
                            {source.excerpt}
                          </blockquote>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </article>
        )}
        {s.pending && (
          <article
            data-pending-question
            data-request-id={s.pending.input.requestId}
            className="space-y-3 rounded-2xl border bg-card p-5"
          >
            <PendingHeading data-user-message className="text-xl font-semibold">
              {s.pending.input.message}
            </PendingHeading>
            <p role="status">
              {s.pending.status === "sending"
                ? "Preparing your result…"
                : "No confirmed result yet. Your question will not be sent again automatically."}
            </p>
            {s.pending.status !== "sending" && (
              <Button variant="outline" onClick={s.check} disabled={s.busy}>
                Check for saved answer
              </Button>
            )}
          </article>
        )}
        {s.unsent.map((question) => (
          <article
            key={question.input.requestId}
            data-unsent-question
            className="rounded-xl border p-4"
          >
            <p>{question.input.message}</p>
            <p className="text-sm text-muted-foreground">
              This question wasn’t sent. Your saved history is unchanged.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                s.select(question.context);
                s.setDraft(question.input.message);
                composer.current?.focus();
              }}
              disabled={!!s.draft.trim()}
            >
              Edit unsent question
            </Button>
          </article>
        ))}
        {s.error && (
          <p
            role="alert"
            className="rounded-xl bg-warning-surface p-4 text-sm text-warning"
          >
            {s.error}
          </p>
        )}
      </div>
      <div className="careos-composer mt-6 rounded-2xl border bg-card p-3 sm:p-4">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!composing.current) s.submit();
          }}
        >
          <label className="sr-only" htmlFor="careos-message">
            Ask about your purchases
          </label>
          <textarea
            ref={composer}
            id="careos-message"
            value={s.draft}
            onChange={(e) => {
              s.setDraft(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 144)}px`;
            }}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                !composing.current &&
                e.keyCode !== 229
              ) {
                e.preventDefault();
                if (!e.repeat) s.submit();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Ask a follow-up..."
            className="max-h-36 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-intelligence-foreground"
          />
          <Button
            type="submit"
            variant="intelligence"
            aria-label="Send to North Star"
            disabled={s.blocked || !s.draft.trim()}
          >
            <ArrowUp className="size-4" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Send</span>
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          {s.busy
            ? "Working… your next draft is kept."
            : "Demo only. No personal information."}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={s.close}
          className="inline-flex min-h-11 items-center gap-2 text-sm text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to your products
        </button>
        {s.turns.length > 1 && (
          <button
            type="button"
            onClick={() => {
              const index = s.turns.findIndex(
                (turn) => turn.requestId === active?.requestId,
              );
              if (index > 0) s.choose(s.turns[index - 1].requestId);
            }}
            className="min-h-11 text-sm text-muted-foreground underline"
          >
            Previous result
          </button>
        )}
      </div>
    </section>
  );
}
