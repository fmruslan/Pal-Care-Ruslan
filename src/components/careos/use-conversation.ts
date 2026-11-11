"use client";

import { useRef, useState } from "react";
import type {
  CareContext,
  CareTurn,
  Conversation,
  TurnInput,
} from "@/lib/careos/contracts";
import {
  careApi as requestApi,
  CareHttpError,
  careMessage,
  conversationKey as careConversationKey,
  pendingKey as carePendingKey,
  readPending,
  readUnsent,
  unsentKey as careUnsentKey,
  type PendingQuestion,
} from "./conversation-client";

export function useConversation(channel: "care" | "records" = "care") {
  const conversationKey =
    channel === "care"
      ? careConversationKey
      : "palcare-records-conversation-v1";
  const pendingKey =
    channel === "care" ? carePendingKey : "palcare-records-pending-v1";
  const unsentKey =
    channel === "care" ? careUnsentKey : "palcare-records-unsent-v1";
  const careApi = <T>(path: string, method = "GET", body?: unknown) =>
    requestApi<T>(path, method, body, channel);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const current = useRef<Conversation | null>(null);
  const [pending, setPendingState] = useState<PendingQuestion | null>(null);
  const pendingRef = useRef<PendingQuestion | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "restoring" | "sending" | "checking" | "clearing"
  >("idle");
  const locked = useRef(false);
  const initialized = useRef(false);
  const initializing = useRef<Promise<Conversation | null> | null>(null);
  const selectedId = useRef<string | null>(null);
  const detached = useRef(false);
  const [error, setError] = useState("");
  const [unsent, setUnsent] = useState<PendingQuestion[]>([]);
  const unsentRef = useRef<PendingQuestion[]>([]);
  const unsentLoaded = useRef(false);
  function loadUnsent() {
    if (unsentLoaded.current) return;
    unsentLoaded.current = true;
    try {
      unsentRef.current = readUnsent(sessionStorage.getItem(unsentKey));
      setUnsent(unsentRef.current);
    } catch {
      /* Optional tab-local recovery storage. */
    }
  }
  function rememberUnsent(question: PendingQuestion) {
    loadUnsent();
    const values = [
      ...unsentRef.current.filter(
        (v) => v.input.requestId !== question.input.requestId,
      ),
      { ...question, conversationId: null, status: "not-sent" as const },
    ].slice(-10);
    unsentRef.current = values;
    setUnsent(values);
    try {
      sessionStorage.setItem(
        unsentKey,
        JSON.stringify(
          values.map(({ status: _status, ...v }) => {
            void _status;
            return v;
          }),
        ),
      );
    } catch {
      /* The in-memory draft remains usable. */
    }
  }

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
    selectedId.current = value.id;
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
  async function ensure(createIfMissing = true) {
    loadUnsent();
    if (current.current) return current.current;
    if (initializing.current) return initializing.current;
    initializing.current = (async () => {
      let id: string | null = selectedId.current;
      try {
        if (!detached.current) id ??= sessionStorage.getItem(conversationKey);
        if (!initialized.current) {
          const restored = readPending(sessionStorage.getItem(pendingKey));
          // A just-submitted question takes precedence over a storage hint.
          if (!pendingRef.current) {
            if (restored?.status === "not-sent") {
              rememberUnsent(restored);
              storePending(null);
            } else storePending(restored);
          }
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
            pendingRef.current?.conversationId
          )
            throw error;
          if (!createIfMissing) return null;
          value = await careApi<Conversation>("", "POST", {});
        }
      } else {
        if (!createIfMissing) return null;
        value = await careApi<Conversation>("", "POST", {});
      }
      save(value);
      return value;
    })();
    try {
      return await initializing.current;
    } finally {
      initializing.current = null;
    }
  }
  /** Detach is local only. Dispatched uncertainty must be recovered, not hidden. */
  function canDetach() {
    if (locked.current || pendingRef.current) return false;
    try {
      const saved = readPending(sessionStorage.getItem(pendingKey));
      return (
        !saved ||
        saved.status === "not-sent" ||
        !!current.current?.turns.some(
          (turn) => turn.requestId === saved.input.requestId,
        )
      );
    } catch {
      return initialized.current;
    }
  }
  function detach() {
    if (!canDetach()) return false;
    current.current = null;
    selectedId.current = null;
    detached.current = true;
    initialized.current = true;
    setConversation(null);
    setError("");
    unsentRef.current = [];
    setUnsent([]);
    unsentLoaded.current = false;
    try {
      sessionStorage.removeItem(conversationKey);
    } catch {
      /* A detached in-memory channel never inherits an old storage identity. */
    }
    return true;
  }
  async function restore(createIfMissing: boolean | string = true) {
    if (locked.current) return null;
    if (typeof createIfMissing === "string") {
      if (!/^[a-f0-9-]{36}$/.test(createIfMissing)) return null;
      let recoveringCurrent = false;
      if (!current.current && !initialized.current) {
        try {
          const recovery = readPending(sessionStorage.getItem(pendingKey));
          recoveringCurrent = recovery?.conversationId === createIfMissing;
        } catch {
          /* Unavailable hints cannot authorize detachment. */
        }
      }
      if (
        current.current?.id !== createIfMissing &&
        selectedId.current !== createIfMissing &&
        !recoveringCurrent &&
        !detach()
      )
        return null;
      selectedId.current = createIfMissing;
      try {
        sessionStorage.setItem(conversationKey, createIfMissing);
      } catch {
        /* Explicit owned GET works without optional storage. */
      }
    }
    locked.current = true;
    setPhase("restoring");
    setError("");
    try {
      const value = await ensure(createIfMissing === true);
      if (!value) return null;
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
  async function send(
    input: TurnInput,
    context: CareContext | null,
    target: "turns" | "interpret" = "turns",
    onAnswered?: (turn: CareTurn) => void,
  ) {
    if (locked.current || pendingRef.current) return false;
    // Read an existing hint before admitting a new submission, even if the panel was never opened.
    if (!initialized.current) {
      try {
        const restored = readPending(sessionStorage.getItem(pendingKey));
        if (restored) {
          if (restored.status === "not-sent") {
            rememberUnsent(restored);
            storePending(null);
          } else {
            storePending(restored);
            return false;
          }
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
      if (!value) throw new Error("careos_conversation_unavailable");
      question = { ...question, conversationId: value.id };
      storePending(question);
      dispatched = true;
      const turn = await careApi<CareTurn>(
        `/${value.id}/${target}`,
        "POST",
        input,
      );
      save({
        ...current.current!,
        turns: [
          ...current.current!.turns.filter(
            (prior) => prior.requestId !== turn.requestId,
          ),
          turn,
        ],
      });
      onAnswered?.(turn);
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
        if (!dispatched) {
          rememberUnsent(question);
          storePending(null);
        } else storePending({ ...question, status: "uncertain" });
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
      // Opening can skip restoration when access is denied/expired. Hydrate
      // recovery identities without creating or replaying any server request.
      let storedId: string | null = null;
      try {
        const restored = readPending(sessionStorage.getItem(pendingKey));
        if (!pendingRef.current && restored) storePending(restored);
        const value = sessionStorage.getItem(conversationKey);
        if (value && /^[a-f0-9-]{36}$/.test(value)) storedId = value;
      } catch {
        if (!initialized.current)
          throw new Error("careos_recovery_unavailable");
      }
      const ids = new Set(
        [
          current.current?.id,
          pendingRef.current?.conversationId,
          storedId,
        ].filter((id): id is string => !!id),
      );
      for (const id of ids) {
        try {
          await careApi(`/${id}`, "DELETE");
        } catch (e) {
          if (!(e instanceof CareHttpError) || e.status !== 404) throw e;
        }
      }
      current.current = null;
      selectedId.current = null;
      setConversation(null);
      storePending(null);
      unsentRef.current = [];
      setUnsent([]);
      try {
        sessionStorage.removeItem(conversationKey);
        sessionStorage.removeItem(unsentKey);
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
  return {
    conversation,
    pending,
    unsent,
    phase,
    error,
    restore,
    send,
    check,
    clear,
    canDetach,
    detach,
    start: detach,
  };
}
