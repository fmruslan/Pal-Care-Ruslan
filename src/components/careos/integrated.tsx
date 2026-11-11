"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUp,
  FileText,
  History,
  Minus,
  Search,
  X,
} from "lucide-react";
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
import { useVisibleViewport } from "./use-visible-viewport";
import { useConversationScroll } from "./use-conversation-scroll";

export type IntegratedNorthState = {
  isOpen: boolean;
  screen: "start" | "chat" | "history";
  setScreen: (screen: "start" | "chat" | "history") => void;
  newChat: () => void;
  chats: Array<{
    id: string;
    title: string;
    preview: string;
    context: CareContext | null;
    updatedAt: number;
  }>;
  activeChatId: string | null;
  chooseChat: (id: string) => void;
  minimized: boolean;
  minimize: () => void;
  restorePanel: () => void;
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

/** Contextual entry only; the root provider owns the single floating panel. */
export function NorthWorkspaceSlot() {
  const assistant = useOptionalCareOS();
  const pathname = usePathname();
  return assistant?.integrated &&
    !["/dashboard", "/purchases", "/documents"].includes(pathname) ? (
    <div className="my-3">
      <Button
        variant="intelligence"
        onClick={assistant.open}
        aria-label="Ask North Star"
      >
        Ask <AssistantName />
      </Button>
    </div>
  ) : null;
}

export function NorthCollection({ children }: { children: ReactNode }) {
  return <>{children}</>;
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
  // Page search is independent of the panel's prepared question/follow-up draft.
  const text = value;
  const submit = (forceSearch = false) => {
    if (!text.trim()) return;
    if (forceSearch || isLiteralLibrarySearch(text, searchIndex) || !north) {
      north?.navigate();
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
          disabled={!!text.trim() && (north?.busy || !!north?.pending)}
          onClick={() => {
            if (text.trim() && north) {
              setValue("");
              north.setDraft(text);
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
          Still waiting on an earlier question. You can search saved purchases
          and documents, or check History. North won’t resend it automatically.
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
          aria-label={north?.isOpen ? "Browse previous chats" : "History"}
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

const startSuggestions = [
  "Which purchases have warranty details?",
  "What needs my attention?",
  "Find a receipt",
  "Explain this price comparison",
] as const;

export function IntegratedNorthView({
  state: s,
}: {
  state: IntegratedNorthState;
}) {
  const pathname = usePathname();
  const [pickerOpen, setPickerOpen] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const contextTrigger = useRef<HTMLButtonElement>(null);
  const panelRef = useVisibleViewport();
  const panel = useRef<HTMLElement | null>(null);
  const restore = useRef<HTMLButtonElement | null>(null);
  const composing = useRef(false);
  const attachPanel = useCallback(
    (node: HTMLElement | null) => {
      panel.current = node;
      return panelRef(node);
    },
    [panelRef],
  );
  useEffect(() => {
    if (!s.isOpen || s.minimized) composing.current = false;
    if (!s.isOpen) return;
    const opener = document.activeElement;
    const frame = requestAnimationFrame(() => {
      // An early edit or underlying-page interaction wins over delayed opening
      // focus. In particular, never interrupt WebKit's focused text insertion.
      const focused = document.activeElement;
      const target = s.minimized ? restore.current : panel.current;
      if (
        target?.contains(focused) ||
        (focused !== opener && focused !== document.body)
      )
        return;
      target?.focus({
        preventScroll: true,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [s.isOpen, s.minimized]);
  useEffect(() => {
    if (!s.isOpen || s.minimized) return;
    const frame = requestAnimationFrame(() => {
      const focused = document.activeElement;
      if (!focused || focused === document.body || !focused.isConnected)
        panel.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [s.screen, s.isOpen, s.minimized]);
  const active = s.activeId
    ? s.turns.find((t) => t.requestId === s.activeId)
    : s.turns.at(-1);
  const unavailableResult = !!s.activeId && !active && !s.pending && !s.busy;
  // The coordinator supplies this chat's owned turns. Selecting an older result
  // reads only through that anchor; it never re-executes its saved actions.
  const visibleTurns = active
    ? s.turns.slice(0, s.turns.indexOf(active) + 1)
    : [];
  const scroll = useConversationScroll(
    s.screen === "chat"
      ? (s.pending?.input.requestId ?? active?.requestId)
      : undefined,
    !s.pending,
  );
  function prepareQuestion(message: string) {
    s.setDraft(message);
    s.setScreen("chat");
    requestAnimationFrame(() =>
      composer.current?.focus({ preventScroll: true }),
    );
  }
  if (!s.isOpen) return null;
  if (s.minimized)
    return (
      <Button
        ref={restore}
        variant="intelligence"
        className="north-panel-restore shadow-lift"
        onClick={s.restorePanel}
        aria-label="Restore North Star"
      >
        <AssistantName />
        {s.pending && <span className="text-xs">Question pending</span>}
      </Button>
    );
  return (
    <section
      ref={attachPanel}
      role="dialog"
      aria-modal="false"
      aria-label="North Star"
      aria-describedby="north-panel-description"
      tabIndex={-1}
      className="north-floating-panel careos-assistant"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !pickerOpen) {
          e.preventDefault();
          s.close();
        }
      }}
    >
      <header className="north-panel-header" role="presentation">
        <div className="north-panel-topbar">
          <button
            type="button"
            className="min-h-[44px] min-w-0 rounded-xl px-[4px] text-base font-semibold text-intelligence-foreground"
            onClick={() => s.setScreen("start")}
            aria-label="North Star start"
          >
            <AssistantName />
          </button>
          <div className="flex shrink-0 items-center">
            {s.screen === "chat" && (
              <button
                type="button"
                className="north-panel-icon"
                onClick={(event) => {
                  s.setHistoryOpen(!s.historyOpen);
                  if (!s.historyOpen) {
                    const body = event.currentTarget
                      .closest("[role=dialog]")
                      ?.querySelector(".north-panel-body");
                    requestAnimationFrame(() => {
                      if (body) body.scrollTop = 0;
                    });
                  }
                }}
                aria-label="History"
                aria-expanded={s.historyOpen}
              >
                <History className="size-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              aria-label="Minimize North Star"
              onClick={s.minimize}
              className="north-panel-icon"
            >
              <Minus className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Close North Star"
              onClick={s.close}
              className="north-panel-icon"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
        {s.screen !== "start" && (
          <div className="north-panel-chat-actions grid grid-cols-2 gap-1 px-1">
            <button
              type="button"
              className="min-h-[44px] min-w-0 rounded-lg px-[8px] py-[6px] text-xs font-medium hover:bg-accent"
              onClick={s.newChat}
            >
              New chat
            </button>
            <button
              type="button"
              className="min-h-[44px] min-w-0 rounded-lg px-[8px] py-[6px] text-xs font-medium hover:bg-accent"
              onClick={s.openHistory}
            >
              Previous chats
            </button>
          </div>
        )}
      </header>
      <p id="north-panel-description" className="sr-only">
        Your purchase assistant. The page remains available while North is open.
        Preparing a question or opening a chat does not send it.
      </p>
      <div
        ref={s.screen === "chat" ? scroll.attach : undefined}
        onScroll={s.screen === "chat" ? scroll.onScroll : undefined}
        className="north-panel-body careos-transcript"
        role="region"
        aria-label={
          s.screen === "chat"
            ? "North Star conversation"
            : s.screen === "history"
              ? "Previous North chats"
              : "North start"
        }
        tabIndex={0}
      >
        {s.screen === "start" && (
          <section className="north-panel-start">
            <span aria-hidden="true" className="north-start-star">
              ☆
            </span>
            <h2 className="text-2xl font-semibold tracking-tight">
              Hi! I’m North ☆
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Your purchase assistant. Ask a question, or pick up a past
              conversation.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="intelligence" onClick={s.newChat}>
                New chat
              </Button>
              <Button variant="outline" onClick={s.openHistory}>
                Previous chats
              </Button>
            </div>
            <h3 className="text-sm font-semibold">Try a question</h3>
            <ul
              className="north-start-suggestions"
              aria-label="Question suggestions"
            >
              {startSuggestions.map((message) => (
                <li key={message}>
                  <button
                    type="button"
                    onClick={() => prepareQuestion(message)}
                  >
                    {message}
                    <ArrowUp className="size-4 shrink-0" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Suggestions prepare a question. Send when you’re ready.
            </p>
          </section>
        )}
        {s.screen === "history" && (
          <section aria-label="Previous chats" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Previous chats</h2>
              <Button
                variant="ghost"
                onClick={() => {
                  s.setScreen(s.activeChatId ? "chat" : "start");
                  panel.current?.focus({ preventScroll: true });
                }}
              >
                <ArrowLeft className="size-4" aria-hidden="true" /> Back
              </Button>
            </div>
            {!s.chats.length && (
              <p className="text-sm text-muted-foreground">
                Your conversations will appear here after you ask North a
                question.
              </p>
            )}
            <ol className="space-y-1">
              {s.chats.map((chat) => (
                <li key={chat.id}>
                  <button
                    type="button"
                    onClick={() => {
                      s.chooseChat(chat.id);
                      panel.current?.focus({ preventScroll: true });
                    }}
                    className="north-history-chat"
                    aria-current={
                      s.activeChatId === chat.id ? "true" : undefined
                    }
                  >
                    <span className="block font-semibold">{chat.title}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {chat.preview}
                    </span>
                    {chat.context && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {chat.context.name} · {chat.context.model}
                        {chat.context.purchasedOn && (
                          <> · {displayDate(chat.context.purchasedOn)}</>
                        )}
                        {" · "}
                        {chat.context.origin === "sandbox"
                          ? "Verified Sandbox"
                          : "Example purchase"}
                      </span>
                    )}
                    <time
                      className="mt-2 block text-xs text-muted-foreground"
                      dateTime={new Date(chat.updatedAt).toISOString()}
                    >
                      {displayDate(new Date(chat.updatedAt).toISOString())}
                    </time>
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
                      ? "AI assistance · check sources"
                      : "AI connection unavailable"}
                . Clearing history keeps your purchases and doesn’t restore your
                AI allowance.
              </p>
            </details>
          </section>
        )}
        {s.screen !== "history" && (
          <div className="space-y-5">
            {s.screen === "chat" && s.historyOpen && (
              <section
                aria-label="Previous North results"
                className="rounded-xl border bg-card p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">History</h2>
                  <button
                    type="button"
                    onClick={s.openHistory}
                    className="min-h-11 text-sm text-primary underline"
                  >
                    Previous chats
                  </button>
                </div>
                {!s.turns.length && (
                  <p className="text-sm text-muted-foreground">
                    Your answers will appear here after you ask North a
                    question.
                  </p>
                )}
                <ol className="space-y-1">
                  {s.turns.map((turn) => (
                    <li key={turn.requestId}>
                      <button
                        type="button"
                        className="min-h-11 w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-accent"
                        aria-current={
                          s.activeId === turn.requestId ? "true" : undefined
                        }
                        onClick={() => {
                          s.choose(turn.requestId);
                          panel.current?.focus({ preventScroll: true });
                          s.setHistoryOpen(false);
                          requestAnimationFrame(scroll.jump);
                        }}
                      >
                        {turn.message}
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            {(s.expired ||
              s.accessDisabled ||
              (s.ownerAccess && s.ownerState !== "ready")) && (
              <div
                role="status"
                aria-label="Browser AI access"
                className="rounded-xl border bg-warning-surface p-3 text-sm text-warning"
              >
                <p>
                  {s.expired
                    ? "North’s AI access has expired."
                    : s.accessDisabled
                      ? "North’s AI connection is unavailable."
                      : ownerSendMessage[s.ownerState]}
                </p>
                <details open={s.screen === "chat"}>
                  <summary className="min-h-11 cursor-pointer py-3 text-xs">
                    Saved records and AI access options
                  </summary>
                  <p>
                    You can still browse saved purchases and documents, or
                    explore Insights yourself.
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
                </details>
              </div>
            )}
            {s.screen === "chat" && unavailableResult && (
              <>
                <h2 className="sr-only">Saved result unavailable</h2>
                <p
                  role="status"
                  className="rounded-xl border bg-card p-4 text-sm"
                >
                  This answer is no longer available. Try another answer in
                  History. North hasn’t resent the question or changed your
                  view.
                </p>
              </>
            )}
            {s.screen === "chat" &&
              !active &&
              !s.pending &&
              !unavailableResult && (
                <div className="rounded-2xl border bg-card p-4">
                  <h2 className="text-lg font-semibold">
                    How can I help with your purchases?
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Find a receipt, explore saved purchases, or ask for product
                    care. I’ll use the records and sources available here.
                  </p>
                </div>
              )}
            {s.screen === "chat" &&
              visibleTurns.map((turn) => {
                const active = turn;
                const answer = turn.answer;
                const doc = answer.careCalendarRange
                  ? undefined
                  : answer.sources.find((source) =>
                      documentPreviewId(source.href),
                    );
                return (
                  <article
                    key={active.requestId}
                    data-request-id={active.requestId}
                    className="space-y-4"
                    data-native-north-result={
                      active.requestId === visibleTurns.at(-1)?.requestId
                        ? ""
                        : undefined
                    }
                    data-answer-mode={answer!.mode}
                  >
                    <h2
                      data-user-message
                      className="north-chat-question text-base leading-6 font-medium"
                    >
                      {active.message}
                    </h2>
                    <div
                      data-latest-answer={
                        active.requestId === visibleTurns.at(-1)?.requestId
                          ? ""
                          : undefined
                      }
                      className="north-chat-answer space-y-3"
                    >
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
                              : "Saved-record answer · no live AI"}
                        </p>
                      )}
                      {answer!.context && (
                        <p
                          data-answer-scope
                          className="text-xs text-muted-foreground"
                        >
                          {answer!.context.name} · {answer!.context.model} ·{" "}
                          {answer!.context.purchasedOn &&
                            displayDate(answer!.context.purchasedOn)}{" "}
                          ·{" "}
                          {answer!.context.origin === "sandbox"
                            ? "Verified Sandbox"
                            : "Example purchase"}
                        </p>
                      )}
                      {answer!.questionScope === "library" && (
                        <p data-answer-scope className="sr-only">
                          saved-purchase library · filters and coverage below
                        </p>
                      )}
                      {doc && doc.href !== pathname && (
                        <div className="north-document-card">
                          <FileText
                            className="size-5 shrink-0 text-intelligence-foreground"
                            aria-hidden="true"
                          />
                          <span className="min-w-0">
                            <span className="block font-medium underline">
                              {doc.title}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {doc.label}
                            </span>
                            <Link
                              href={doc.href}
                              onClick={s.navigate}
                              className="mt-1 inline-flex min-h-11 items-center text-sm text-primary underline"
                            >
                              View full receipt or document
                            </Link>
                          </span>
                        </div>
                      )}
                      {answer!.recordsResult && (
                        <RecordsResultView
                          key={active.requestId}
                          requestId={active.requestId}
                          headingLevel={3}
                          presentation="panel"
                          result={answer!.recordsResult}
                          intent={answer!.recordsPresentation}
                          autoApply={s.recordsSubmission === active.requestId}
                          onAutoApplyStarted={s.consumeRecords}
                          onNavigate={s.navigate}
                          onSelectPurchase={s.select}
                        />
                      )}
                      {!!answer!.steps.length && (
                        <ul className="list-disc space-y-2 pl-5 text-base leading-7">
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
                            .filter(
                              (action) => !doc || action.href !== doc.href,
                            )
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
                          Based on saved purchase details as of{" "}
                          <time dateTime={answer!.ownershipAsOf}>
                            {displayDate(answer!.ownershipAsOf!)}
                          </time>
                          . This answer keeps the sources used at the time. Open
                          the purchase details or ask again to check the latest
                          saved facts.
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
                );
              })}
            {s.pending && (
              <article
                data-pending-question
                data-request-id={s.pending.input.requestId}
                className="space-y-3 rounded-2xl border bg-card p-5"
              >
                <h2 data-user-message className="text-base font-medium">
                  {s.pending.input.message}
                </h2>
                <p role="status">
                  {s.pending.status === "sending"
                    ? "Looking into your question…"
                    : "Your answer isn’t confirmed yet. North won’t send the question again automatically."}
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
                    composer.current?.focus({ preventScroll: true });
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
        )}
      </div>
      {s.screen === "chat" && scroll.showJump && (
        <button
          type="button"
          className="north-jump-latest"
          onClick={scroll.jump}
        >
          Jump to latest
        </button>
      )}
      <ContextPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={s.select}
        returnFocus={contextTrigger}
      />
      {s.screen !== "history" && (
        <footer className="north-panel-footer" role="presentation">
          <div
            className="north-panel-context"
            aria-label="Persistent purchase context"
            role="region"
          >
            <span className="min-w-0 text-xs text-muted-foreground">
              <strong className="font-medium text-foreground">
                {s.context
                  ? `${s.context.name} · ${s.context.model}`
                  : "All saved purchases"}
              </strong>
              {s.context?.purchasedOn && (
                <span className="block">
                  {displayDate(s.context.purchasedOn)} ·{" "}
                  {s.context.origin === "sandbox"
                    ? "Verified Sandbox"
                    : "Example purchase"}
                </span>
              )}
            </span>
            <div className="flex max-w-full flex-wrap">
              <button
                ref={contextTrigger}
                type="button"
                onClick={() => setPickerOpen(true)}
                className="min-h-11 rounded-xl px-2 text-xs text-muted-foreground"
              >
                Choose purchase
              </button>
              {s.context && (
                <button
                  type="button"
                  aria-label="Remove purchase context"
                  onClick={() => s.select(null)}
                  className="north-panel-icon"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          <div className="careos-composer rounded-2xl border border-intelligence-border bg-card">
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!composing.current && s.draft.trim() && !s.blocked) {
                  s.setScreen("chat");
                  s.submit();
                }
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
                    if (!e.repeat && s.draft.trim() && !s.blocked) {
                      s.setScreen("chat");
                      s.submit();
                    }
                  }
                }}
                rows={1}
                maxLength={2000}
                placeholder={
                  s.screen === "chat" && active
                    ? "Ask a follow-up..."
                    : "Ask North..."
                }
                className="max-h-36 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-intelligence-foreground"
              />
              <Button
                type="submit"
                variant="intelligence"
                aria-label="Send to North Star"
                disabled={s.blocked || !s.draft.trim()}
              >
                <ArrowUp className="size-4" aria-hidden="true" />
                <span className="sr-only">Send</span>
              </Button>
            </form>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {s.busy
              ? "Working on it. Your next draft stays here."
              : "Demo purchases only. Please don’t share personal information."}
          </p>
          {s.screen === "chat" &&
            s.turns.findIndex((turn) => turn.requestId === active?.requestId) >
              0 && (
              <button
                type="button"
                onClick={() => {
                  const index = s.turns.findIndex(
                    (turn) => turn.requestId === active?.requestId,
                  );
                  if (index > 0) {
                    s.choose(s.turns[index - 1].requestId);
                    requestAnimationFrame(scroll.jump);
                  }
                }}
                className="min-h-11 text-sm text-muted-foreground underline"
              >
                Previous result
              </button>
            )}
        </footer>
      )}
    </section>
  );
}
