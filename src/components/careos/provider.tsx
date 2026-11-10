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
import { createPortal } from "react-dom";
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
import {
  readPending,
  conversationKey as careConversationKey,
  pendingKey as carePendingKey,
} from "./conversation-client";
import {
  readInsightPending,
  insightPendingKey,
  insightHistoryKey,
  readInsightHistory,
} from "../intelligence/customer-client";
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
import { IntegratedNorthView, type IntegratedNorthState } from "./integrated";
import {
  northWorkspaceKey,
  readNorthWorkspace,
} from "@/lib/north-presentation";
import {
  northChatsKey,
  readNorthChats,
  rememberNorthChat,
  chatSummary,
  type NorthChat,
} from "./north-chat-state";
import {
  ownershipPostcondition,
  careHomepagePostcondition,
  ownershipPresentationTarget,
  type OwnershipPresentation,
} from "@/lib/care/ownership-presentation";

type AssistantState = {
  select: (context: CareContext | null) => void;
  register: (context: CareContext | null) => void;
  open: () => void;
  ask: (message: string, intent?: Intent, context?: CareContext) => void;
  integrated?: IntegratedNorthState;
  setWorkspaceElement: (element: HTMLDivElement | null) => void;
};
const AssistantContext = createContext<AssistantState | null>(null);
function sessionStorageSafe(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
export function useOptionalCareOS() {
  return useContext(AssistantContext);
}
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
  integrated = false,
}: {
  children: ReactNode;
  mode?: "fixture" | "disabled" | "responses" | "subscription" | "unavailable";
  aiExpiresAt?: number;
  aiAccessDisabled?: boolean;
  ownerAccess?: boolean;
  conversationalAI?: boolean;
  integrated?: boolean;
}) {
  const [clock, setClock] = useState(0);
  const interactionTime = useCallback(() => Date.now(), []);
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
  const router = useRouter();
  const ownershipIntent = useRef<{
    expected: OwnershipPresentation;
    requestId: string;
  } | null>(null);
  const careIntent = useRef<{
    expected: OwnershipPresentation[];
    requestId: string;
  } | null>(null);
  const [ownershipNotice, setOwnershipNotice] = useState("");
  const [ownershipNoticeFor, setOwnershipNoticeFor] = useState<string | null>(
    null,
  );
  useEffect(() => {
    const verifyCare = () => {
      const intent = careIntent.current;
      if (!intent) return;
      const checked = intent.expected.every((expected) => {
        const cards = [
          ...document.querySelectorAll<HTMLElement>(
            '[data-ownership-surface="care"]',
          ),
        ].filter(
          (card) =>
            card.dataset.ownershipTwin === expected.twinId &&
            card.getClientRects().length > 0 &&
            !card.closest('[aria-hidden="true"], [hidden]'),
        );
        const card = cards.length === 1 ? cards[0] : null;
        return (
          !!card &&
          careHomepagePostcondition(expected, {
            pathname: window.location.pathname,
            twinId: card.dataset.ownershipTwin,
            topic: card.dataset.careFocused,
            revision: card.dataset.ownershipRevision,
            visible:
              card.getClientRects().length > 0 &&
              !card.closest('[aria-hidden="true"], [hidden]') &&
              !!card.querySelector(
                `[data-care-milestone="${expected.topic}"][aria-current="step"]`,
              ),
            facts: card.querySelectorAll("[data-care-focus-fact]").length,
          })
        );
      });
      setOwnershipNoticeFor(intent.requestId);
      setOwnershipNotice(
        checked
          ? "Highlighted the matching products and care details. Their saved sources were checked; no records changed."
          : "North couldn’t confirm the matching care details. Review the saved sources; no status or payment changed.",
      );
      if (checked) careIntent.current = null;
    };
    const verify = () => {
      const intent = ownershipIntent.current;
      if (!intent) return;
      const panel = document.querySelector<HTMLElement>(
        "[data-ownership-panel]",
      );
      if (!panel) return;
      const actual = {
        pathname: window.location.pathname,
        milestone: new URLSearchParams(window.location.search).get("milestone"),
        twinId: panel.dataset.ownershipTwin,
        topic: panel.dataset.ownershipTopic,
        revision: panel.dataset.ownershipRevision,
        open: panel.dataset.state === "open",
        visible:
          panel.getClientRects().length > 0 &&
          !panel.closest('[aria-hidden="true"]'),
        facts: panel.querySelectorAll("[data-ownership-fact]").length,
      };
      if (ownershipPostcondition(intent.expected, actual)) {
        setOwnershipNoticeFor(intent.requestId);
        setOwnershipNotice(
          `Opened the saved ${intent.expected.topic} details for this purchase and checked the matching sources.`,
        );
        ownershipIntent.current = null;
      } else if (
        actual.pathname === `/vault/${intent.expected.twinId}` &&
        actual.milestone === intent.expected.topic
      ) {
        setOwnershipNoticeFor(intent.requestId);
        setOwnershipNotice(
          "The saved details changed, or North couldn’t confirm the requested care step. Review the current records; no status or payment changed.",
        );
        ownershipIntent.current = null;
      }
    };
    const depart = () => {
      ownershipIntent.current = null;
      careIntent.current = null;
      window.dispatchEvent(new CustomEvent("palcare-care-focus"));
    };
    window.addEventListener("palcare-ownership-visible", verify);
    window.addEventListener("palcare-care-visible", verifyCare);
    window.addEventListener("popstate", depart);
    return () => {
      window.removeEventListener("palcare-ownership-visible", verify);
      window.removeEventListener("palcare-care-visible", verifyCare);
      window.removeEventListener("popstate", depart);
    };
  }, []);
  const visible =
    /^\/(dashboard|purchases|care|vault|documents|guardian|safety|replacements|insights|shop|checkout)(\/|$)/.test(
      pathname,
    );
  const [isOpen, setOpen] = useState(false);
  const [returnFocusRequested, setReturnFocusRequested] = useState(false);
  const panelOpener = useRef<HTMLElement | null>(null);
  function rememberOpener() {
    if (isOpen) return;
    const focused = document.activeElement;
    if (
      focused instanceof HTMLElement &&
      focused !== document.body &&
      !focused.closest(".north-floating-panel, .north-panel-restore")
    )
      panelOpener.current = focused;
  }
  // Keep the legacy outlet registration API, but never mount the panel inside
  // a page that navigation can unmount or hide.
  const setWorkspaceElement = useCallback((element: HTMLDivElement | null) => {
    void element;
  }, []);
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setPortalElement(document.body));
    return () => cancelAnimationFrame(frame);
  }, []);
  const [screen, setScreenState] = useState<"start" | "chat" | "history">(
    "start",
  );
  const [minimized, setMinimized] = useState(false);
  const [chats, setChats] = useState<NorthChat[]>([]);
  const chatsRef = useRef<NorthChat[]>([]);
  const hasChatIndex = useRef(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const activeChat = useRef<string | null>(null);
  const [switchingChat, setSwitchingChat] = useState(false);
  const switching = useRef(false);
  const [chatNotice, setChatNotice] = useState("");
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [integratedHistoryOpen, setIntegratedHistoryOpen] = useState(false);
  const presentationEpoch = useRef(0);
  const historySelection = useRef(false);
  const [historySelected, setHistorySelected] = useState(false);
  const selectHistoryScope = useCallback((value: boolean) => {
    if (value) {
      careIntent.current = null;
      window.dispatchEvent(new CustomEvent("palcare-care-focus"));
    }
    historySelection.current = value;
    setHistorySelected(value);
  }, []);
  const [expanded, setExpanded] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [context, setContext] = useState<CareContext | null>(null);
  const contextRef = useRef<CareContext | null>(null);
  const routeContext = useRef<{
    pathname: string;
    context: CareContext | null;
  } | null>(null);
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
    () =>
      registerDeparture(() => {
        ownershipIntent.current = null;
        careIntent.current = null;
        window.dispatchEvent(new CustomEvent("palcare-care-focus"));
        presentationEpoch.current++;
        setRecordsSubmission(null);
        setReturnFocusRequested(false);
      }),
    [registerDeparture],
  );
  useEffect(() => {
    const submitted = records.conversation?.turns.find(
      (turn) => turn.requestId === recordsSubmission,
    );
    const nativeHandoff =
      pathname === "/insights" &&
      submitted?.answer.recordsResult?.query.format === "chart" &&
      submitted.answer.recordsPresentation?.action !== "inspect" &&
      !historySelection.current;
    // A freshly answered chart owns its existing automatic /insights handoff.
    // Explicit links cancel that intent through prepareDeparture/navigate.
    if (nativeHandoff) return;
    presentationEpoch.current++;
    insights.cancelRecords();
    careIntent.current = null;
    const expected = ownershipIntent.current?.expected;
    if (expected && pathname !== `/vault/${expected.twinId}`)
      ownershipIntent.current = null;
    setRecordsSubmission(null);
    // Navigation never opens a closed panel or closes an explicitly open one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  const analytics = pathname === "/insights";
  useEffect(() => {
    const depart = () => {
      presentationEpoch.current++;
      setRecordsSubmission(null);
    };
    window.addEventListener("popstate", depart);
    return () => window.removeEventListener("popstate", depart);
  }, []);
  const turns = mergeAssistantTurns(
    [
      ...(regular.conversation?.turns ?? []),
      ...(records.conversation?.turns ?? []),
    ],
    (insights.conversation?.turns ?? []).filter(
      (turn) => !activeChatId || submittedOrder.includes(turn.requestId),
    ),
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
  const error = chatNotice || records.error || regular.error || insights.error;
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
  const busy = phase !== "idle" || switchingChat;
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
    if (integrated || !isOpen || !visible || expanded) return;
    document.documentElement.classList.add("careos-reading-space");
    return () =>
      document.documentElement.classList.remove("careos-reading-space");
  }, [integrated, isOpen, visible, expanded]);

  const updateContext = useCallback((value: CareContext | null) => {
    registered.current = true;
    if (JSON.stringify(contextRef.current) === JSON.stringify(value)) return;
    contextRef.current = value;
    revision.current++;
    setContext(value);
  }, []);
  const register = useCallback(
    (value: CareContext | null) => {
      routeContext.current = { pathname, context: value };
      if (integrated && (activeChat.current || isOpen)) return;
      if (value && !explicitContext.current) {
        // A newly opened dated product supplies the visible default context;
        // an inspected library answer must not silently override that context.
        if (
          integrated &&
          JSON.stringify(value) !== JSON.stringify(contextRef.current)
        )
          selectHistoryScope(false);
        updateContext(value);
      }
    },
    [updateContext, integrated, selectHistoryScope, pathname, isOpen],
  );
  function loadPresentation(now: number) {
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
      if (integrated) {
        const index = readNorthChats(sessionStorage.getItem(northChatsKey));
        if (index) {
          hasChatIndex.current = true;
          chatsRef.current = index.chats;
          setChats(index.chats);
          activeChat.current = index.activeChatId;
          setActiveChatId(index.activeChatId);
          const chat = index.chats.find(
            (value) => value.id === index.activeChatId,
          );
          // Singleton keys remain compatibility selectors only. Keep them in
          // sync with the chosen chat before a closed-panel Send can restore.
          if (chat?.channels.care)
            sessionStorage.setItem(careConversationKey, chat.channels.care);
          else regular.detach();
          if (chat?.channels.records)
            sessionStorage.setItem(
              "palcare-records-conversation-v1",
              chat.channels.records,
            );
          else records.detach();
          if (!chat?.channels.insights.length) insights.detach();
          if (chat) {
            setDraft(chat.draft);
            setSubmittedOrder(chat.order);
            setDismissedChoices(chat.dismissed);
            explicitContext.current = true;
            setContextExplicit(true);
            updateContext(chat.context);
            setActiveResultId(chat.activeResultId);
            setScreenState(chat.order.length ? "chat" : "start");
          }
        } else {
          // Adopt the old singleton identities once, without deleting them or
          // copying any answers into browser storage. Server GET fills previews.
          const careId = sessionStorage.getItem(careConversationKey);
          const recordsId = sessionStorage.getItem(
            "palcare-records-conversation-v1",
          );
          const insightEntries = readInsightHistory(
            sessionStorage.getItem(insightHistoryKey),
          );
          const validId = (id: string | null) =>
            id && /^[a-f0-9-]{36}$/.test(id) ? id : null;
          if (validId(careId) || validId(recordsId) || insightEntries.length) {
            const id = crypto.randomUUID();
            const legacyContext = saved?.context ?? contextRef.current;
            const chat: NorthChat = {
              id,
              title: legacyContext
                ? `About ${legacyContext.name}`.slice(0, 100)
                : "Saved purchase chat",
              preview: legacyContext
                ? `${legacyContext.model}${legacyContext.purchasedOn ? ` · ${legacyContext.purchasedOn}` : ""}`.slice(
                    0,
                    180,
                  )
                : "Your earlier saved purchase questions",
              context: legacyContext,
              explicit: saved?.explicit ?? false,
              draft: saved?.draft ?? "",
              activeResultId: null,
              order: [
                ...new Set([
                  ...(saved?.order ?? []),
                  ...insightEntries.map((entry) => entry.requestId),
                ]),
              ].slice(-80),
              dismissed: saved?.dismissed ?? [],
              channels: {
                care: validId(careId),
                records: validId(recordsId),
                insights: [
                  ...new Set(
                    insightEntries.map((entry) => entry.conversationId),
                  ),
                ].slice(-40),
              },
              updatedAt: now,
            };
            chatsRef.current = [chat];
            setChats([chat]);
            activeChat.current = id;
            setActiveChatId(id);
            setSubmittedOrder(chat.order);
            setScreenState("chat");
            hasChatIndex.current = true;
          }
        }
        const workspace = readNorthWorkspace(
          sessionStorage.getItem(northWorkspaceKey),
        );
        if (workspace) {
          if (!index) setActiveResultId(workspace.id);
          setOpen(workspace.open);
          selectHistoryScope(workspace.historySelected);
        }
      }
    } catch {
      /* Optional fictional, per-tab presentation hint. */
    }
    setPresentationLoaded(true);
  }
  function rememberChat(now: number, id = activeChat.current) {
    if (!id || switching.current) return;
    const previous = chatsRef.current.find((value) => value.id === id);
    const chat: NorthChat = {
      id,
      ...(turns.length || draft.trim() || pending || !previous
        ? chatSummary(turns, draft || pending?.input.message || "")
        : { title: previous.title, preview: previous.preview }),
      context: contextRef.current,
      explicit: explicitContext.current,
      draft,
      activeResultId,
      order: [
        ...new Set([...submittedOrder, ...turns.map((turn) => turn.requestId)]),
      ].slice(-80),
      dismissed: dismissedChoices.slice(-80),
      channels: {
        care: regular.conversation?.id ?? previous?.channels.care ?? null,
        records: records.conversation?.id ?? previous?.channels.records ?? null,
        insights: insights.conversationIds.length
          ? insights.conversationIds
          : (previous?.channels.insights ?? []),
      },
      updatedAt: now,
    };
    const next = rememberNorthChat(chatsRef.current, chat);
    chatsRef.current = next;
    setChats(next);
    try {
      sessionStorage.setItem(
        northChatsKey,
        JSON.stringify({
          version: 1,
          activeChatId: activeChat.current,
          chats: next,
        }),
      );
    } catch {
      /* Bounded metadata is optional, never a trusted transcript. */
    }
  }
  useEffect(() => {
    if (!integrated || !presentationLoaded || switching.current) return;
    const frame = requestAnimationFrame(() => rememberChat(Date.now()));
    return () => cancelAnimationFrame(frame);
    // Snapshot the currently owned channels after their committed state updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    integrated,
    presentationLoaded,
    activeChatId,
    activeResultId,
    context,
    contextExplicit,
    draft,
    submittedOrder,
    dismissedChoices,
    regular.conversation,
    records.conversation,
    insights.conversation,
    pending,
    switchingChat,
  ]);

  function cancelPresentation() {
    presentationEpoch.current++;
    ownershipIntent.current = null;
    careIntent.current = null;
    window.dispatchEvent(new CustomEvent("palcare-care-focus"));
    insights.cancelRecords();
    setRecordsSubmission(null);
    setOwnershipNotice("");
    setOwnershipNoticeFor(null);
  }
  function canSwitchChat() {
    if (
      switching.current ||
      admitting.current ||
      busy ||
      pending ||
      !regular.canDetach() ||
      !records.canDetach() ||
      !insights.canDetach()
    ) {
      setChatNotice(
        "Check the current saved answer before switching chats. Nothing will be sent again.",
      );
      void open(true);
      return false;
    }
    return true;
  }
  function newChat() {
    rememberOpener();
    loadPresentation(interactionTime());
    if (!canSwitchChat()) return;
    if (!activeChat.current && draft.trim()) {
      activeChat.current = crypto.randomUUID();
    }
    rememberChat(interactionTime());
    cancelPresentation();
    regular.detach();
    records.detach();
    insights.detach();
    activeChat.current = null;
    setActiveChatId(null);
    setChatNotice("");
    setDraft("");
    setSubmittedOrder([]);
    setDismissedChoices([]);
    setActiveResultId(null);
    selectHistoryScope(false);
    explicitContext.current = true;
    setContextExplicit(true);
    updateContext(
      /^\/(vault|documents|care)\/[^/]+/.test(pathname) &&
        routeContext.current?.pathname === pathname
        ? routeContext.current.context
        : null,
    );
    setScreenState("chat");
    setIntegratedHistoryOpen(false);
    setMinimized(false);
    setOpen(true);
    try {
      sessionStorage.setItem(
        northChatsKey,
        JSON.stringify({
          version: 1,
          activeChatId: null,
          chats: chatsRef.current,
        }),
      );
    } catch {
      /* Optional presentation metadata. */
    }
  }
  async function chooseChat(id: string) {
    loadPresentation(interactionTime());
    const chat = chatsRef.current.find((value) => value.id === id);
    if (!chat) return;
    if (id === activeChat.current) {
      setScreenState(chat.order.length ? "chat" : "start");
      setIntegratedHistoryOpen(false);
      setMinimized(false);
      setOpen(true);
      return;
    }
    if (!canSwitchChat()) return;
    if (!activeChat.current && draft.trim())
      activeChat.current = crypto.randomUUID();
    rememberChat(interactionTime());
    cancelPresentation();
    regular.detach();
    records.detach();
    insights.detach();
    switching.current = true;
    setSwitchingChat(true);
    activeChat.current = id;
    setActiveChatId(id);
    setChatNotice("");
    setDraft(chat.draft);
    setSubmittedOrder(chat.order);
    setDismissedChoices(chat.dismissed);
    setActiveResultId(chat.activeResultId);
    explicitContext.current = true;
    setContextExplicit(true);
    updateContext(chat.context);
    selectHistoryScope(true);
    setScreenState(chat.order.length ? "chat" : "start");
    setIntegratedHistoryOpen(false);
    setMinimized(false);
    setOpen(true);
    try {
      // IDs only select existing owned GET endpoints. Metadata cannot supply
      // turns, authorize a model call, replay a plan or create a conversation.
      await Promise.all([
        chat.channels.records ? records.restore(chat.channels.records) : null,
        chat.channels.care ? regular.restore(chat.channels.care) : null,
        insights.restore(chat.order, chat.channels.insights),
      ]);
    } finally {
      switching.current = false;
      setSwitchingChat(false);
    }
  }
  useEffect(() => {
    if (!integrated || !presentationLoaded) return;
    try {
      sessionStorage.setItem(
        northWorkspaceKey,
        JSON.stringify({
          version: 1,
          id: activeResultId,
          open: isOpen,
          historySelected,
        }),
      );
    } catch {
      /* Optional UUID-only hint. */
    }
  }, [integrated, presentationLoaded, activeResultId, isOpen, historySelected]);
  function select(value: CareContext | null) {
    presentationEpoch.current++;
    loadPresentation(interactionTime());
    selectHistoryScope(false);
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
    rememberOpener();
    const beforeAdmission = presentationEpoch.current;
    loadPresentation(interactionTime());
    if (
      admitting.current ||
      switching.current ||
      busy ||
      pending ||
      !message.trim()
    )
      return false;
    if (integrated) {
      // Closed Home can admit directly through its one field, before an open
      // workspace has restored any hooks. Never bypass another channel's
      // dispatched uncertainty or overwrite its original envelope. A known
      // owned saved result (including a recoverable presentation) is different
      // from uncertainty; it may retain its hint without blocking unrelated care.
      const unresolved = (
        [
          [
            readPending(sessionStorageSafe(carePendingKey)),
            regular.conversation,
          ],
          [
            readPending(sessionStorageSafe("palcare-records-pending-v1")),
            records.conversation,
          ],
        ] as const
      ).some(
        ([hint, saved]) =>
          hint &&
          hint.status !== "not-sent" &&
          !saved?.turns.some((turn) => turn.requestId === hint.input.requestId),
      );
      const insightHint = readInsightPending(
        sessionStorageSafe(insightPendingKey),
      );
      if (
        unresolved ||
        (insightHint &&
          !insights.conversation?.turns.some(
            (turn) => turn.requestId === insightHint.requestId,
          ))
      ) {
        await open(true);
        return false;
      }
    }
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
      beforeAdmission !== presentationEpoch.current ||
      (savedRecords
        ? busy || !!pending
        : interactionBlocked || evaluationWindowExpired(aiExpiresAt)) ||
      !message.trim()
    )
      return false;
    if (selected) select(selected);
    const admittedEpoch = presentationEpoch.current;
    const viewed =
      integrated && historySelection.current
        ? turns.find((turn) => turn.requestId === activeResultId)
        : undefined;
    const bound = viewed ? viewed.answer.context : contextRef.current;
    const boundRevision = revision.current;
    const ownedHistory = records.conversation?.turns ?? [];
    const anchorIndex =
      integrated && activeResultId
        ? ownedHistory.findIndex((turn) => turn.requestId === activeResultId)
        : -1;
    const followupRequestId =
      anchorIndex >= 0 ? ownedHistory[anchorIndex].requestId : undefined;
    const history =
      anchorIndex >= 0 ? ownedHistory.slice(0, anchorIndex + 1) : ownedHistory;
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
      if (admittedEpoch !== presentationEpoch.current) return false;
      setOpen(true);
      setMinimized(false);
      setReturnFocusRequested(false);
      const requestId = crypto.randomUUID();
      if (integrated) {
        if (!activeChat.current) {
          const id = crypto.randomUUID();
          activeChat.current = id;
          setActiveChatId(id);
          hasChatIndex.current = true;
        }
        setChatNotice("");
        setScreenState("chat");
        setActiveResultId(requestId);
        setIntegratedHistoryOpen(false);
        selectHistoryScope(false);
      }
      insights.cancelRecords();
      setRecordsSubmission(savedRecords ? requestId : null);
      setSubmittedOrder((prior) => [...prior, requestId]);
      setDiscoveryNotice("");
      setOwnershipNotice("");
      careIntent.current = null;
      window.dispatchEvent(new CustomEvent("palcare-care-focus"));
      setOwnershipNoticeFor(null);
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
            ...(followupRequestId ? { followupRequestId } : {}),
          },
          bound,
          modelInterpretation ? "interpret" : "turns",
          (turn) => {
            if (
              admittedEpoch !== presentationEpoch.current ||
              !turn.answer.conversationPlan ||
              turn.answer.revision !== revision.current
            )
              return;
            if (
              conversationalAI &&
              (turn.answer.context ||
                (turn.answer.questionScope === "library" &&
                  turn.answer.conversationPlan.relation === "fresh"))
            ) {
              explicitContext.current = true;
              setContextExplicit(true);
              updateContext(turn.answer.context);
            }
            if (
              window.location.pathname === "/dashboard" &&
              turn.answer.careHighlights?.length &&
              !historySelection.current
            ) {
              const expected = turn.answer.careHighlights;
              // Validate application-resolved targets before selector/event use.
              for (const target of expected)
                ownershipPresentationTarget(target);
              careIntent.current = { expected, requestId: turn.requestId };
              for (const target of expected)
                window.dispatchEvent(
                  new CustomEvent("palcare-care-focus", { detail: target }),
                );
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  if (careIntent.current?.requestId === turn.requestId)
                    window.dispatchEvent(new Event("palcare-care-visible"));
                }),
              );
              return;
            }
            if (
              turn.answer.ownershipPresentation &&
              !historySelection.current
            ) {
              const expected = turn.answer.ownershipPresentation;
              if (expected.twinId !== turn.answer.context?.twinId) return;
              const href = ownershipPresentationTarget(expected);
              ownershipIntent.current = { expected, requestId: turn.requestId };
              setOwnershipNotice("");
              setRecordsSubmission(null);
              if (!integrated) setOpen(false);
              if (
                `${window.location.pathname}${window.location.search}` === href
              )
                window.dispatchEvent(
                  new CustomEvent("palcare-open-ownership", {
                    detail: expected,
                  }),
                );
              else router.push(href);
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
  async function open(recoveryOnly = false) {
    rememberOpener();
    void recoveryOnly;
    loadPresentation(interactionTime());
    setReturnFocusRequested(false);
    setMinimized(false);
    setOpen(true);
    const chat = chatsRef.current.find(
      (value) => value.id === activeChat.current,
    );
    // This GET-only channel has its own cookie/owner namespace. Restoring saved
    // records neither reads private AI history nor issues an inference grant.
    if (chat?.channels.records) void records.restore(chat.channels.records);
    else if (!chat) void records.restore(false);
    if (conversationalAI) {
      if (await checkOwnerAccess()) {
        if (chat?.channels.care) void regular.restore(chat.channels.care);
        else if (!chat) void regular.restore(false);
        void insights.restore(
          hasChatIndex.current ? (chat?.order ?? []) : undefined,
          chat?.channels.insights,
        );
      }
      return;
    }
    if (!(await checkOwnerAccess())) return;
    if (aiAccessDisabled || evaluationWindowExpired(aiExpiresAt)) return;
    void insights.restore(
      hasChatIndex.current ? (chat?.order ?? []) : undefined,
      chat?.channels.insights,
    );
    const value = chat
      ? chat.channels.care
        ? await restore(chat.channels.care)
        : null
      : await restore(false);
    const previous = value?.turns.at(-1)?.answer.context;
    if (!registered.current && !contextRef.current && previous)
      select(previous);
  }
  useEffect(() => {
    if (!integrated) return;
    // Hydrate optional tab-local hints after the committed page mounts. A frame
    // is cancelled if the root unmounts; only owned GET recovery can follow.
    const frame = requestAnimationFrame(() => {
      loadPresentation(interactionTime());
      if (readNorthWorkspace(sessionStorageSafe(northWorkspaceKey))?.open)
        void open();
    });
    return () => cancelAnimationFrame(frame);
    // One-time root bootstrap, not a replay subscription to changing turns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrated]);

  function closeWorkspace() {
    ownershipIntent.current = null;
    careIntent.current = null;
    window.dispatchEvent(new CustomEvent("palcare-care-focus"));
    presentationEpoch.current++;
    insights.cancelRecords();
    setRecordsSubmission(null);
    setOpen(false);
    if (integrated) setReturnFocusRequested(true);
  }
  useEffect(() => {
    if (!integrated || isOpen || !returnFocusRequested) return;
    // Wait for the closing commit to mount the real page opener. Do not steal
    // focus from a subsequent deliberate navigation or a quickly reopened view.
    const frame = requestAnimationFrame(() => {
      const focused = document.activeElement;
      if (
        !focused ||
        focused === document.body ||
        focused === document.documentElement ||
        !focused.isConnected
      ) {
        const original = panelOpener.current;
        const target = original?.isConnected
          ? original
          : (document.getElementById("library-search") ??
            document.querySelector<HTMLButtonElement>(
              'button[aria-label="Ask North Star"]:not(:disabled)',
            ));
        target?.focus({ preventScroll: true });
      }
      setReturnFocusRequested(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [integrated, isOpen, returnFocusRequested]);
  const integratedState: IntegratedNorthState = {
    isOpen,
    screen,
    setScreen: (value) => {
      setScreenState(value);
      setIntegratedHistoryOpen(value === "history");
    },
    newChat: () => newChat(),
    chats,
    activeChatId,
    chooseChat: (id) => void chooseChat(id),
    minimized,
    minimize: () => {
      cancelPresentation();
      setMinimized(true);
    },
    restorePanel: () => {
      setMinimized(false);
      void open();
    },
    ownershipNotice,
    ownershipNoticeFor,
    turns,
    activeId: activeResultId,
    historyOpen: integratedHistoryOpen,
    setHistoryOpen: (value) => {
      setIntegratedHistoryOpen(value);
      // Legacy per-turn History belongs to the current chat. Only openHistory
      // opens the separate Previous chats picker.
      setScreenState("chat");
    },
    openHistory: () => {
      setIntegratedHistoryOpen(true);
      setScreenState("history");
      void open();
    },
    choose: (id) => {
      const chosen = turns.find((turn) => turn.requestId === id);
      if (chosen) {
        presentationEpoch.current++;
        selectHistoryScope(true);
        insights.cancelRecords();
        setRecordsSubmission(null);
        setActiveResultId(id);
        setScreenState("chat");
        setIntegratedHistoryOpen(false);
        setMinimized(false);
        setOpen(true);
      }
    },
    close: closeWorkspace,
    open: () => void open(),
    draft,
    setDraft: (value) => {
      loadPresentation(interactionTime());
      if (!activeChat.current && value.trim()) {
        const id = crypto.randomUUID();
        activeChat.current = id;
        setActiveChatId(id);
        hasChatIndex.current = true;
      }
      setDraft(value);
      setDismissedChoices((prior) => [
        ...new Set([
          ...prior,
          ...turns
            .filter((turn) => turn.answer.outcome === "selection")
            .map((turn) => turn.requestId),
        ]),
      ]);
    },
    submit,
    ask: (message) => {
      const original = message;
      void ask(message).then((admitted) => {
        if (admitted)
          setDraft((current) => (current === original ? "" : current));
      });
    },
    pending,
    choiceAvailable: !unavailable,
    busy,
    blocked: submitBlocked,
    error,
    context,
    select,
    recordsSubmission,
    consumeRecords: () => setRecordsSubmission(null),
    navigate: cancelPresentation,
    check: () => void check(),
    clear: () => void clear(),
    unsent: [...regular.unsent, ...records.unsent],
    ownerAccess,
    ownerState,
    accessMessage: browserMessage,
    mode,
    expired: aiExpired,
    accessDisabled: aiAccessDisabled,
    onChoice: (message, selected) => {
      if (unavailable || !selected.twinId) return;
      void ask(message, undefined, selected);
    },
    dismissedChoices,
    dismissChoice: (id) => setDismissedChoices((prior) => [...prior, id]),
    recoverable: insights.recoverable,
    connected: insights.connected,
    applySaved: () => void insights.applySaved(),
  };
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
        integrated: integrated ? integratedState : undefined,
        setWorkspaceElement,
      }}
    >
      {children}
      {integrated &&
        visible &&
        portalElement &&
        createPortal(
          <IntegratedNorthView state={integratedState} />,
          portalElement,
        )}
      {!integrated && visible && (
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
                    Pal Care’s purchase assistant. Find receipts, explore saved
                    purchases, or choose a product for care guidance. Choosing a
                    purchase or expanding North won’t send a question.
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
                              ? "AI assistance · check sources"
                              : "AI connection unavailable"}
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
                        Clearing history keeps your purchases and doesn’t
                        restore your AI allowance.
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
                    {context ? "Selected purchase" : "Your saved purchases"}
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
                          : "Example purchase"}{" "}
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
                    North’s AI access has expired. You can still browse saved
                    purchases and documents, or explore Insights yourself.
                    Access won’t renew automatically.
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
                    <p>
                      You can still browse saved purchases and documents, or
                      explore Insights yourself.
                    </p>
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
                        How can I help with your purchases?
                      </h2>
                      <p className="text-base leading-7 text-muted-foreground">
                        Find a receipt, explore saved purchases, or ask for
                        product care. I’ll use the records and sources available
                        here.
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
                      For:{" "}
                      {turn.answer.questionScope === "library"
                        ? turn.answer.recordsResult
                          ? "saved purchases · see filters and available records below"
                          : "all saved purchases · North can’t answer this yet"
                        : turn.answer.outcome === "selection"
                          ? "choose a purchase"
                          : turn.answer.context
                            ? `${turn.answer.context.name} · ${turn.answer.context.model}${turn.answer.context.purchasedOn ? ` · ${displayDate(turn.answer.context.purchasedOn)}` : ""} · ${turn.answer.context.example ? "Reference example" : turn.answer.context.origin === "sandbox" ? "Sandbox" : "Example purchase"}`
                            : insights.conversation?.turns.some(
                                  (t) => t.requestId === turn.requestId,
                                )
                              ? "saved purchases in Insights"
                              : "no purchase selected"}
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
                            ? "North couldn’t finish this answer"
                            : turn.answer.mode === "fixture"
                              ? "Demo response · no live AI"
                              : turn.answer.mode === "live"
                                ? turn.answer.conversationPlan
                                  ? "AI answer using saved records"
                                  : "Live AI · check sources"
                                : "Saved-record answer · no live AI"}
                        </p>
                        <p>{turn.answer.text}</p>
                        {turn.answer.recordsResult && (
                          <RecordsResultView
                            requestId={turn.requestId}
                            result={turn.answer.recordsResult}
                            intent={turn.answer.recordsPresentation}
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
                        ? `${pending.context.name} · ${pending.context.model} · ${pending.context.example ? "Reference example" : pending.context.origin === "sandbox" ? "Sandbox" : "Example purchase"}`
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
                        ? "Looking into your question…"
                        : pending.status === "not-sent"
                          ? "This question wasn’t sent. Your draft is kept; check your connection and try again."
                          : "Your answer isn’t confirmed yet. North won’t send the question again automatically."}
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
                    ? "AI assistance using saved records"
                    : recordDraft
                      ? "Limited saved-record help · no live AI"
                      : aiExpired
                        ? "AI access expired · saved records remain available in Purchases and Insights"
                        : aiAccessDisabled
                          ? "AI access unavailable · saved records remain available"
                          : ownerAccess && ownerState !== "ready"
                            ? ownerSendMessage[ownerState]
                            : plannerBlocked
                              ? insights.recoverable
                                ? "A saved view is ready to review in Insights. You can still ask a product question."
                                : "North can’t change Insights right now. You can explore it yourself; your draft is kept."
                              : analytics
                                ? "Explore Insights · purchase records stay unchanged"
                                : mode === "fixture"
                                  ? "Sample demo · no live AI"
                                  : mode === "subscription"
                                    ? "Using ChatGPT plan"
                                    : mode === "responses"
                                      ? "AI assistance · check sources"
                                      : "AI connection unavailable"}
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
                  <span>
                    Demo purchases only. Please don’t share personal
                    information.
                  </span>
                  {insights.pending && (
                    <button
                      type="button"
                      className="min-h-11 underline"
                      onClick={insights.cancel}
                    >
                      Stop request
                    </button>
                  )}
                  {busy && (
                    <span>Working on it. Your next draft stays here.</span>
                  )}
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
        label
          ?.replace(/CareOS|North ☆/g, ASSISTANT_SPOKEN_NAME)
          .replace(/\bNorth\b(?! Star)/g, ASSISTANT_SPOKEN_NAME) ??
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
