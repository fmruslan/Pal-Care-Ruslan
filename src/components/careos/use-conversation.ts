"use client";

import { useRef, useState } from "react";
import type {
  CareContext,
  CareTurn,
  Conversation,
  TurnInput,
} from "@/lib/careos/contracts";
import {
  careApi,
  CareHttpError,
  careMessage,
  conversationKey,
  pendingKey,
  readPending,
  type PendingQuestion,
} from "./conversation-client";

export function useConversation() {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const current = useRef<Conversation | null>(null);
  const [pending, setPendingState] = useState<PendingQuestion | null>(null);
  const pendingRef = useRef<PendingQuestion | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "restoring" | "sending" | "checking" | "clearing"
  >("idle");
  const locked = useRef(false);
  const initialized = useRef(false);
  const initializing = useRef<Promise<Conversation> | null>(null);
  const [error, setError] = useState("");

  function storePending(value: PendingQuestion | null) {
    pendingRef.current = value;
    setPendingState(value);
    try {
      if (value) {
        const { status: _status, ...snapshot } = value;
        void _status;
        sessionStorage.setItem(pendingKey, JSON.stringify(snapshot));
      } else sessionStorage.removeItem(pendingKey);
    } catch {
      /* In-memory interaction still works if storage is denied. */
    }
  }
  function save(value: Conversation) {
    current.current = value;
    setConversation(value);
    if (
      pendingRef.current &&
      value.turns.some(
        (turn) => turn.requestId === pendingRef.current!.input.requestId,
      )
    )
      storePending(null);
    try {
      sessionStorage.setItem(conversationKey, value.id);
    } catch {
      /* Optional. */
    }
  }
  async function ensure() {
    if (current.current) return current.current;
    if (initializing.current) return initializing.current;
    initializing.current = (async () => {
      let id: string | null = null;
      try {
        id = sessionStorage.getItem(conversationKey);
        if (!initialized.current) {
          const restored = readPending(sessionStorage.getItem(pendingKey));
          // A just-submitted question takes precedence over a storage hint.
          if (!pendingRef.current) storePending(restored);
          id = restored?.conversationId ?? id;
        }
      } catch {
        /* Optional. */
      }
      initialized.current = true;
      let value: Conversation;
      if (id && /^[a-f0-9-]{36}$/.test(id)) {
        try {
          value = await careApi<Conversation>(`/${id}`);
        } catch (error) {
          if (
            !(error instanceof CareHttpError) ||
            error.status !== 404 ||
            pendingRef.current
          )
            throw error;
          value = await careApi<Conversation>("", "POST", {});
        }
      } else value = await careApi<Conversation>("", "POST", {});
      save(value);
      return value;
    })();
    try {
      return await initializing.current;
    } finally {
      initializing.current = null;
    }
  }
  async function restore() {
    if (locked.current) return null;
    locked.current = true;
    setPhase("restoring");
    setError("");
    try {
      const value = await ensure();
      // Reopen checks uncertain work through GET only, never repeats the turn POST.
      if (pendingRef.current?.conversationId) {
        const saved = await careApi<Conversation>(`/${value.id}`);
        save(saved);
        return saved;
      }
      return value;
    } catch (e) {
      setError(careMessage(e));
      return null;
    } finally {
      locked.current = false;
      setPhase("idle");
    }
  }
  async function check() {
    if (locked.current || !pendingRef.current?.conversationId) return;
    locked.current = true;
    setPhase("checking");
    setError("");
    try {
      save(
        await careApi<Conversation>(`/${pendingRef.current.conversationId}`),
      );
      if (pendingRef.current)
        setError(
          "No saved answer yet. Your original question has not been sent again. You can check later or clear this conversation.",
        );
    } catch (e) {
      setError(careMessage(e));
    } finally {
      locked.current = false;
      setPhase("idle");
    }
  }
  async function send(input: TurnInput, context: CareContext | null) {
    if (locked.current || pendingRef.current) return false;
    // Read an existing hint before admitting a new submission, even if the panel was never opened.
    if (!initialized.current) {
      try {
        const restored = readPending(sessionStorage.getItem(pendingKey));
        if (restored) {
          storePending(restored);
          return false;
        }
      } catch {
        /* Optional. */
      }
    }
    locked.current = true;
    setPhase("sending");
    setError("");
    let question: PendingQuestion = {
      input,
      context,
      conversationId: null,
      createdAt: Date.now(),
      status: "sending",
    };
    storePending(question);
    let dispatched = false;
    try {
      const value = await ensure();
      question = { ...question, conversationId: value.id };
      storePending(question);
      dispatched = true;
      const turn = await careApi<CareTurn>(`/${value.id}/turns`, "POST", input);
      save({
        ...current.current!,
        turns: [
          ...current.current!.turns.filter(
            (prior) => prior.requestId !== turn.requestId,
          ),
          turn,
        ],
      });
    } catch (e) {
      if (dispatched) {
        // The route may have persisted a terminal unavailable result before returning an error.
        try {
          save(await careApi<Conversation>(`/${question.conversationId}`));
        } catch {
          /* Preserve uncertainty; a missing turn is not proof of non-dispatch. */
        }
      }
      if (pendingRef.current) {
        storePending({
          ...question,
          status: dispatched ? "uncertain" : "not-sent",
        });
        setError(careMessage(e));
      }
    } finally {
      locked.current = false;
      setPhase("idle");
    }
    return true;
  }
  async function clear() {
    // Restoration and deletion cannot overlap; controls reflect this same synchronous guard.
    if (locked.current) return;
    locked.current = true;
    setPhase("clearing");
    setError("");
    try {
      const id = current.current?.id ?? pendingRef.current?.conversationId;
      if (id) {
        try {
          await careApi(`/${id}`, "DELETE");
        } catch (e) {
          if (!(e instanceof CareHttpError) || e.status !== 404) throw e;
        }
      }
      current.current = null;
      setConversation(null);
      storePending(null);
      try {
        sessionStorage.removeItem(conversationKey);
      } catch {
        /* Optional. */
      }
    } catch (e) {
      setError(careMessage(e));
    } finally {
      locked.current = false;
      setPhase("idle");
    }
  }
  return { conversation, pending, phase, error, restore, send, check, clear };
}
