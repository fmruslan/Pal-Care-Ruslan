"use client";

import {
  createContext,
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
  ArrowUpRight,
  FileText,
  Maximize2,
  Minimize2,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "../ui/button";
import type {
  CareContext,
  CareTurn,
  Conversation,
  Intent,
} from "@/lib/careos/contracts";

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
const storageKey = "palcare-careos-conversation";
class CareHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/careos/conversations${path}`, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok)
    throw new CareHttpError(
      response.status,
      response.status === 429
        ? "CareOS has reached its demo limit. Please try later; your documents are still available."
        : response.status === 409
          ? "An answer is already being prepared. Please wait before trying again."
          : "CareOS is temporarily unavailable. You can still open your purchases and documents directly.",
    );
  return response.json() as Promise<T>;
}

export function CareOSProvider({
  children,
  mode = "fixture",
}: {
  children: ReactNode;
  mode?: "fixture" | "disabled" | "responses" | "subscription" | "unavailable";
}) {
  const pathname = usePathname();
  const visible =
    /^\/(dashboard|vault|documents|guardian|safety|replacements)(\/|$)/.test(
      pathname,
    );
  const [isOpen, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [context, setContext] = useState<CareContext | null>(null);
  const contextRef = useRef<CareContext | null>(null);
  const registered = useRef(false);
  const revision = useRef(0);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const conversationRef = useRef<Conversation | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const initializing = useRef<Promise<Conversation> | null>(null);

  useEffect(() => {
    const media = matchMedia("(max-width: 1023px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  function save(value: Conversation) {
    conversationRef.current = value;
    setConversation(value);
    try {
      sessionStorage.setItem(storageKey, value.id);
    } catch {
      /* Navigation still works without browser storage. */
    }
  }
  function select(value: CareContext | null) {
    registered.current = true;
    if (JSON.stringify(contextRef.current) === JSON.stringify(value)) return;
    contextRef.current = value;
    revision.current++;
    setContext(value);
  }
  async function ensureConversation() {
    if (conversationRef.current) return conversationRef.current;
    if (initializing.current) return initializing.current;
    initializing.current = (async () => {
      let id: string | null = null;
      try {
        id = sessionStorage.getItem(storageKey);
      } catch {
        /* Optional. */
      }
      let value: Conversation;
      if (id && /^[a-f0-9-]{36}$/.test(id)) {
        try {
          value = await api<Conversation>(`/${id}`);
        } catch (error) {
          if (!(error instanceof CareHttpError) || error.status !== 404)
            throw error;
          value = await api<Conversation>("", "POST", {});
        }
      } else value = await api<Conversation>("", "POST", {});
      save(value);
      const previous = value.turns.at(-1)?.answer.context;
      if (!registered.current && !contextRef.current && previous)
        select(previous);
      return value;
    })();
    try {
      return await initializing.current;
    } finally {
      initializing.current = null;
    }
  }
  async function ask(message: string, intent?: Intent, selected?: CareContext) {
    if (busyRef.current) return;
    if (selected) select(selected);
    const bound = contextRef.current;
    const boundRevision = revision.current;
    setOpen(true);
    setError("");
    setBusy(true);
    busyRef.current = true;
    try {
      const current = await ensureConversation();
      const turn = await api<CareTurn>(`/${current.id}/turns`, "POST", {
        requestId: crypto.randomUUID(),
        twinId: bound?.twinId ?? null,
        revision: boundRevision,
        message,
        ...(intent ? { intent } : {}),
        ...(bound?.example ? { example: bound.example } : {}),
      });
      // Every answer keeps its original product, even if navigation changed mid-request.
      save({ ...current, turns: [...current.turns, turn] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "CareOS is unavailable.");
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  async function open() {
    setOpen(true);
    setError("");
    try {
      await ensureConversation();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function clear() {
    if (busyRef.current) return;
    try {
      if (conversationRef.current)
        await api(`/${conversationRef.current.id}`, "DELETE");
      conversationRef.current = null;
      setConversation(null);
      setError("");
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* Optional. */
      }
    } catch (e) {
      setError((e as Error).message);
    }
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
              className={`careos-assistant ${expanded ? "careos-expanded" : ""} fixed z-[60] flex flex-col overflow-hidden border bg-card shadow-lift`}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                trigger.current?.focus();
              }}
              aria-describedby="careos-description"
            >
              <header className="flex items-center justify-between gap-2 border-b bg-intelligence px-5 py-4">
                <div>
                  <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-intelligence-foreground">
                    <Sparkles className="size-5" aria-hidden="true" />
                    CareOS
                  </Dialog.Title>
                  <Dialog.Description
                    id="careos-description"
                    className="mt-1 text-xs text-muted-foreground"
                  >
                    Your purchase companion
                  </Dialog.Description>
                  <p className="mt-1 text-xs font-medium text-intelligence-foreground">
                    {mode === "fixture"
                      ? "Demo responses · no live AI"
                      : mode === "subscription"
                        ? "Using ChatGPT plan · Sol Medium · private"
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
                    >
                      Manage ChatGPT usage
                    </a>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
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
                      aria-label="Close CareOS"
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </Dialog.Close>
                </div>
              </header>
              <div className="flex items-center justify-between gap-2 border-b px-5 py-3 text-xs">
                <span className="min-w-0 text-muted-foreground">
                  Discussing{" "}
                  <strong className="block truncate text-sm text-foreground">
                    {context
                      ? `${context.name} · ${context.model}`
                      : "Choose a purchase"}
                  </strong>
                  {context && (
                    <span>
                      {context.origin === "sandbox"
                        ? "Verified Sandbox purchase"
                        : context.example
                          ? "Fictional ownership example · no purchase"
                          : "Sample purchase"}{" "}
                      {context.twinId && (
                        <>· PC-{context.twinId.slice(-6).toUpperCase()}</>
                      )}
                    </span>
                  )}
                </span>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/vault" onClick={() => mobile && setOpen(false)}>
                    Switch
                  </Link>
                </Button>
              </div>
              <div
                className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5"
                aria-label="CareOS conversation"
              >
                {!conversation?.turns.length && (
                  <div className="rounded-2xl bg-intelligence p-5">
                    <h2 className="text-xl font-semibold">
                      Less searching.
                      <br />
                      More taking care.
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      Find a receipt, understand a purchase, or explore guidance
                      from its available documents.
                    </p>
                  </div>
                )}
                {conversation?.turns.map((turn, index) => (
                  <article key={turn.requestId} className="space-y-3">
                    {((index === 0 &&
                      turn.answer.context?.twinId !== context?.twinId) ||
                      (index > 0 &&
                        conversation.turns[index - 1].answer.context?.twinId !==
                          turn.answer.context?.twinId)) && (
                      <p className="border-t pt-3 text-xs text-muted-foreground">
                        {turn.answer.context
                          ? `${turn.answer.context.name} · ${turn.answer.context.model} · ${turn.answer.context.origin === "sandbox" ? "Sandbox" : "Sample"}`
                          : "General assistance"}
                      </p>
                    )}
                    {![
                      "Product care",
                      "Find receipt",
                      "Purchase summary",
                    ].includes(turn.message) && (
                      <p className="ml-8 rounded-2xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
                        {turn.message}
                      </p>
                    )}
                    <div className="text-sm leading-7">
                      <p className="mb-1 text-xs font-semibold text-intelligence-foreground">
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
                    <div className="flex flex-col gap-2">
                      {turn.answer.actions.map((action) => (
                        <Button
                          key={action.href}
                          asChild
                          variant="outline"
                          className="justify-between text-left"
                        >
                          <Link
                            href={action.href}
                            onClick={() => mobile && setOpen(false)}
                          >
                            {action.label}
                            <ArrowUpRight aria-hidden="true" />
                          </Link>
                        </Button>
                      ))}
                    </div>
                    {!!turn.answer.sources.length && (
                      <details className="rounded-xl border px-3 text-xs text-muted-foreground">
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
                  </article>
                ))}
                <p
                  role="status"
                  className={busy ? "text-sm text-muted-foreground" : "sr-only"}
                >
                  {busy
                    ? "Retrieving your purchase information…"
                    : conversation?.turns.length
                      ? "CareOS answer ready. Review the answer and sources above."
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
              <div className="border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div className="mb-3 flex flex-wrap gap-2">
                  {[
                    ["Find receipt", "receipt"],
                    ["Purchase summary", "summary"],
                    ["Product care", "care"],
                  ].map(([label, intent]) => (
                    <button
                      type="button"
                      key={intent}
                      disabled={busy}
                      className="min-h-11 rounded-xl border px-3 text-xs font-medium text-intelligence-foreground hover:bg-intelligence disabled:opacity-50"
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
                    if (draft.trim() && !busy) {
                      void ask(draft.trim());
                      setDraft("");
                    }
                  }}
                >
                  <label className="sr-only" htmlFor="careos-message">
                    Ask about your purchase
                  </label>
                  <textarea
                    id="careos-message"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={2000}
                    rows={1}
                    placeholder="Ask about your purchase…"
                    className="min-w-0 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-ring"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={busy || !draft.trim()}
                    aria-label="Send to CareOS"
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                </form>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>Demo data only. Don’t enter personal information.</span>
                  <button
                    type="button"
                    disabled={busy}
                    className="min-h-11 shrink-0 underline"
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
