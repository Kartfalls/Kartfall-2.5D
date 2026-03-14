import { useCallback, useEffect, useState } from "react";

export interface YellowStatus {
  stakingAvailable: boolean;
  clearnodeReachable: boolean;
  platformConfigured: boolean;
  playerBalance: string; // token amount string
  walletL1Balance?: string; // on-chain token amount string (optional)
  custodyBalance?: string; // on-chain custody balance
  assetDecimals?: number;
  asset: string;
  assetAddress?: string;
  custodyAddress?: string;
  chainId: number | null;
  walletAddress: string;
}

function getHttpEndpoint(): string {
  const wsUrl = import.meta.env.VITE_SERVER_URL || "ws://localhost:2567";
  return wsUrl.replace(/^ws(s?):/, "http$1:");
}

export function useYellowStatus(token: string | null, walletAddress?: string | null) {
  const [status, setStatus] = useState<YellowStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token || !token.includes(".")) {
      setStatus(null);
      setError(null);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const base = getHttpEndpoint();
      const query = walletAddress ? `?walletAddress=${encodeURIComponent(walletAddress)}` : "";
      const resp = await fetch(`${base}/api/yellow/status${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      const data = (await resp.json()) as YellowStatus;
      setStatus(data);
      return data;
    } catch (err: any) {
      setError(err?.message ?? "Failed to load yellow status");
      return null;
    } finally {
      setLoading(false);
    }
  }, [token, walletAddress]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, error, refresh };
}
