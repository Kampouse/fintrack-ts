import { useCallback } from "react";
import { useNearAuth } from "@/contexts/NearAuth";

const KV_API = "https://kv.main.fastnear.com";
const KV_CONTRACT = "contextual.near";
const SYNC_KEY = "positions";

/**
 * Read a single key from FastNear KV (public, no auth needed)
 * GET /v0/latest/{current_account_id}/{predecessor_id}/{key}
 */
export async function kvGet<T = unknown>(accountId: string, key: string): Promise<T | null> {
  const url = `${KV_API}/v0/latest/${KV_CONTRACT}/${accountId}/${key}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.entries?.[0]?.value ?? null;
}

/** Cloud sync helpers */

export async function pullPositions(accountId: string): Promise<unknown[] | null> {
  return kvGet<unknown[]>(accountId, SYNC_KEY);
}

/**
 * Push uses the connector's signAndSendTransaction directly
 * (same pattern as near-cli: near call <contract> __fastdata_kv '<args>')
 *
 * Args are serialized to JSON bytes and passed as a FunctionCall action.
 * The wallet signs the tx, it lands on chain, and FastNear KV indexes it
 * from the receipt's input data — the contract doesn't need to exist.
 */
export function useSyncPush() {
  const { connector, accountId } = useNearAuth();

  const push = useCallback(async (data: unknown[]): Promise<void> => {
    if (!connector || !accountId) throw new Error("Not connected");

    const wallet = await connector.wallet();
    const args = JSON.stringify({ [SYNC_KEY]: data });
    const argsBytes = new TextEncoder().encode(args);

    const outcome = await wallet.signAndSendTransaction({
      receiverId: KV_CONTRACT,
      actions: [
        {
          type: "FunctionCall",
          params: {
            methodName: "__fastdata_kv",
            args: JSON.parse(args),
            gas: "300000000000000",
            deposit: "0",
          },
        },
      ],
    } as any);

    // Log outcome so we can verify on-chain
    console.log("[fintrack] sync push outcome:", JSON.stringify(outcome));
  }, [connector, accountId]);

  return { push };
}
