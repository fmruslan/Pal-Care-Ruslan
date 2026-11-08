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
import type { AgReportState } from "ag-studio";
import { stateFingerprint } from "@/lib/intelligence/customer-observation";
type RecordsRun = (
  result: RecordsResult,
  signal: AbortSignal,
  // Legacy callers may omit identity, but cannot establish correlated proof.
  requestId?: string,
  restoreState?: AgReportState,
) => Promise<AgReportState>;
type ApplyRecords = (
  result: RecordsResult,
  signal: AbortSignal,
  requestId?: string,
  originalRequestId?: string,
) => Promise<void>;
type Control = ReturnType<typeof useInsightsConversation> & {
  connected: boolean;
  register: (run: InsightsRun, reset?: () => void) => () => void;
  registerRecords: (run: RecordsRun) => () => void;
  applyRecords: ApplyRecords;
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
  // Presentation-only, per mounted customer host. Never a browser-supplied
  // server result or authority. Missing snapshots fail rather than recreate.
  const verifiedRecords = useRef(
    new Map<string, { result: string; state: AgReportState }>(),
  );
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
    async (
      result: RecordsResult,
      signal: AbortSignal,
      requestId?: string,
      originalRequestId?: string,
    ) => {
      if (!recordsHandler.current) throw new Error("insights_not_ready");
      const saved = originalRequestId
        ? verifiedRecords.current.get(originalRequestId)
        : undefined;
      if (
        originalRequestId &&
        (!saved || saved.result !== stateFingerprint(result))
      )
        throw new Error("insights_original_state_unavailable");
      recordsAction.current?.abort();
      const controller = new AbortController();
      recordsAction.current = controller;
      try {
        const state = await recordsHandler.current(
          result,
          AbortSignal.any([signal, controller.signal]),
          requestId,
          saved ? structuredClone(saved.state) : undefined,
        );
        if (controller.signal.aborted || signal.aborted)
          throw new Error("insights_cancelled");
        if (
          requestId &&
          !originalRequestId &&
          !verifiedRecords.current.has(requestId)
        ) {
          verifiedRecords.current.set(requestId, {
            result: stateFingerprint(result),
            state: structuredClone(state),
          });
          if (verifiedRecords.current.size > 40)
            verifiedRecords.current.delete(
              verifiedRecords.current.keys().next().value!,
            );
        }
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
