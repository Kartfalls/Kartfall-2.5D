import { useCallback, useEffect, useState } from "react";
import { getHttpEndpoint } from "./http";

export interface MatchBalance {
  matchId: string | null;
  channelId: string | null;
  walletAddress: string;
  walletBalance: string;
  unredeemed: string;
  asset: string;
  assetAddress?: string;
  custodyAddress?: string;
  assetDecimals: number;
  chainId: number | null;
}

export function useMatchBalance(
  token: string | null,
  matchId?: string | null,
  walletAddress?: string | null,
) {
  const [balance, setBalance] = useState<MatchBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token || !token.includes(".")) {
      setBalance(null);
      setError(null);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const base = getHttpEndpoint();
      const params = new URLSearchParams();
      if (matchId) params.set("matchId", matchId);
      if (walletAddress) params.set("walletAddress", walletAddress);
      const query = params.toString();
      const resp = await fetch(
        `${base}/api/match/balance${query ? `?${query}` : ""}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      const data = (await resp.json()) as MatchBalance;
      setBalance(data);
      return data;
    } catch (err: any) {
      setError(err?.message ?? "Failed to load match balance");
      return null;
    } finally {
      setLoading(false);
    }
  }, [token, matchId, walletAddress]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { balance, loading, error, refresh };
}
