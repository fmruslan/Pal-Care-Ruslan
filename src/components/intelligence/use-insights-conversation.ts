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
  const [turns, setTurns] = useState<CareTurn[]>([]);
  const [pending, setPending] = useState<PendingQuestion | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "sending" | "checking" | "clearing"
  >("idle");
  const [error, setError] = useState("");
  const [recoverable, setRecoverable] = useState<string | null>(null);
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
  function restore() {
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
  async function send(message: string) {
    restore();
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
      requestId: crypto.randomUUID(),
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
      const id = hint.current?.conversationId ?? lastConversation.current;
      if (id) {
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
