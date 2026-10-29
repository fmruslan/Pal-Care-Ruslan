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
type Control = ReturnType<typeof useInsightsConversation> & {
  connected: boolean;
  register: (run: InsightsRun, reset?: () => void) => () => void;
};
const Context = createContext<Control | null>(null);
export function useInsightsControl() {
  const value = useContext(Context);
  if (!value) throw new Error("Insights control host missing.");
  return value;
}
export function InsightsControlProvider({ children }: { children: ReactNode }) {
  const handler = useRef<InsightsRun | null>(null);
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
  return (
    <Context.Provider
      value={{
        connected,
        ...conversation,
        register,
      }}
    >
      {children}
    </Context.Provider>
  );
}
