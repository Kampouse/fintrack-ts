import { createContext, useContext, type ReactNode } from "react";
import { useHLPositions } from "@/hooks/useHLPositions";
import { useNearAuth } from "@/contexts/NearAuth";
import { useSyncPush } from "@/lib/kv";

const HLContext = createContext<ReturnType<typeof useHLPositions> | null>(null);

export function HLProvider({ children }: { children: ReactNode }) {
  const { accountId } = useNearAuth();
  const { push: pushToKv } = useSyncPush();
  const hl = useHLPositions(accountId, pushToKv);
  return <HLContext.Provider value={hl}>{children}</HLContext.Provider>;
}

export function useHLContext() {
  const ctx = useContext(HLContext);
  if (!ctx) throw new Error("useHLContext must be inside HLProvider");
  return ctx;
}
