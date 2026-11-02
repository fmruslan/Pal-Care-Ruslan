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
  const [turns, setTurns] = useState<CareTurn[]>([]);
  const [pending, setPending] = useState<PendingQuestion | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "restoring" | "sending" | "checking" | "clearing"
  >("idle");
  const [error, setError] = useState("");
  const [recoverable, setRecoverable] = useState<string | null>(null);
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
  }
  function remember(value: InsightPending) {
    if (!value.conversationId) return;
    loadHistory();
    history.current = [
      ...history.current.filter((entry) => entry.requestId !== value.requestId),
      {
        conversationId: value.conversationId,
        requestId: value.requestId,
        createdAt: value.createdAt,
      },
    ].slice(-40);
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
  async function restore() {
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
    if (historyRestored.current || !history.current.length) return;
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
      for (const id of new Set(
        history.current.map((entry) => entry.conversationId),
      )) {
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
        for (const entry of history.current.filter(
          (value) => value.conversationId === id,
        )) {
          const turn = saved.turns.find(
            (value) => value.requestId === entry.requestId,
          );
          if (!turn) {
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
                  ? "Saved Insights plan. Its earlier browser execution has not been re-verified after reload. Open Insights to inspect the current view; nothing was applied automatically."
                  : invalid
                    ? "This saved Insights plan could not be validated. Its original request has not been resent or applied."
                    : "This saved Insights request could not finish. Its usage remains accounted for; nothing was resent.",
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
          ...(recovered && value.plan ? { plan: value.plan } : {}),
          planning: (id) => {
            lastConversation.current = id;
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
          ? "Dashboard request stopped. Changes already applied remain visible. Check the saved plan before continuing; no automatic retry."
          : "The dashboard result is unconfirmed. Check the saved plan before continuing; your original request will not be sent again.",
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
        "Saved plan unavailable or access expired. Nothing was resent or applied.",
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
          ...history.current.map((entry) => entry.conversationId),
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
      history.current = [];
      historyRestored.current = true;
      try {
        sessionStorage.removeItem(insightHistoryKey);
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
    recoverable,
    applySaved: () =>
      hint.current?.plan ? run(hint.current, true) : Promise.resolve(false),
    cancel: () => controller.current?.abort(),
  };
}
