/**
 * React hook to join/leave a Kartfall room.
 *
 * Returns the room instance, current phase, and any connection error.
 */
import { useState, useEffect, useRef } from "react";
import { colyseusClient } from "./client";
import { getStateCallbacks, type Room } from "@colyseus/sdk";

interface UseRoomResult {
  room: Room | null;
  phase: string;
  error: string | null;
}

const RECONNECTION_KEY = "kartfall_reconnection_token";

/**
 * Resolve the Colyseus server HTTP base URL from the WS URL.
 * ws://localhost:2567 → http://localhost:2567
 * wss://example.com → https://example.com
 */
function getHttpEndpoint(): string {
  const wsUrl = import.meta.env.VITE_SERVER_URL || "ws://localhost:2567";
  return wsUrl.replace(/^ws(s?):/, "http$1:");
}

/**
 * Find a room's Colyseus roomId from its custom roomCode
 * by querying the Colyseus matchmake listing API.
 */
async function findRoomByCode(roomCode: string): Promise<string | null> {
  try {
    const httpBase = getHttpEndpoint();
    const resp = await fetch(`${httpBase}/api/rooms`);
    if (!resp.ok) return null;

    const rooms: Array<{ roomId: string; metadata?: { roomCode?: string } }> =
      await resp.json();

    const match = rooms.find((r) => r.metadata?.roomCode === roomCode);
    return match?.roomId ?? null;
  } catch (err) {
    console.warn("[findRoomByCode] fetch failed:", err);
    return null;
  }
}

export function useKartfallRoom(
  token: string | null,
  joinOptions: {
    name: string;
    roomCode?: string;
    isSpectator?: boolean;
    gameMode?: string;
    stakeAmount?: number;
    matchDuration?: number;
    walletAddress?: string;
  } | null,
): UseRoomResult {
  const [room, setRoom] = useState<Room | null>(null);
  const [phase, setPhase] = useState("lobby");
  const [error, setError] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const tokenRef = useRef<string | null>(token);
  const joinAttemptRef = useRef(0);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const attachRoom = (r: Room) => {
    roomRef.current = r;
    setRoom(r);

    const state: any = r.state as any;
    if (state?.phase) {
      setPhase(state.phase);
    }

    if (r.reconnectionToken) {
      sessionStorage.setItem(RECONNECTION_KEY, r.reconnectionToken);
    }

    const $ = getStateCallbacks<any>(r as any);
    if ($) {
      $(r.state as any).listen("phase", (value: string) => {
        setPhase(value);
      });
    } else {
      r.onStateChange((next: any) => {
        if (typeof next?.phase === "string") {
          setPhase(next.phase);
        }
      });
    }

    r.onLeave(() => {
      roomRef.current = null;
      setRoom(null);
      setPhase("lobby");
    });

    r.onError((code: number, message?: string) => {
      console.error(`[Room error] ${code}: ${message}`);
      setError(message ?? `Error ${code}`);
    });
  };

  // Attempt to reconnect automatically on mount if a token exists.
  useEffect(() => {
    const savedToken = sessionStorage.getItem(RECONNECTION_KEY);
    if (!savedToken || roomRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        const r = await colyseusClient.reconnect(savedToken);
        if (cancelled || roomRef.current) return;
        console.log("[useRoom] Reconnected using saved token");
        attachRoom(r);
      } catch (err) {
        console.log("[useRoom] Reconnection token invalid, clearing", err);
        sessionStorage.removeItem(RECONNECTION_KEY);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!joinOptions) return;
    if (roomRef.current) return;

    const attemptId = ++joinAttemptRef.current;

    (async () => {
      try {
        setError(null);

        const opts: Record<string, unknown> = {
          name: joinOptions.name,
          is_spectator: joinOptions.isSpectator ?? false,
          gameMode: joinOptions.gameMode ?? "free",
        };

        if (typeof joinOptions.stakeAmount === "number") {
          opts.stakeAmount = joinOptions.stakeAmount;
        }

        if (typeof joinOptions.matchDuration === "number") {
          opts.matchDuration = joinOptions.matchDuration;
        }

        if (joinOptions.walletAddress) {
          opts.walletAddress = joinOptions.walletAddress;
        }

        // Only send the token if it looks like a real JWT (has dots)
        const currentToken = tokenRef.current;
        if (currentToken && currentToken.includes(".")) {
          opts.accessToken = currentToken;
        }

        let r: Room | null = null;

        if (joinOptions.roomCode) {
          // Join a specific room by its custom roomCode.
          // First, find the actual Colyseus roomId for this code.
          const roomId = await findRoomByCode(joinOptions.roomCode);
          if (!roomId) {
            throw new Error(
              `Room "${joinOptions.roomCode}" not found. Check the code and try again.`,
            );
          }
          r = await colyseusClient.joinById(roomId, opts);
        } else {
          // Create a new room (use create to guarantee a fresh room)
          r = await colyseusClient.create("kartfall_room", opts);
        }

        if (attemptId !== joinAttemptRef.current) {
          return;
        }

        if (!r) throw new Error("Failed to connect to room");

        attachRoom(r);
      } catch (err: any) {
        if (attemptId === joinAttemptRef.current) {
          setError(err?.message ?? "Connection failed");
        }
      }
    })();

    return () => {
      // Invalidate this async join attempt, but do not leave an already-joined room.
      // Room leaving is handled explicitly by user actions (handleLeave).
      if (joinAttemptRef.current === attemptId) {
        joinAttemptRef.current++;
      }
    };
  }, [joinOptions]);

  useEffect(() => {
    return () => {
      // Component unmount cleanup
      roomRef.current = null;
    };
  }, []);

  return { room, phase, error };
}
