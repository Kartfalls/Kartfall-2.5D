import { useCallback, useEffect, useState } from "react";

export interface PlayerProfile {
  privyUserId: string;
  walletAddress: string;
  displayName: string;
  totalKills: number;
  totalDeaths: number;
  totalWins: number;
  totalGames: number;
  xp: number;
  level: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  coins: number;
  createdAt: number;
  lastSeen: number;
}

interface UseProfileResult {
  profile: PlayerProfile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateName: (name: string) => Promise<PlayerProfile | null>;
}

function getHttpEndpoint(): string {
  const wsUrl = import.meta.env.VITE_SERVER_URL || "ws://localhost:2567";
  return wsUrl.replace(/^ws(s?):/, "http$1:");
}

export function useProfile(token: string | null): UseProfileResult {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token || !token.includes(".")) {
      setProfile(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const base = getHttpEndpoint();
      const resp = await fetch(`${base}/api/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!resp.ok) {
        throw new Error(`Failed to load profile (${resp.status})`);
      }

      const nextProfile = (await resp.json()) as PlayerProfile;
      setProfile(nextProfile);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const updateName = useCallback(
    async (name: string): Promise<PlayerProfile | null> => {
      const trimmed = name.trim().slice(0, 24);
      if (!trimmed) return profile;

      if (!token || !token.includes(".")) {
        return profile;
      }

      try {
        const base = getHttpEndpoint();
        const resp = await fetch(`${base}/api/profile/name`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name: trimmed }),
        });

        if (!resp.ok) {
          throw new Error(`Failed to update name (${resp.status})`);
        }

        const nextProfile = (await resp.json()) as PlayerProfile;
        setProfile(nextProfile);
        return nextProfile;
      } catch (err: any) {
        setError(err?.message ?? "Failed to update name");
        return null;
      }
    },
    [token, profile],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    profile,
    loading,
    error,
    refresh,
    updateName,
  };
}
