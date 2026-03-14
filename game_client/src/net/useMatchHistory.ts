import { useCallback, useEffect, useState } from "react";
import { getHttpEndpoint } from "./http";

export interface MatchHistoryRow {
  matchId: string;
  channelId: string;
  mode: string;
  date: number;
  stakeAmount: string;
  participants: string[];
  payouts: Record<string, unknown>;
  betBreakdown: Record<string, unknown>;
  stakeBreakdown: Record<string, unknown>;
  resultSummary: Record<string, unknown>;
  unredeemed: string;
}

export interface MatchHistoryResponse {
  walletAddress: string;
  walletBalance: string;
  asset: string;
  assetAddress?: string;
  assetDecimals: number;
  chainId: number | null;
  history: MatchHistoryRow[];
}

export function useMatchHistory(
  token: string | null,
  walletAddress?: string | null,
) {
  const [data, setData] = useState<MatchHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token || !token.includes(".")) {
      setData(null);
      setError(null);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const base = getHttpEndpoint();
      const params = new URLSearchParams();
      if (walletAddress) params.set("walletAddress", walletAddress);
      const query = params.toString();
      const resp = await fetch(
        `${base}/api/match/history${query ? `?${query}` : ""}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      const json = (await resp.json()) as MatchHistoryResponse;
      setData(json);
      return json;
    } catch (err: any) {
      setError(err?.message ?? "Failed to load match history");
      return null;
    } finally {
      setLoading(false);
    }
  }, [token, walletAddress]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
