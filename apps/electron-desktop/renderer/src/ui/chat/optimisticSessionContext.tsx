import React from "react";
import { useLocation } from "react-router-dom";
import type { ChatAttachmentInput } from "../../store/slices/chatSlice";
import { routes } from "../routes";

export type OptimisticSession = {
  key: string;
  title: string;
  /** First user message for this session; only shown in the thread with this sessionKey. */
  firstMessage?: string;
  firstAttachments?: ChatAttachmentInput[];
};

type ContextValue = {
  optimistic: OptimisticSession | null;
  setOptimistic: (value: OptimisticSession | null) => void;
};

const OptimisticSessionContext = React.createContext<ContextValue | null>(null);

export function OptimisticSessionProvider({ children }: { children: React.ReactNode }) {
  const [optimistic, setOptimistic] = React.useState<OptimisticSession | null>(null);
  const value = React.useMemo(() => ({ optimistic, setOptimistic }), [optimistic]);
  return (
    <OptimisticSessionContext.Provider value={value}>{children}</OptimisticSessionContext.Provider>
  );
}

/** Syncs location.state.optimisticNewSession into context when navigating with that state. */
export function OptimisticSessionSync() {
  const location = useLocation();
  const { setOptimistic } = useOptimisticSession();
  React.useEffect(() => {
    if (location.pathname !== routes.chat) {
      setOptimistic(null);
      return;
    }
    const state = location.state as {
      optimisticNewSession?: OptimisticSession;
      pendingFirstMessage?: string;
      pendingFirstAttachments?: ChatAttachmentInput[];
    } | null;
    if (state?.optimisticNewSession) {
      setOptimistic({
        ...state.optimisticNewSession,
        firstMessage: state.pendingFirstMessage,
        firstAttachments: state.pendingFirstAttachments,
      });
    }
  }, [location.pathname, location.state, setOptimistic]);
  return null;
}

export function useOptimisticSession(): ContextValue {
  const ctx = React.useContext(OptimisticSessionContext);
  if (!ctx) {
    throw new Error("useOptimisticSession must be used within OptimisticSessionProvider");
  }
  return ctx;
}
