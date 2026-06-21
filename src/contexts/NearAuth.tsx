import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { NearConnector } from "@hot-labs/near-connect";
import { Near, fromHotConnect } from "near-kit";

const NEAR_ACCOUNT_KEY = "fintrack:nearAccountId";

interface NearAuthContextType {
  accountId: string | null;
  isConnected: boolean;
  isReady: boolean;
  connect: () => void;
  disconnect: () => Promise<void>;
  near: Near | null;
  connector: NearConnector | null;
}

const NearAuthContext = createContext<NearAuthContextType | undefined>(undefined);

export function NearAuthProvider({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(NEAR_ACCOUNT_KEY);
  });
  const [isReady, setIsReady] = useState(false);
  const [near, setNear] = useState<Near | null>(null);
  const connectorRef = useRef<NearConnector | null>(null);

  useEffect(() => {
    const connector = new NearConnector({
      network: "mainnet",
      autoConnect: true,
    });
    connectorRef.current = connector;

    // Build near-kit instance wrapping the connector
    const nearInstance = new Near({
      network: "mainnet",
      wallet: fromHotConnect(connector),
    });
    setNear(nearInstance);

    connector
      .getConnectedWallet()
      .then(({ accounts }) => {
        if (accounts?.length > 0) {
          const id = accounts[0].accountId;
          setAccountId(id);
          localStorage.setItem(NEAR_ACCOUNT_KEY, id);
        } else {
          setAccountId(null);
          localStorage.removeItem(NEAR_ACCOUNT_KEY);
        }
      })
      .catch(() => {
        setAccountId(null);
        localStorage.removeItem(NEAR_ACCOUNT_KEY);
      })
      .finally(() => setIsReady(true));

    type CB = Parameters<typeof connector.on>[1];
    const onSignIn = (p: unknown) => {
      const acc = (p as { accounts: { accountId: string }[] }).accounts?.[0];
      if (acc) {
        setAccountId(acc.accountId);
        localStorage.setItem(NEAR_ACCOUNT_KEY, acc.accountId);
      }
    };
    const onSignOut = () => {
      setAccountId(null);
      localStorage.removeItem(NEAR_ACCOUNT_KEY);
    };
    connector.on("wallet:signIn", onSignIn as CB);
    connector.on("wallet:signOut", onSignOut as CB);
    return () => {
      connector.off("wallet:signIn", onSignIn as CB);
      connector.off("wallet:signOut", onSignOut as CB);
    };
  }, []);

  const connect = useCallback(() => {
    connectorRef.current?.connect().catch(() => {});
  }, []);

  const disconnect = useCallback(async () => {
    if (connectorRef.current) {
      try { await connectorRef.current.disconnect(); } catch {}
    }
    setAccountId(null);
    localStorage.removeItem(NEAR_ACCOUNT_KEY);
  }, []);

  return (
    <NearAuthContext.Provider
      value={{ accountId, isConnected: !!accountId, isReady, connect, disconnect, near, connector: connectorRef.current }}
    >
      {children}
    </NearAuthContext.Provider>
  );
}

export function useNearAuth() {
  const ctx = useContext(NearAuthContext);
  if (!ctx) throw new Error("useNearAuth must be inside NearAuthProvider");
  return ctx;
}
