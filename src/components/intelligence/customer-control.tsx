"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useInsightsConversation,
  type InsightsRun,
} from "./use-insights-conversation";
import type { RecordsResult } from "@/lib/careos/records/contracts";
type RecordsRun = (
  result: RecordsResult,
  signal: AbortSignal,
  // Legacy callers may omit identity, but cannot establish correlated proof.
  requestId?: string,
) => Promise<void>;
type Control = ReturnType<typeof useInsightsConversation> & {
  connected: boolean;
  register: (run: InsightsRun, reset?: () => void) => () => void;
  registerRecords: (run: RecordsRun) => () => void;
  applyRecords: RecordsRun;
  cancelRecords: () => void;
  registerDeparture: (release: () => void) => () => void;
  prepareDeparture: () => void;
};
const Context = createContext<Control | null>(null);
/** Passive links can render without a mounted workspace/control host (SSR). */
export function useWorkspaceDeparture() {
  return useContext(Context)?.prepareDeparture;
}
export function useInsightsControl() {
  const value = useContext(Context);
  if (!value) throw new Error("Insights control host missing.");
  return value;
}
export function InsightsControlProvider({ children }: { children: ReactNode }) {
  const handler = useRef<InsightsRun | null>(null);
  const recordsHandler = useRef<RecordsRun | null>(null);
  const recordsAction = useRef<AbortController | null>(null);
  const departure = useRef(new Set<() => void>());
  const [connected, setConnected] = useState(false);
  const resetHandler = useRef<(() => void) | undefined>(undefined);
  const conversation = useInsightsConversation(handler, resetHandler);
  const cancel = useRef(conversation.cancel);
  useEffect(() => {
    cancel.current = conversation.cancel;
  }, [conversation.cancel]);
  const register = useCallback((run: InsightsRun, reset?: () => void) => {
    handler.current = run;
    resetHandler.current = reset;
    setConnected(true);
    return () => {
      if (handler.current !== run) return;
      cancel.current();
      handler.current = null;
      setConnected(false);
    };
  }, []);
  const registerRecords = useCallback((run: RecordsRun) => {
    recordsHandler.current = run;
    return () => {
      if (recordsHandler.current === run) recordsHandler.current = null;
    };
  }, []);
  const applyRecords = useCallback(
    async (result: RecordsResult, signal: AbortSignal, requestId?: string) => {
      if (!recordsHandler.current) throw new Error("insights_not_ready");
      recordsAction.current?.abort();
      const controller = new AbortController();
      recordsAction.current = controller;
      try {
        await recordsHandler.current(
          result,
          AbortSignal.any([signal, controller.signal]),
          requestId,
        );
        if (controller.signal.aborted || signal.aborted)
          throw new Error("insights_cancelled");
      } finally {
        if (recordsAction.current === controller) recordsAction.current = null;
      }
    },
    [],
  );
  const cancelRecords = useCallback(() => recordsAction.current?.abort(), []);
  const registerDeparture = useCallback((release: () => void) => {
    departure.current.add(release);
    return () => {
      departure.current.delete(release);
    };
  }, []);
  const prepareDeparture = useCallback(() => {
    recordsAction.current?.abort();
    for (const release of departure.current) release();
  }, []);
  return (
    <Context.Provider
      value={{
        connected,
        ...conversation,
        register,
        registerRecords,
        applyRecords,
        cancelRecords,
        registerDeparture,
        prepareDeparture,
      }}
    >
      {children}
    </Context.Provider>
  );
}
