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
import { usePathname, useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import {
  ArrowUp,
  FileText,
  Maximize2,
  Minimize2,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "../ui/button";
import type { CareContext, Intent } from "@/lib/careos/contracts";
import { contextIdentity } from "./conversation-client";
import { useConversation } from "./use-conversation";
import { useConversationScroll } from "./use-conversation-scroll";
import { AnswerActions } from "./answer-actions";
import { PurchaseChoices } from "./purchase-choices";
import { useVisibleViewport } from "./use-visible-viewport";
import { useInsightsControl } from "../intelligence/customer-control";

type AssistantState = {
  select: (context: CareContext | null) => void;
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
}: {
  children: ReactNode;
  mode?: "fixture" | "disabled" | "responses" | "subscription" | "unavailable";
}) {
  const pathname = usePathname();
  const router = useRouter();
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
  const revision = useRef(0);
  const regular = useConversation();
  const insights = useInsightsControl();
  const analytics = pathname === "/insights";
  const { conversation, pending, phase, error, clear } = analytics
    ? insights
    : regular;
  const { restore, send } = regular;
  const check = analytics ? insights.check : regular.check;
  const [draft, setDraft] = useState("");
  const busy = phase !== "idle";
  const unavailable =
    busy ||
    !!pending ||
    (analytics && (!insights.connected || !!insights.recoverable));
  const trigger = useRef<HTMLButtonElement>(null);
  const composing = useRef(false);
  const composer = useRef<HTMLTextAreaElement>(null);
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

  const select = useCallback((value: CareContext | null) => {
    registered.current = true;
    if (JSON.stringify(contextRef.current) === JSON.stringify(value)) return;
    contextRef.current = value;
    revision.current++;
    setContext(value);
  }, []);
  async function ask(message: string, intent?: Intent, selected?: CareContext) {
    if (unavailable || !message.trim()) return false;
    if (analytics) {
      setOpen(true);
      return insights.send(message.trim());
    }
    if (selected) select(selected);
    const bound = contextRef.current;
    const boundRevision = revision.current;
    setOpen(true);
    return send(
      {
        requestId: crypto.randomUUID(),
        twinId: bound?.twinId ?? null,
        revision: boundRevision,
        message: message.trim(),
        ...(intent ? { intent } : {}),
        ...(bound?.example ? { example: bound.example } : {}),
      },
      bound,
    );
  }
  async function open() {
    setOpen(true);
    if (analytics) {
      insights.restore();
      return;
    }
    const value = await restore();
    const previous = value?.turns.at(-1)?.answer.context;
    if (!registered.current && !contextRef.current && previous)
      select(previous);
  }
  function submit() {
    if (!draft.trim() || unavailable) return;
    const submitted = draft;
    // send() admits synchronously; keep any draft typed during the request untouched.
    void ask(submitted);
    setDraft("");
    if (composer.current) composer.current.style.height = "auto";
  }

  return (
    <AssistantContext.Provider
      value={{
        select,
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
              className="careos-launcher border border-intelligence-foreground/30 bg-intelligence text-intelligence-foreground shadow-lift hover:bg-intelligence"
            >
              <Sparkles aria-hidden="true" /> Ask CareOS
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            {mobile && (
              <Dialog.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
            )}
            <Dialog.Content
              ref={panelRef}
              className={`careos-assistant ${expanded ? "careos-expanded" : ""} fixed z-[60] flex flex-col overflow-hidden border bg-card shadow-lift`}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                trigger.current?.focus();
              }}
              aria-describedby="careos-description"
            >
              <header className="careos-header intelligence-wash flex shrink-0 items-start justify-between gap-[8px] border-b">
                <div className="min-w-0">
                  <Dialog.Title className="flex items-center gap-2 text-lg font-semibold text-intelligence-foreground">
                    <span className="flex size-[32px] shrink-0 items-center justify-center rounded-xl border border-intelligence-foreground/20 bg-intelligence">
                      <Sparkles className="size-[20px]" aria-hidden="true" />
                    </span>
                    CareOS
                  </Dialog.Title>
                  <Dialog.Description
                    id="careos-description"
                    className="sr-only mt-1 text-sm text-muted-foreground sm:not-sr-only"
                  >
                    Your purchase companion
                  </Dialog.Description>
                  <p className="mt-1 text-xs font-medium text-intelligence-foreground">
                    {mode === "fixture"
                      ? "Demo · no live AI"
                      : mode === "subscription"
                        ? "Using ChatGPT plan"
                        : mode === "responses"
                          ? "Live model enabled · answers cite sources"
                          : mode === "disabled"
                            ? "Model disabled · saved records only"
                            : "Model configuration unavailable"}
                  </p>
                  {mode === "subscription" && (
                    <a
                      href="https://chatgpt.com/settings/usage"
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline"
                      title="Private GPT-6.1 Sol · medium reasoning"
                    >
                      Manage ChatGPT usage
                    </a>
                  )}
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
                  <Dialog.Close asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-[44px] shrink-0"
                      aria-label="Close CareOS"
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </Dialog.Close>
                </div>
              </header>
              <div className="careos-context flex shrink-0 items-center justify-between border-b bg-accent/50 text-xs">
                <span className="min-w-0 text-muted-foreground">
                  <span className="sr-only">Discussing </span>
                  <strong className="block break-words text-sm text-foreground">
                    {analytics
                      ? "Your purchases · Personal Insights"
                      : context
                        ? `${context.name} · ${context.model}`
                        : "Choose a purchase"}
                  </strong>
                  {analytics ? (
                    <span>
                      Presentation only · this conversation stays in this tab
                    </span>
                  ) : (
                    context && (
                      <span>
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
                    )
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 px-[8px] py-[8px]"
                  asChild
                >
                  <Link href="/vault" onClick={() => mobile && setOpen(false)}>
                    Switch
                  </Link>
                </Button>
              </div>
              <div
                ref={attach}
                onScroll={onScroll}
                className="careos-transcript min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                aria-label="CareOS conversation"
                role="region"
                tabIndex={0}
              >
                {!conversation?.turns.length && !pending && (
                  <div className="rounded-2xl bg-intelligence p-5">
                    <h2 className="text-xl font-semibold">
                      Less searching.
                      <br />
                      More taking care.
                    </h2>
                    <p className="mt-3 text-base leading-7 text-muted-foreground">
                      Find a receipt, understand a purchase, or explore guidance
                      from its available documents.
                    </p>
                  </div>
                )}
                {conversation?.turns.map((turn, index) => (
                  <article
                    key={turn.requestId}
                    data-request-id={turn.requestId}
                    className="space-y-3"
                  >
                    {((index === 0 &&
                      contextIdentity(turn.answer.context) !==
                        contextIdentity(context)) ||
                      (index > 0 &&
                        contextIdentity(
                          conversation.turns[index - 1].answer.context,
                        ) !== contextIdentity(turn.answer.context))) && (
                      <p className="border-t pt-3 text-xs text-muted-foreground">
                        {turn.answer.context
                          ? `${turn.answer.context.name} · ${turn.answer.context.model} · ${turn.answer.context.example ? "Reference example" : turn.answer.context.origin === "sandbox" ? "Sandbox" : "Sample"}`
                          : "General assistance"}
                      </p>
                    )}
                    <p
                      data-user-message
                      className="careos-user-message whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-secondary text-base leading-7 text-secondary-foreground"
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
                            ? "CareOS unavailable · no answer generated"
                            : turn.answer.mode === "fixture"
                              ? "Demo response · no live AI"
                              : turn.answer.mode === "live"
                                ? "Live AI · check sources"
                                : "From saved records · no model call"}
                        </p>
                        <p>{turn.answer.text}</p>
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
                            index === conversation.turns.length - 1
                          }
                          onContinue={(choice) => {
                            if (unavailable || !choice.context.twinId) return;
                            focusTranscript();
                            // This is a deliberate new, differently scoped question—not a replay.
                            // The original selection result and its request identity remain unchanged.
                            void ask(turn.message, undefined, choice.context);
                            router.push(`/vault/${choice.context.twinId}`, {
                              scroll: false,
                            });
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
                      {analytics && insights.recoverable === turn.requestId && (
                        <Button
                          disabled={busy}
                          onClick={() => void insights.applySaved()}
                        >
                          Apply saved view
                        </Button>
                      )}
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
                          ? "Your question wasn’t sent. Clear this conversation to start again."
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
                              ? "CareOS could not finish this answer. Your question is saved."
                              : "CareOS answer ready. Review the answer and sources above."
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
                <div className="careos-quick-actions mb-3 flex flex-wrap gap-2">
                  {(analytics
                    ? [
                        ["Show my purchases", "summary"],
                        ["Which purchases have documents?", "documents"],
                        ["Show my purchases by category", "summary"],
                      ]
                    : [
                        ["Find receipt", "receipt"],
                        ["Purchase summary", "summary"],
                        ["Product care", "care"],
                      ]
                  ).map(([label, intent]) => (
                    <button
                      type="button"
                      key={label}
                      disabled={unavailable}
                      className="min-h-11 rounded-xl border px-3 text-xs font-medium text-intelligence-foreground hover:bg-intelligence focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                      onClick={() => void ask(label, intent as Intent)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <form
                  className="flex items-end gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                  }}
                >
                  <label className="sr-only" htmlFor="careos-message">
                    Ask about your purchase
                  </label>
                  <textarea
                    ref={composer}
                    id="careos-message"
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
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
                    placeholder="Ask about your purchase…"
                    className="max-h-36 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-input bg-background px-[12px] py-[10px] text-base focus-visible:outline-2 focus-visible:outline-ring"
                  />
                  <Button
                    type="submit"
                    className="shrink-0 px-[12px] py-[10px]"
                    disabled={unavailable || !draft.trim()}
                    aria-label="Send to CareOS"
                  >
                    <ArrowUp className="hidden sm:block" aria-hidden="true" />
                    <span>Send</span>
                  </Button>
                </form>
                <div className="careos-composer-note mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>Demo only. No personal information.</span>
                  {analytics && pending && (
                    <button
                      type="button"
                      className="min-h-11 underline"
                      onClick={insights.cancel}
                    >
                      Stop request
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    className="min-h-11 min-w-11 shrink-0 rounded-lg px-2 text-sm underline focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() => void clear()}
                  >
                    Clear
                  </button>
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
  const { select } = useCareOS();
  useEffect(() => {
    select(context);
  }, [context, select]);
  return null;
}
export function AskCareOS({
  context,
  children = "Ask about this product",
}: {
  context?: CareContext;
  children?: ReactNode;
}) {
  const assistant = useCareOS();
  return (
    <Button
      variant="outline"
      onClick={() => {
        if (context) assistant.select(context);
        assistant.open();
      }}
    >
      <Sparkles aria-hidden="true" />
      {children}
    </Button>
  );
}
