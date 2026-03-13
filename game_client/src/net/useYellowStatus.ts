import { useCallback, useEffect, useState } from "react";

export interface YellowStatus {
  stakingAvailable: boolean;
  clearnodeReachable: boolean;
  platformConfigured: boolean;
  playerBalance: string; // token amount string
  asset: string;
  chainId: number | null;
  walletAddress: string;
}

function getHttpEndpoint(): string {
  const wsUrl = import.meta.env.VITE_SERVER_URL || "ws://localhost:2567";
  return wsUrl.replace(/^ws(s?):/, "http$1:");
}

export function useYellowStatus(token: string | null) {
  const [status, setStatus] = useState<YellowStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token || !token.includes(".")) {
      setStatus(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const base = getHttpEndpoint();
      const resp = await fetch(`${base}/api/yellow/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      const data = (await resp.json()) as YellowStatus;
      setStatus(data);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load yellow status");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, error, refresh };
}
