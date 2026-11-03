"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import {
  ArrowUp,
  FileText,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  ChevronDown,
  X,
} from "lucide-react";
import { Button } from "../ui/button";
import type { CareContext, Intent } from "@/lib/careos/contracts";
import { useConversation } from "./use-conversation";
import { RecordsResultView } from "./records-result";
import {
  recordsTaskCandidate,
  resolveRecordsQuery,
} from "@/lib/careos/records/query";
import { useConversationScroll } from "./use-conversation-scroll";
import { AnswerActions } from "./answer-actions";
import { PurchaseChoices } from "./purchase-choices";
import { ContextPicker } from "./context-picker";
import { AssistantName } from "../assistant-name";
import {
  assistantSuggestions,
  ASSISTANT_SPOKEN_NAME,
} from "@/lib/assistant-identity";
import {
  interactionKey,
  readInteraction,
  mergeAssistantTurns,
} from "./interaction-state";
import { displayDate } from "@/lib/demo/presentation";
import { questionUsesInsights } from "@/lib/careos/interaction-limits";
import { useVisibleViewport } from "./use-visible-viewport";
import { useInsightsControl } from "../intelligence/customer-control";
import { evaluationWindowExpired } from "@/lib/careos/window";
import { browserAccessMessage } from "./browser-access-state";
import {
  ownerSendState,
  ownerSendMessage,
  ownerStatusSchema,
  type OwnerSendState,
} from "./owner-status";

type AssistantState = {
  select: (context: CareContext | null) => void;
  register: (context: CareContext | null) => void;
  open: () => void;
  ask: (message: string, intent?: Intent, context?: CareContext) => void;
};
const AssistantContext = createContext<AssistantState | null>(null);
export function useCareOS() {
  const value = useContext(AssistantContext);
  if (!value) throw new Error("CareOS host is missing.");
  return value;
}
export function CareOSProvider({
  children,
  mode = "fixture",
  aiExpiresAt,
  aiAccessDisabled = false,
  ownerAccess = false,
  conversationalAI = false,
}: {
  children: ReactNode;
  mode?: "fixture" | "disabled" | "responses" | "subscription" | "unavailable";
  aiExpiresAt?: number;
  aiAccessDisabled?: boolean;
  ownerAccess?: boolean;
  conversationalAI?: boolean;
}) {
  const [clock, setClock] = useState(0);
  const aiExpired =
    aiExpiresAt !== undefined && (clock === 0 || clock >= aiExpiresAt);
  useEffect(() => {
    if (aiExpiresAt === undefined) return;
    const tick = () => setClock(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, [aiExpiresAt]);
  const pathname = usePathname();
  const visible =
    /^\/(dashboard|vault|documents|guardian|safety|replacements|insights)(\/|$)/.test(
      pathname,
    );
  const [isOpen, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [context, setContext] = useState<CareContext | null>(null);
  const contextRef = useRef<CareContext | null>(null);
  const registered = useRef(false);
  const explicitContext = useRef(false);
  const [contextExplicit, setContextExplicit] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [dismissedChoices, setDismissedChoices] = useState<string[]>([]);
  const [submittedOrder, setSubmittedOrder] = useState<string[]>([]);
  const [presentationLoaded, setPresentationLoaded] = useState(false);
  const loadedPresentation = useRef(false);
  const [discoveryNotice, setDiscoveryNotice] = useState("");
  // In-memory submission identity only: restored history never auto-executes SDK actions.
  const [recordsSubmission, setRecordsSubmission] = useState<string | null>(
    null,
  );
  const revision = useRef(0);
  const regular = useConversation();
  const records = useConversation("records");
  const insights = useInsightsControl();
  const registerDeparture = insights.registerDeparture;
  useEffect(
    () => registerDeparture(() => setRecordsSubmission(null)),
    [registerDeparture],
  );
  const analytics = pathname === "/insights";
  const turns = mergeAssistantTurns(
    [
      ...(regular.conversation?.turns ?? []),
      ...(records.conversation?.turns ?? []),
    ],
    insights.conversation?.turns ?? [],
    submittedOrder,
  );
  const conversation = turns.length ? { turns } : null;
  const pending = records.pending ?? regular.pending ?? insights.pending;
  const phase =
    records.phase !== "idle"
      ? records.phase
      : regular.phase !== "idle"
        ? regular.phase
        : insights.phase;
  const error = records.error || regular.error || insights.error;
  async function clear() {
    if (
      records.phase !== "idle" ||
      regular.phase !== "idle" ||
      insights.phase !== "idle"
    )
      return;
    insights.cancelRecords();
    setRecordsSubmission(null);
    await records.clear();
    await regular.clear();
    await insights.clear();
  }
  const { restore, send } = regular;
  const check = records.pending
    ? records.check
    : regular.pending
      ? regular.check
      : insights.check;
  const [draft, setDraft] = useState("");
  const busy = phase !== "idle";
  const [ownerState, setOwnerState] = useState<OwnerSendState>("checking");
  const [finishNeeded, setFinishNeeded] = useState(false);
  const [browserMessage, setBrowserMessage] = useState("");
  const checkOwnerAccess = useCallback(async () => {
    if (!ownerAccess) return true;
    try {
      const response = await fetch("/api/ai/owner", { cache: "no-store" });
      const value: unknown = response.ok ? await response.json() : null;
      const state = response.ok ? ownerSendState(value) : "unavailable";
      const parsed = ownerStatusSchema.safeParse(value);
      setBrowserMessage(
        parsed.success && parsed.data.browserAccess
          ? browserAccessMessage[parsed.data.browserAccess]
          : "",
      );
      setFinishNeeded(
        parsed.success &&
          parsed.data.remembered &&
          parsed.data.browserCompletion === "finish-needed",
      );
      setOwnerState(state);
      return state === "ready";
    } catch {
      setOwnerState("unavailable");
      return false;
    }
  }, [ownerAccess]);
  useEffect(() => {
    if (!ownerAccess || !isOpen) return;
    const focus = () => {
      void checkOwnerAccess();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("palcare-owner-status", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      window.removeEventListener("focus", focus);
      window.removeEventListener("palcare-owner-status", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [ownerAccess, isOpen, checkOwnerAccess]);
  const interactionBlocked = aiAccessDisabled || aiExpired || busy || !!pending;
  const unavailable =
    interactionBlocked || (ownerAccess && ownerState !== "ready");
  const plannerBlocked =
    analytics &&
    questionUsesInsights(draft, !!context) &&
    (!insights.connected || !!insights.recoverable);
  const recordsHistory = records.conversation?.turns ?? [];
  const recordsTopicStart = recordsHistory.findLastIndex(
    (t) => t.answer.recordsTopic === "reset",
  );
  const ownedPreviousQuery = [...recordsHistory.slice(recordsTopicStart + 1)]
    .reverse()
    .find((t) => t.answer.recordsResult)?.answer.recordsResult?.query;
  const lastReply = turns.at(-1)?.answer;
  const lastReplyWasPurchase =
    !!lastReply?.context &&
    !lastReply.recordsResult &&
    lastReply.questionScope !== "library";
  const conversationalReady =
    conversationalAI &&
    !aiAccessDisabled &&
    !aiExpired &&
    (!ownerAccess || ownerState === "ready");
  const recordDraft =
    conversationalReady ||
    recordsTaskCandidate(draft, ownedPreviousQuery, lastReplyWasPurchase);
  const submitBlocked = recordDraft
    ? busy || !!pending
    : unavailable || plannerBlocked;
  const trigger = useRef<HTMLButtonElement>(null);
  const composing = useRef(false);
  const admitting = useRef(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const contextTrigger = useRef<HTMLButtonElement>(null);
  const panelRef = useVisibleViewport();
  const latest = conversation?.turns.at(-1);
  const { attach, onScroll, showJump, jump, focusTranscript } =
    useConversationScroll(
      pending?.input.requestId ?? latest?.requestId,
      !pending,
    );

  useEffect(() => {
    const media = matchMedia("(max-width: 1023px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!isOpen || !visible || expanded) return;
    document.documentElement.classList.add("careos-reading-space");
    return () =>
      document.documentElement.classList.remove("careos-reading-space");
  }, [isOpen, visible, expanded]);

  const updateContext = useCallback((value: CareContext | null) => {
    registered.current = true;
    if (JSON.stringify(contextRef.current) === JSON.stringify(value)) return;
    contextRef.current = value;
    revision.current++;
    setContext(value);
  }, []);
  const register = useCallback(
    (value: CareContext | null) => {
      if (value && !explicitContext.current) updateContext(value);
    },
    [updateContext],
  );
  function loadPresentation() {
    if (loadedPresentation.current) return;
    loadedPresentation.current = true;
    try {
      const saved = readInteraction(sessionStorage.getItem(interactionKey));
      if (saved) {
        setDraft(saved.draft);
        setSubmittedOrder(saved.order ?? []);
        setDismissedChoices(saved.dismissed ?? []);
        if (saved.explicit || !registered.current) {
          explicitContext.current = saved.explicit;
          setContextExplicit(saved.explicit);
          updateContext(saved.context);
        }
      }
    } catch {
      /* Optional fictional, per-tab presentation hint. */
    }
    setPresentationLoaded(true);
  }
  function select(value: CareContext | null) {
    loadPresentation();
    insights.cancelRecords();
    setRecordsSubmission(null);
    explicitContext.current = true;
    setContextExplicit(true);
    updateContext(value);
    setDismissedChoices((prior) => [
      ...prior,
      ...turns
        .filter((turn) => turn.answer.outcome === "selection")
        .map((turn) => turn.requestId),
    ]);
  }
  useEffect(() => {
    if (!presentationLoaded) return;
    try {
      sessionStorage.setItem(
        interactionKey,
        JSON.stringify({
          version: 1,
          context,
          explicit: contextExplicit,
          order: submittedOrder.slice(-80),
          dismissed: dismissedChoices.slice(-80),
          draft,
          savedAt: Date.now(),
        }),
      );
    } catch {
      /* Keep in-memory drafts/context when storage is unavailable. */
    }
  }, [
    context,
    contextExplicit,
    submittedOrder,
    dismissedChoices,
    draft,
    presentationLoaded,
  ]);
  async function ask(message: string, intent?: Intent, selected?: CareContext) {
    loadPresentation();
    if (admitting.current || busy || pending || !message.trim()) return false;
    let liveAdmission = false;
    if (conversationalAI && !aiAccessDisabled && !aiExpired) {
      admitting.current = true;
      try {
        liveAdmission = await checkOwnerAccess();
      } finally {
        admitting.current = false;
      }
    }
    const savedRecords =
      liveAdmission ||
      (!intent &&
        !selected &&
        recordsTaskCandidate(
          message,
          ownedPreviousQuery,
          lastReplyWasPurchase,
        ));
    if (
      admitting.current ||
      (savedRecords
        ? busy || !!pending
        : interactionBlocked || evaluationWindowExpired(aiExpiresAt)) ||
      !message.trim()
    )
      return false;
    setOpen(true);
    if (selected) select(selected);
    const bound = contextRef.current;
    const boundRevision = revision.current;
    const history = records.conversation?.turns ?? [];
    const topicStart = history.findLastIndex(
      (t) => t.answer.recordsTopic === "reset",
    );
    const previousQuery = [...history.slice(topicStart + 1)]
      .reverse()
      .find((t) => t.answer.recordsResult)?.answer.recordsResult?.query;
    const deterministicQuery = savedRecords
      ? resolveRecordsQuery(
          message,
          new Date().toISOString().slice(0, 10),
          previousQuery,
        )
      : null;
    // A submitted saved-record question may need the protected interpreter.
    // This is an admission hint only; server-owned history/auth/validation wins.
    const modelInterpretation =
      savedRecords &&
      (liveAdmission ||
        (deterministicQuery && "clarification" in deterministicQuery)) &&
      mode === "subscription" &&
      !aiExpired &&
      !aiAccessDisabled &&
      (liveAdmission || !ownerAccess || ownerState === "ready");
    const planning =
      !savedRecords &&
      analytics &&
      questionUsesInsights(message, !!bound, !!selected || !!intent);
    if (planning && (!insights.connected || insights.recoverable)) return false;
    admitting.current = true;
    try {
      if ((!savedRecords || modelInterpretation) && !(await checkOwnerAccess()))
        return false;
      const requestId = crypto.randomUUID();
      insights.cancelRecords();
      setRecordsSubmission(savedRecords ? requestId : null);
      setSubmittedOrder((prior) => [...prior, requestId]);
      setDiscoveryNotice("");
      setDismissedChoices((prior) => [
        ...prior,
        ...turns
          .filter((t) => t.answer.outcome === "selection")
          .map((t) => t.requestId),
      ]);
      if (savedRecords)
        return await records.send(
          {
            requestId,
            twinId: bound?.twinId ?? null,
            revision: boundRevision,
            message: message.trim(),
            ...(intent ? { intent } : {}),
          },
          bound,
          modelInterpretation ? "interpret" : "turns",
          (turn) => {
            if (
              !conversationalAI ||
              !turn.answer.conversationPlan ||
              turn.answer.revision !== revision.current
            )
              return;
            if (
              turn.answer.context ||
              (turn.answer.questionScope === "library" &&
                turn.answer.conversationPlan.relation === "fresh")
            ) {
              explicitContext.current = true;
              setContextExplicit(true);
              updateContext(turn.answer.context);
            }
          },
        );
      if (planning) {
        setOpen(true);
        return await insights.send(message.trim(), requestId);
      }
      setOpen(true);
      return await send(
        {
          requestId,
          twinId: bound?.twinId ?? null,
          revision: boundRevision,
          message: message.trim(),
          ...(intent ? { intent } : {}),
          ...(bound?.example ? { example: bound.example } : {}),
        },
        bound,
      );
    } finally {
      admitting.current = false;
    }
  }
  async function open() {
    loadPresentation();
    setOpen(true);
    // This GET-only channel has its own cookie/owner namespace. Restoring saved
    // records neither reads private AI history nor issues an inference grant.
    void records.restore(false);
    if (conversationalAI) {
      await checkOwnerAccess();
      return;
    }
    if (!(await checkOwnerAccess())) return;
    if (aiAccessDisabled || evaluationWindowExpired(aiExpiresAt)) return;
    void insights.restore();
    const value = await restore(!analytics);
    const previous = value?.turns.at(-1)?.answer.context;
    if (!registered.current && !contextRef.current && previous)
      select(previous);
  }
  function submit() {
    if (!draft.trim() || submitBlocked) return;
    const submitted = draft;
    // An authorization/restoration rejection must never erase an unsent draft.
    // Also retain any different draft typed while the admitted request is pending.
    void ask(submitted).then((admitted) => {
      if (!admitted) return;
      setDraft((current) => (current === submitted ? "" : current));
      if (composer.current?.value === submitted)
        composer.current.style.height = "auto";
    });
  }

  return (
    <AssistantContext.Provider
      value={{
        select,
        register,
        open: () => void open(),
        ask: (m, i, c) => void ask(m, i, c),
      }}
    >
      {children}
      {visible && (
        <Dialog.Root
          open={isOpen}
          onOpenChange={(value) => (value ? void open() : setOpen(false))}
          modal={mobile}
        >
          <Dialog.Trigger asChild>
            <Button
              ref={trigger}
              variant="intelligence"
              className="careos-launcher shadow-lift"
            >
              Ask <AssistantName />
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            {mobile && (
              <Dialog.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
            )}
            <Dialog.Content
              ref={panelRef}
              className={`careos-assistant ${expanded ? "careos-expanded" : ""} fixed z-[60] flex flex-col overflow-clip border bg-card shadow-lift`}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                trigger.current?.focus();
              }}
              aria-describedby="careos-description"
            >
              <div className="careos-header flex shrink-0 items-center justify-between gap-2 border-b bg-card">
                <div className="min-w-0">
                  <Dialog.Title className="flex items-center gap-2 text-lg font-semibold text-intelligence-foreground">
                    <AssistantName />
                  </Dialog.Title>
                  <Dialog.Description
                    id="careos-description"
                    className="sr-only"
                  >
                    Pal Care’s purchase assistant. Ask about all saved purchases
                    immediately, or optionally choose a product for care.
                    Selection and expansion never send a question.
                  </Dialog.Description>
                </div>
                <div className="flex gap-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-[44px] shrink-0"
                    aria-label={
                      expanded ? "Compact assistant" : "Expand assistant"
                    }
                    onClick={() => setExpanded(!expanded)}
                  >
                    {expanded ? (
                      <Minimize2 aria-hidden="true" />
                    ) : (
                      <Maximize2 aria-hidden="true" />
                    )}
                  </Button>
                  <details
                    className="relative"
                    onKeyDown={(event) => {
                      if (event.key === "Escape" && event.currentTarget.open) {
                        event.stopPropagation();
                        event.currentTarget.open = false;
                        event.currentTarget.querySelector("summary")?.focus();
                      }
                    }}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("button, a"))
                        event.currentTarget.open = false;
                    }}
                  >
                    <summary
                      aria-label="North Star options"
                      className="flex size-11 cursor-pointer list-none items-center justify-center rounded-xl hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </summary>
                    <div className="absolute top-full right-0 z-10 w-[min(16rem,calc(100vw-3rem))] space-y-1 rounded-xl border bg-card p-3 text-sm shadow-lift">
                      <p className="mb-2 text-muted-foreground">
                        {mode === "fixture"
                          ? "Demo · no live AI"
                          : mode === "subscription"
                            ? "Using ChatGPT plan"
                            : mode === "responses"
                              ? "Model assistance · check sources"
                              : "Model unavailable"}
                      </p>
                      {(mode === "subscription" || mode === "responses") && (
                        <Link
                          href="/ai-evaluation"
                          onClick={() => setOpen(false)}
                          className="flex min-h-11 items-center rounded-lg px-2 text-primary underline"
                        >
                          {ownerAccess ? "AI access" : "Testing access"}
                        </Link>
                      )}
                      {mode === "subscription" && (
                        <a
                          href="https://chatgpt.com/settings/usage"
                          target="_blank"
                          rel="noreferrer"
                          className="flex min-h-11 items-center rounded-lg px-2 text-primary underline"
                        >
                          Manage ChatGPT usage
                        </a>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void clear()}
                        className="min-h-11 w-full min-w-0 max-w-full rounded-lg px-2 text-left whitespace-normal underline [overflow-wrap:anywhere] disabled:opacity-50"
                      >
                        Clear conversation history
                      </button>
                      <p className="text-xs text-muted-foreground">
                        Clearing never resets usage or removes purchases.
                      </p>
                    </div>
                  </details>
                  <Dialog.Close asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-[44px] shrink-0"
                      aria-label="Close North Star"
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </Dialog.Close>
                </div>
              </div>
              <div
                className="careos-context flex min-h-0 shrink items-center justify-between border-b bg-accent/30 text-xs"
                aria-label="Persistent purchase context"
                role="region"
                tabIndex={0}
              >
                <span className="min-w-0 text-muted-foreground">
                  <span className="block text-xs">
                    {context ? "Purchase context" : "Ask across your library"}
                  </span>
                  <strong className="block break-words text-sm text-foreground">
                    {context
                      ? `${context.name} · ${context.model}`
                      : "All saved purchases"}
                  </strong>
                  {context && (
                    <span>
                      {context.purchasedOn && (
                        <>{displayDate(context.purchasedOn)} · </>
                      )}
                      {context.origin === "sandbox"
                        ? "Verified Sandbox purchase"
                        : context.example
                          ? "Fictional ownership example · no purchase"
                          : "Sample purchase"}{" "}
                      {context.twinId && (
                        <span className="hidden sm:inline">
                          · PC-{context.twinId.slice(-6).toUpperCase()}
                        </span>
                      )}
                    </span>
                  )}
                  {!context && <span>Choosing a product is optional.</span>}
                </span>
                <div className="flex shrink-0 items-center">
                  <Button
                    ref={contextTrigger}
                    variant="ghost"
                    size="sm"
                    className="shrink-0 px-[8px] py-[8px]"
                    onClick={() => setContextOpen(true)}
                  >
                    Change <ChevronDown className="size-4" aria-hidden="true" />
                  </Button>
                  {context && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove purchase context"
                      onClick={() => select(null)}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>
              {contextOpen && (
                <ContextPicker
                  open={contextOpen}
                  onOpenChange={setContextOpen}
                  onSelect={select}
                  returnFocus={contextTrigger}
                />
              )}
              <div
                ref={attach}
                onScroll={onScroll}
                className="careos-transcript min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                aria-label="North Star conversation"
                role="region"
                tabIndex={0}
              >
                {aiExpired && (
                  <p
                    role="status"
                    className="rounded-xl border bg-warning-surface p-4 text-sm text-warning"
                  >
                    The AI authorization window has ended. Your purchases,
                    documents and native Insights still work. No renewal or
                    model request is performed automatically.
                  </p>
                )}
                {ownerAccess && ownerState === "ready" && finishNeeded && (
                  <p
                    role="status"
                    className="rounded-xl border p-3 text-sm text-muted-foreground"
                  >
                    This browser is verified for this visit.{" "}
                    <Link
                      href="/ai-evaluation"
                      onClick={() => setOpen(false)}
                      className="inline-flex min-h-11 items-center font-semibold text-primary underline"
                    >
                      Finish remembering this browser
                    </Link>{" "}
                    to stay connected on future visits.
                  </p>
                )}
                {ownerAccess && ownerState !== "ready" && (
                  <div
                    className="space-y-2 rounded-xl border bg-warning-surface p-4 text-sm text-warning"
                    role="status"
                    aria-label="Browser AI access"
                  >
                    <p>{ownerSendMessage[ownerState]}</p>
                    {ownerState === "signin" && browserMessage && (
                      <p>{browserMessage}</p>
                    )}
                    <Link
                      href="/ai-evaluation"
                      onClick={() => setOpen(false)}
                      className="inline-flex min-h-11 items-center font-semibold underline"
                    >
                      Open AI access
                    </Link>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void open()}
                    >
                      Check AI access
                    </Button>
                  </div>
                )}
                {!conversation?.turns.length &&
                  !pending &&
                  !regular.unsent.length && (
                    <div className="space-y-4 py-2" data-north-discovery>
                      <h2 className="text-xl font-semibold">
                        What would you like to know?
                      </h2>
                      <p className="text-base leading-7 text-muted-foreground">
                        Find receipts, explore saved purchases, or get guidance
                        for a product.
                      </p>
                      <div
                        className="grid gap-2"
                        aria-label="Optional starting questions"
                      >
                        {assistantSuggestions.map((suggestion, index) => (
                          <button
                            type="button"
                            key={suggestion}
                            className="min-h-11 rounded-xl border border-input bg-card px-3 py-3 text-left text-sm leading-6 hover:bg-intelligence focus-visible:outline-2 focus-visible:outline-ring"
                            onClick={() => {
                              if (index < 3) {
                                if (!draft.trim()) setDraft(suggestion);
                                composer.current?.focus();
                              } else if (!context) setContextOpen(true);
                              else {
                                if (!draft.trim())
                                  setDraft("Help me care for this product.");
                                composer.current?.focus();
                              }
                            }}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                {discoveryNotice && (
                  <div
                    role="status"
                    className="space-y-2 rounded-xl border bg-accent/40 p-3 text-sm text-muted-foreground"
                  >
                    <p>{discoveryNotice}</p>
                    <Link
                      className="inline-flex min-h-11 items-center text-primary underline"
                      href="/insights"
                    >
                      Explore saved records in Insights
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDiscoveryNotice("")}
                    >
                      Dismiss
                    </Button>
                  </div>
                )}
                {conversation?.turns.map((turn, index) => (
                  <article
                    key={turn.requestId}
                    data-request-id={turn.requestId}
                    className="space-y-3"
                  >
                    <p
                      data-answer-scope
                      className="border-t pt-3 text-xs text-muted-foreground"
                    >
                      Question scope:{" "}
                      {turn.answer.questionScope === "library"
                        ? turn.answer.recordsResult
                          ? "saved-purchase library · filters and coverage below"
                          : "all saved purchases · answer not yet supported"
                        : turn.answer.outcome === "selection"
                          ? "purchase choice needed"
                          : turn.answer.context
                            ? `${turn.answer.context.name} · ${turn.answer.context.model}${turn.answer.context.purchasedOn ? ` · ${displayDate(turn.answer.context.purchasedOn)}` : ""} · ${turn.answer.context.example ? "Reference example" : turn.answer.context.origin === "sandbox" ? "Sandbox" : "Sample"}${turn.answer.context.twinId ? ` · PC-${turn.answer.context.twinId.slice(-6).toUpperCase()}` : ""}`
                            : insights.conversation?.turns.some(
                                  (t) => t.requestId === turn.requestId,
                                )
                              ? "saved-purchase view · Personal Insights"
                              : "no purchase used"}
                    </p>
                    <p
                      data-user-message
                      className="careos-user-message whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent text-base leading-7 text-foreground"
                    >
                      {turn.message}
                    </p>
                    <div
                      data-latest-answer={
                        !pending && index === conversation.turns.length - 1
                          ? ""
                          : undefined
                      }
                      className="space-y-3"
                    >
                      <div className="careos-answer text-base leading-7">
                        <p className="mb-2 inline-flex rounded-full bg-intelligence px-2 py-1 text-xs leading-5 font-medium text-intelligence-foreground">
                          {turn.answer.outcome === "unavailable"
                            ? "North Star unavailable · no answer generated"
                            : turn.answer.mode === "fixture"
                              ? "Demo response · no live AI"
                              : turn.answer.mode === "live"
                                ? turn.answer.conversationPlan
                                  ? "Live AI understanding · saved-data tools"
                                  : "Live AI · check sources"
                                : "From saved records · no model call"}
                        </p>
                        <p>{turn.answer.text}</p>
                        {turn.answer.recordsResult && (
                          <RecordsResultView
                            result={turn.answer.recordsResult}
                            autoApply={recordsSubmission === turn.requestId}
                            onAutoApplyStarted={() =>
                              setRecordsSubmission((current) =>
                                current === turn.requestId ? null : current,
                              )
                            }
                            onNavigate={() => {
                              insights.cancelRecords();
                              setRecordsSubmission(null);
                              if (mobile) setOpen(false);
                            }}
                          />
                        )}
                        {turn.answer.resolution && (
                          <details className="mt-3 rounded-xl border px-3">
                            <summary className="cursor-pointer py-2 font-medium">
                              What happens next
                            </summary>
                            <dl className="space-y-2 pb-3">
                              {(
                                [
                                  ["Known", "known"],
                                  ["Missing", "missing"],
                                  ["Next step", "next"],
                                  ["Finished when", "finished"],
                                ] as const
                              ).map(([label, key]) => (
                                <div key={key}>
                                  <dt className="font-semibold">{label}</dt>
                                  <dd>{turn.answer.resolution![key]}</dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        )}
                        {!!turn.answer.steps.length && (
                          <ul className="mt-3 list-disc space-y-2 pl-5">
                            {turn.answer.steps.map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      {turn.answer.outcome === "selection" &&
                      turn.answer.purchaseChoices?.length ? (
                        <PurchaseChoices
                          choices={turn.answer.purchaseChoices}
                          active={
                            !unavailable &&
                            !dismissedChoices.includes(turn.requestId) &&
                            index === conversation.turns.length - 1
                          }
                          onDismiss={() => {
                            setDismissedChoices((prior) => [
                              ...prior,
                              turn.requestId,
                            ]);
                            composer.current?.focus();
                          }}
                          onChoose={(choice) => {
                            if (unavailable || !choice.context.twinId) return;
                            focusTranscript();
                            // This is a deliberate new, differently scoped question—not a replay.
                            // The original selection result and its request identity remain unchanged.
                            void ask(turn.message, undefined, choice.context);
                          }}
                        />
                      ) : (
                        <AnswerActions
                          actions={turn.answer.actions}
                          onNavigate={() => {
                            if (mobile) setOpen(false);
                          }}
                        />
                      )}
                      {insights.recoverable === turn.requestId &&
                        (insights.connected ? (
                          <Button
                            disabled={busy}
                            onClick={() => void insights.applySaved()}
                          >
                            Apply saved view
                          </Button>
                        ) : (
                          <Link
                            href="/insights"
                            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline"
                          >
                            Return to Insights to apply saved view
                          </Link>
                        ))}
                      {!!turn.answer.sources.length && (
                        <details className="rounded-xl border bg-accent/40 px-3 text-sm text-muted-foreground">
                          <summary className="min-h-11 cursor-pointer py-3">
                            <FileText
                              className="mr-2 inline size-3.5"
                              aria-hidden="true"
                            />
                            Sources ({turn.answer.sources.length})
                          </summary>
                          <ul className="space-y-4 pb-4">
                            {turn.answer.sources.map((source) => (
                              <li key={source.id}>
                                <Link
                                  className="font-medium text-primary underline"
                                  href={source.href}
                                  onClick={() => mobile && setOpen(false)}
                                >
                                  {source.title}
                                </Link>
                                <p className="mt-1">{source.label}</p>
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
                ))}
                {regular.unsent.map((question) => (
                  <article
                    key={question.input.requestId}
                    data-unsent-question
                    className="space-y-3 rounded-xl border p-3"
                  >
                    <p
                      data-user-message
                      className="whitespace-pre-wrap break-words text-base"
                    >
                      {question.input.message}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      This question wasn’t sent. You can edit it or ask a new
                      question; your saved conversation is unchanged.
                    </p>
                    <Button
                      variant="outline"
                      disabled={unavailable || !!draft.trim()}
                      title={
                        draft.trim()
                          ? "Your current draft is kept. Send or edit it before choosing another question."
                          : undefined
                      }
                      onClick={() => {
                        select(question.context);
                        setDraft(question.input.message);
                        composer.current?.focus();
                      }}
                    >
                      Edit unsent question
                    </Button>
                  </article>
                ))}
                {pending && (
                  <article
                    data-pending-question
                    data-request-id={pending.input.requestId}
                    className="space-y-3"
                  >
                    <p className="border-t pt-3 text-xs text-muted-foreground">
                      {pending.context
                        ? `${pending.context.name} · ${pending.context.model} · ${pending.context.example ? "Reference example" : pending.context.origin === "sandbox" ? "Sandbox" : "Sample"}`
                        : "General assistance"}
                    </p>
                    <p
                      data-user-message
                      className="careos-user-message whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-secondary text-base leading-7 text-secondary-foreground"
                    >
                      {pending.input.message}
                    </p>
                    <p className="flex items-center gap-2 text-base text-muted-foreground">
                      {pending.status === "sending" && (
                        <span
                          aria-hidden="true"
                          className="size-2 shrink-0 rounded-full bg-intelligence-foreground"
                        />
                      )}
                      {pending.status === "sending"
                        ? "Preparing your answer…"
                        : pending.status === "not-sent"
                          ? "This question wasn’t sent. Your draft is kept; check your connection and try again."
                          : "No confirmed answer yet. Your question will not be sent again automatically."}
                    </p>
                    {pending.status !== "sending" &&
                      (pending.conversationId || analytics) && (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            focusTranscript();
                            void check();
                          }}
                        >
                          Check for saved answer
                        </Button>
                      )}
                  </article>
                )}
                <p role="status" aria-atomic="true" className="sr-only">
                  {phase === "sending"
                    ? "Question received. Preparing your answer."
                    : phase === "restoring"
                      ? "Restoring your conversation."
                      : phase === "checking"
                        ? "Checking for a saved answer."
                        : pending
                          ? "No confirmed answer yet. Your question has not been resent."
                          : conversation?.turns.length
                            ? latest?.answer.outcome === "unavailable"
                              ? "North Star could not finish this answer. Your question is saved."
                              : "North Star answer ready. Review the answer and sources above."
                            : ""}
                </p>
                {error && (
                  <p
                    role="alert"
                    className="rounded-xl bg-warning-surface p-3 text-sm text-warning"
                  >
                    {error}
                  </p>
                )}
              </div>
              {showJump && (
                <div className="flex shrink-0 justify-center border-t bg-card py-1">
                  <Button size="sm" variant="outline" onClick={jump}>
                    Jump to latest
                  </Button>
                </div>
              )}
              <div className="careos-composer shrink-0 border-t bg-card">
                <p className="mb-2 text-xs text-muted-foreground">
                  {conversationalReady
                    ? "Live AI · saved-data tools"
                    : recordDraft
                      ? "Limited saved-record mode · no model call"
                      : aiExpired
                        ? "AI access expired · saved records remain available in Purchases and Insights"
                        : aiAccessDisabled
                          ? "AI access unavailable · saved records remain available"
                          : ownerAccess && ownerState !== "ready"
                            ? ownerSendMessage[ownerState]
                            : plannerBlocked
                              ? insights.recoverable
                                ? "A saved view is ready to review in Insights. You can still ask a product question."
                                : "Interactive Insights is not connected yet. Your draft is kept."
                              : analytics
                                ? "Personal Insights · presentation only"
                                : mode === "fixture"
                                  ? "Sample demo · no live AI"
                                  : mode === "subscription"
                                    ? "Using ChatGPT plan"
                                    : mode === "responses"
                                      ? "Model assistance · check sources"
                                      : "Model unavailable"}
                </p>
                <form
                  className="flex items-end gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                  }}
                >
                  <label className="sr-only" htmlFor="careos-message">
                    Ask about your purchases
                  </label>
                  <textarea
                    ref={composer}
                    id="careos-message"
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setDismissedChoices((prior) => [
                        ...new Set([
                          ...prior,
                          ...turns
                            .filter((t) => t.answer.outcome === "selection")
                            .map((t) => t.requestId),
                        ]),
                      ]);
                      e.target.style.height = "auto";
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 144)}px`;
                    }}
                    onCompositionStart={() => {
                      composing.current = true;
                    }}
                    onCompositionEnd={() => {
                      composing.current = false;
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key !== "Enter" ||
                        event.shiftKey ||
                        event.nativeEvent.isComposing ||
                        composing.current ||
                        event.keyCode === 229
                      )
                        return;
                      event.preventDefault();
                      if (!event.repeat) submit();
                    }}
                    maxLength={analytics ? 500 : 2000}
                    rows={1}
                    placeholder="Ask about your purchases…"
                    className="max-h-36 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-intelligence-border bg-background px-[12px] py-[10px] text-base focus-visible:outline-2 focus-visible:outline-intelligence-foreground"
                  />
                  <Button
                    type="submit"
                    variant="intelligence"
                    className="shrink-0 px-[12px] py-[10px]"
                    disabled={submitBlocked || !draft.trim()}
                    aria-label="Send to North Star"
                  >
                    <ArrowUp className="hidden sm:block" aria-hidden="true" />
                    <span>Send</span>
                  </Button>
                </form>
                <div className="careos-composer-note mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>Demo only. No personal information.</span>
                  {insights.pending && (
                    <button
                      type="button"
                      className="min-h-11 underline"
                      onClick={insights.cancel}
                    >
                      Stop request
                    </button>
                  )}
                  {busy && <span>Working… your next draft is kept.</span>}
                </div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </AssistantContext.Provider>
  );
}

export function CareContextRegistration({
  context,
}: {
  context: CareContext | null;
}) {
  const { register } = useCareOS();
  useEffect(() => {
    register(context);
  }, [context, register]);
  return null;
}
export function AskCareOS({
  context,
  label,
  children,
}: {
  context?: CareContext;
  label?: string;
  children?: ReactNode;
}) {
  const assistant = useCareOS();
  return (
    <Button
      variant="outline"
      aria-label={
        label?.replace(/CareOS|North ☆/g, ASSISTANT_SPOKEN_NAME) ??
        (!children && context
          ? "Ask North Star about this purchase"
          : undefined)
      }
      className="max-w-full flex-wrap border-intelligence-foreground bg-intelligence text-intelligence-foreground hover:bg-intelligence/80"
      onClick={() => {
        if (context) assistant.select(context);
        assistant.open();
      }}
    >
      {children ?? (
        <>
          Ask <AssistantName />
        </>
      )}
    </Button>
  );
}
