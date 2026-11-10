"use client";
import { useRef, useState, type RefObject } from "react";
import type {
  CareAnswer,
  CareTurn,
  Conversation,
} from "@/lib/careos/contracts";
import type { CustomerPlan } from "@/lib/intelligence/customer-commands";
import { validateCustomerPlan } from "@/lib/intelligence/customer-commands";
import type { PendingQuestion } from "../careos/conversation-client";
import {
  insightPendingKey,
  readInsightPending,
  customerPlanApi,
  canForgetCustomerConversation,
  type InsightPending,
  insightHistoryKey,
  readInsightHistory,
  type InsightHistoryEntry,
  customerQuestionText,
} from "./customer-client";

export type InsightsRun = (
  message: string,
  requestId: string,
  signal: AbortSignal,
  recovery: {
    conversationId?: string;
    plan?: CustomerPlan;
    planning: (id: string) => void;
    planned: (plan: CustomerPlan) => void;
  },
) => Promise<CareAnswer>;
const unavailableAnswer = (text: string): CareAnswer => ({
  outcome: "unavailable",
  mode: "deterministic",
  context: null,
  revision: 0,
  text,
  steps: [],
  sources: [],
  actions: [],
});

export function useInsightsConversation(
  handler: RefObject<InsightsRun | null>,
  reset: RefObject<(() => void) | undefined>,
) {
  const controller = useRef<AbortController | null>(null);
  const hint = useRef<InsightPending | null>(null);
  const lastConversation = useRef<string | null>(null);
  const history = useRef<InsightHistoryEntry[]>([]);
  const historyLoaded = useRef(false);
  const historyRestored = useRef(false);
  const selectedRequests = useRef<string[] | undefined>(undefined);
  const restoredIds = useRef<string[]>([]);
  const [turns, setTurns] = useState<CareTurn[]>([]);
  const [conversationIds, setConversationIds] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingQuestion | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "restoring" | "sending" | "checking" | "clearing"
  >("idle");
  const [error, setError] = useState("");
  const [recoverable, setRecoverable] = useState<string | null>(null);
  function syncConversationIds() {
    const ids = [
      ...new Set([
        ...restoredIds.current,
        ...history.current
          .filter(
            (entry) =>
              !selectedRequests.current ||
              selectedRequests.current.includes(entry.requestId),
          )
          .map((entry) => entry.conversationId),
        ...(lastConversation.current ? [lastConversation.current] : []),
      ]),
    ].slice(-40);
    setConversationIds((prior) => (prior.join() === ids.join() ? prior : ids));
  }
  function loadHistory() {
    if (historyLoaded.current) return;
    historyLoaded.current = true;
    try {
      history.current = readInsightHistory(
        sessionStorage.getItem(insightHistoryKey),
      );
    } catch {
      /* Optional ID-only index. */
    }
    syncConversationIds();
  }
  function remember(value: InsightPending) {
    if (!value.conversationId) return;
    if (
      selectedRequests.current &&
      !selectedRequests.current.includes(value.requestId)
    )
      selectedRequests.current = [
        ...selectedRequests.current,
        value.requestId,
      ].slice(-80);
    loadHistory();
    history.current = [
      ...history.current.filter((entry) => entry.requestId !== value.requestId),
      {
        conversationId: value.conversationId,
        requestId: value.requestId,
        createdAt: value.createdAt,
      },
    ].slice(-40);
    syncConversationIds();
    try {
      sessionStorage.setItem(
        insightHistoryKey,
        JSON.stringify(history.current),
      );
    } catch {
      /* In-memory timeline remains usable. */
    }
  }
  function save(value: InsightPending | null) {
    hint.current = value;
    try {
      if (value)
        sessionStorage.setItem(insightPendingKey, JSON.stringify(value));
      else sessionStorage.removeItem(insightPendingKey);
    } catch {
      /* Optional fictional-question recovery hint, never authorization. */
    }
  }
  function asPending(
    value: InsightPending,
    status: PendingQuestion["status"],
  ): PendingQuestion {
    return {
      input: {
        requestId: value.requestId,
        twinId: null,
        revision: 0,
        message: value.message,
      },
      context: null,
      conversationId: value.conversationId,
      createdAt: value.createdAt,
      status,
    };
  }
  /** Local detachment never deletes server history or forgets unknown work. */
  function canDetach() {
    if (controller.current || hint.current) return false;
    try {
      return !readInsightPending(sessionStorage.getItem(insightPendingKey));
    } catch {
      return historyLoaded.current;
    }
  }
  function detach() {
    if (!canDetach()) return false;
    setTurns([]);
    setError("");
    setRecoverable(null);
    lastConversation.current = null;
    restoredIds.current = [];
    reset.current?.();
    // The global UUID-only index remains for separately selected chats. New
    // sends must not restore every historical plan into the new chat.
    historyRestored.current = true;
    selectedRequests.current = [];
    setConversationIds([]);
    return true;
  }
  async function restore(
    requestIds?: string[],
    conversationIds: string[] = [],
  ) {
    if (controller.current) return;
    try {
      const value = readInsightPending(
        sessionStorage.getItem(insightPendingKey),
      );
      if (value && !hint.current) {
        hint.current = value;
        setPending(asPending(value, "uncertain"));
      }
    } catch {
      /* Optional. */
    }
    loadHistory();
    if (requestIds) {
      historyRestored.current = false;
      selectedRequests.current = requestIds;
    }
    syncConversationIds();
    const scope = selectedRequests.current;
    const entries = scope
      ? history.current.filter((entry) => scope.includes(entry.requestId))
      : history.current;
    if (!entries.length && !conversationIds.length) {
      historyRestored.current = true;
      return;
    }
    if (historyRestored.current) return;
    historyRestored.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setPhase("restoring");
    const restoreSignal = AbortSignal.any([
      abort.signal,
      AbortSignal.timeout(10000),
    ]);
    try {
      const restored: CareTurn[] = [];
      let partial = false;
      for (const id of new Set([
        ...entries.map((entry) => entry.conversationId),
        ...conversationIds,
      ])) {
        if (restoreSignal.aborted) {
          partial = true;
          break;
        }
        let saved: Conversation;
        try {
          saved = await customerPlanApi<Conversation>(
            "GET",
            undefined,
            id,
            restoreSignal,
          );
        } catch {
          partial = true;
          continue;
        }
        if (!restoredIds.current.includes(id)) restoredIds.current.push(id);
        const requested = scope
          ? scope.map((requestId) => ({ requestId }))
          : entries.filter((value) => value.conversationId === id);
        for (const entry of requested) {
          const turn = saved.turns.find(
            (value) => value.requestId === entry.requestId,
          );
          if (!turn) {
            if (
              entries.some(
                (known) =>
                  known.requestId === entry.requestId &&
                  known.conversationId === id,
              )
            )
              partial = true;
            continue;
          }
          let plan: CustomerPlan | undefined;
          let invalid = false;
          try {
            if (turn.answer.outcome !== "unavailable")
              plan = validateCustomerPlan(turn.answer.customerPresentation);
          } catch {
            invalid = true;
            partial = true;
          }
          restored.push({
            requestId: turn.requestId,
            message: customerQuestionText(turn.message),
            answer: {
              ...unavailableAnswer(
                plan
                  ? "This saved answer describes an earlier Insights view. Open Insights to check the current view; no changes were reapplied after reload."
                  : invalid
                    ? "We couldn’t check this saved Insights answer. Your question was not sent again and no view change was applied."
                    : "This Insights question could not finish. It has not been sent again.",
              ),
              ...(plan
                ? { outcome: "answered", customerPresentation: plan }
                : {}),
            },
          });
        }
        lastConversation.current = id;
      }
      setTurns((prior) => [
        ...new Map(
          [...restored, ...prior].map((turn) => [turn.requestId, turn]),
        ).values(),
      ]);
      if (partial) {
        historyRestored.current = false;
        setError(
          "Some saved Insights history is unavailable. Available entries were restored; no request was resent or applied.",
        );
      }
    } catch {
      historyRestored.current = false;
      setError(
        "Saved Insights history could not be restored. Your original request has not been resent or applied.",
      );
    } finally {
      syncConversationIds();
      controller.current = null;
      setPhase("idle");
    }
  }
  async function run(value: InsightPending, recovered = false) {
    if (!handler.current || controller.current) return false;
    const abort = new AbortController();
    controller.current = abort;
    setPhase("sending");
    setError("");
    setRecoverable(null);
    save(value);
    setPending(asPending(value, "sending"));
    try {
      const answer = await handler.current(
        value.message,
        value.requestId,
        abort.signal,
        {
          ...(lastConversation.current
            ? { conversationId: lastConversation.current }
            : {}),
          ...(recovered && value.plan ? { plan: value.plan } : {}),
          planning: (id) => {
            lastConversation.current = id;
            syncConversationIds();
            if (hint.current?.requestId === value.requestId) {
              save({ ...hint.current, conversationId: id });
              setPending(asPending(hint.current!, "sending"));
            }
          },
          planned: (plan) => {
            if (hint.current?.requestId === value.requestId)
              save({ ...hint.current, plan });
          },
        },
      );
      if (abort.signal.aborted) throw new Error("insights_cancelled");
      setTurns((prior) => [
        ...prior.filter((p) => p.requestId !== value.requestId),
        { requestId: value.requestId, message: value.message, answer },
      ]);
      remember(hint.current ?? value);
      save(null);
      setPending(null);
    } catch {
      setPending(asPending(hint.current ?? value, "uncertain"));
      setError(
        abort.signal.aborted
          ? "The view change stopped. Any changes already made remain visible. Check for a saved answer before continuing; North won’t retry automatically."
          : "North couldn’t confirm the view change. Check for a saved answer before continuing; your question won’t be sent again.",
      );
    } finally {
      controller.current = null;
      setPhase("idle");
    }
    return true;
  }
  async function send(message: string, requestId = crypto.randomUUID()) {
    await restore();
    if (
      hint.current ||
      controller.current ||
      !message.trim() ||
      message.length > 500
    )
      return false;
    if (turns.length >= 40) {
      setError(
        "This Insights conversation is full. Clear it to start another; usage limits are not reset.",
      );
      return false;
    }
    return run({
      requestId,
      conversationId: null,
      message: message.trim(),
      createdAt: Date.now(),
    });
  }
  async function check() {
    if (!hint.current || controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setPhase("checking");
    setError("");
    try {
      const saved = hint.current;
      let plan = saved.plan;
      if (saved.conversationId) {
        const conversation = await customerPlanApi<Conversation>(
          "GET",
          undefined,
          saved.conversationId,
          abort.signal,
        );
        const turn = conversation.turns.find(
          (t) => t.requestId === saved.requestId,
        );
        if (!turn) {
          setError(
            "No saved plan yet. Your original request has not been sent again.",
          );
          return;
        }
        if (turn.answer.outcome === "unavailable") {
          setTurns((prior) => [
            ...prior.filter((t) => t.requestId !== saved.requestId),
            {
              requestId: saved.requestId,
              message: saved.message,
              answer: unavailableAnswer(
                "The saved planning request could not finish. No further dashboard actions were run. Its model usage remains accounted for.",
              ),
            },
          ]);
          remember(saved);
          save(null);
          setPending(null);
          return;
        }
        plan = validateCustomerPlan(turn.answer.customerPresentation);
      }
      if (!plan) {
        setError(
          "No saved planning result is available. Clear this request to continue; it has not been resent.",
        );
        return;
      }
      save({ ...saved, plan });
      setPending(null);
      setRecoverable(saved.requestId);
      setTurns((prior) => [
        ...prior.filter((t) => t.requestId !== saved.requestId),
        {
          requestId: saved.requestId,
          message: saved.message,
          answer: {
            ...unavailableAnswer(
              "Planning result recovered. No dashboard change has been confirmed. You can apply this saved view explicitly, without another model request.",
            ),
            outcome: "answered",
            customerPresentation: plan,
          },
        },
      ]);
    } catch {
      setError(
        "The saved answer is unavailable, or your access has ended. Nothing was sent again or applied.",
      );
    } finally {
      controller.current = null;
      setPhase("idle");
    }
  }
  async function clear() {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setPhase("clearing");
    setError("");
    try {
      loadHistory();
      // Access may have prevented open()/restore(). A pending-only first request
      // is not necessarily in the completed ID index, and must not be forgotten.
      const restored = readInsightPending(
        sessionStorage.getItem(insightPendingKey),
      );
      if (!hint.current && restored) {
        hint.current = restored;
        setPending(asPending(restored, "uncertain"));
      }
      const ids = new Set(
        [
          ...restoredIds.current,
          ...history.current
            .filter(
              (entry) =>
                !selectedRequests.current ||
                selectedRequests.current.includes(entry.requestId),
            )
            .map((entry) => entry.conversationId),
          hint.current?.conversationId,
          lastConversation.current,
        ].filter((id): id is string => !!id),
      );
      for (const id of ids) {
        try {
          await customerPlanApi("DELETE", undefined, id, abort.signal);
        } catch (error) {
          // Only this explicit DELETE's confirmed missing/expired result may
          // clear local recovery state. GET errors, denials, leases and network
          // ambiguity cannot discard the original request or release usage.
          if (!canForgetCustomerConversation(error)) throw error;
        }
      }
      save(null);
      setTurns([]);
      setPending(null);
      setRecoverable(null);
      lastConversation.current = null;
      restoredIds.current = [];
      history.current = history.current.filter(
        (entry) => !ids.has(entry.conversationId),
      );
      if (selectedRequests.current) selectedRequests.current = [];
      syncConversationIds();
      historyRestored.current = true;
      try {
        if (history.current.length)
          sessionStorage.setItem(
            insightHistoryKey,
            JSON.stringify(history.current),
          );
        else sessionStorage.removeItem(insightHistoryKey);
      } catch {
        /* Optional. */
      }
      reset.current?.();
    } catch {
      setError(
        "This saved request could not be cleared. Access or an active server lease may still block it; usage has not been released.",
      );
    } finally {
      controller.current = null;
      setPhase("idle");
    }
  }
  return {
    conversationIds,
    conversation: turns.length
      ? { id: "browser-insights", expiresAt: "", turns }
      : null,
    pending,
    phase,
    error,
    send,
    check,
    clear,
    restore,
    canDetach,
    detach,
    start: detach,
    recoverable,
    applySaved: () =>
      hint.current?.plan ? run(hint.current, true) : Promise.resolve(false),
    cancel: () => controller.current?.abort(),
  };
}
