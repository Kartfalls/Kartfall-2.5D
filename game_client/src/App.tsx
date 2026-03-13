import { useState, useCallback, useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { PhaserGame } from "./game/PhaserGame";
import { LobbyScreen } from "./ui/LobbyScreen";
import { LoadingScreen } from "./ui/LoadingScreen";
import { GameHUD } from "./ui/GameHUD";
import { CountdownOverlay } from "./ui/CountdownOverlay";
import { ResultsScreen } from "./ui/ResultsScreen";
import { BettingPanel } from "./ui/BettingPanel";
import { Leaderboard } from "./ui/Leaderboard";
import { useKartfallRoom } from "./net/useRoom";
import { useProfile } from "./net/useProfile";
import { useYellowStatus } from "./net/useYellowStatus";
import type { Room } from "@colyseus/sdk";
import { EventBus } from "./game/EventBus";
import { EscapeMenu } from "./ui/EscapeMenu";

const KART_COLORS = ["yellow", "red", "purple", "black"] as const;

export default function App() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const [token, setToken] = useState<string | null>(null);
  const [joinOptions, setJoinOptions] = useState<{
    name: string;
    roomCode?: string;
    isSpectator?: boolean;
    gameMode?: string;
    stakeAmount?: number;
  } | null>(null);

  // Fetch a fresh Privy access token whenever the user is authenticated
  useEffect(() => {
    if (!ready || !authenticated) {
      setToken(null);
      return;
    }
    getAccessToken().then((t) => setToken(t));
  }, [ready, authenticated, getAccessToken]);

  const { room, phase, error } = useKartfallRoom(token, joinOptions);
  const {
    profile,
    loading: profileLoading,
    error: profileError,
    updateName,
    refresh: refreshProfile,
  } = useProfile(token);
  const {
    status: yellowStatus,
    loading: yellowLoading,
  } = useYellowStatus(token);

  const [showEscapeMenu, setShowEscapeMenu] = useState(false);

  const handleJoin = useCallback(
    async (
      name: string,
      roomCode?: string,
      isSpectator?: boolean,
      gameMode?: string,
      stakeAmount?: number,
    ) => {
      // Persist the selected name before creating/joining
      await updateName(name);
      setJoinOptions({ name, roomCode, isSpectator, gameMode, stakeAmount });
    },
    [updateName],
  );

  const handleLeave = useCallback(() => {
    room?.leave();
    sessionStorage.removeItem("kartfall_reconnection_token");
    setJoinOptions(null);
    void refreshProfile();
  }, [room, refreshProfile]);

  // Ensure any "return-to-menu" event (from Phaser scenes or UI)
  // also triggers a clean React-side leave.
  useEffect(() => {
    const handleReturnToMenu = () => {
      handleLeave();
    };
    EventBus.on("return-to-menu", handleReturnToMenu);
    return () => {
      EventBus.off("return-to-menu", handleReturnToMenu);
    };
  }, [handleLeave]);

  // When an error occurs, clear joinOptions so loading spinner stops
  // and the user can see the error and try again
  useEffect(() => {
    if (error) {
      setJoinOptions(null);
    }
  }, [error]);

  // ── Escape Menu Toggle ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only toggle if in a room and playing
      if (e.key === "Escape" && room && phase === "playing") {
        setShowEscapeMenu((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [room, phase]);

  // ── Pre-join: show lobby/join screen ──
  if (!ready || (authenticated && token === null)) {
    return <LoadingScreen />;
  }

  if (!room) {
    return (
      <LobbyScreen
        onJoin={handleJoin}
        error={error ?? profileError ?? undefined}
        isConnecting={!!joinOptions && !error}
        authenticated={!!(ready && authenticated)}
        onLogin={login}
        profile={profile}
        profileLoading={profileLoading}
        onUpdateProfileName={updateName}
        yellowStatus={yellowStatus}
        yellowLoading={yellowLoading}
      />
    );
  }

  // ── In-room: Phaser game + overlays ──
  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <PhaserGame room={room as Room} />

      {phase === "lobby" && (
        <LobbyOverlay room={room as Room} onLeave={handleLeave} />
      )}

      {phase === "countdown" && <CountdownOverlay room={room as Room} />}

      {phase === "playing" && (
        <>
          <GameHUD room={room as Room} />
          {/* BettingPanel only shows for spectators — handled internally */}
          <BettingPanel room={room as Room} />
          {showEscapeMenu && (
            <EscapeMenu
              room={room as Room}
              onLeave={handleLeave}
              onResume={() => setShowEscapeMenu(false)}
            />
          )}
        </>
      )}

      {phase === "finished" && (
        <ResultsScreen room={room as Room} onLeave={handleLeave} />
      )}

      <Leaderboard room={room as Room} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   LOBBY OVERLAY — In-room waiting screen
   Shows player list, room code, ready state, game mode
   ═══════════════════════════════════════════════════════ */

interface PlayerInfo {
  sessionId: string;
  name: string;
  isReady: boolean;
  isSpectator: boolean;
  colorIndex: number;
}

function LobbyOverlay({ room, onLeave }: { room: Room; onLeave: () => void }) {
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [roomCode, setRoomCode] = useState("");
  const [gameMode, setGameMode] = useState("free");
  const [myReady, setMyReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync state from room
  useEffect(() => {
    const state = room.state as any;

    const syncPlayers = () => {
      const list: PlayerInfo[] = [];
      if (state.players) {
        state.players.forEach((player: any, sessionId: string) => {
          list.push({
            sessionId,
            name: player.name || `Player`,
            isReady: !!player.isReady,
            isSpectator: !!player.isSpectator,
            colorIndex: player.colorIndex ?? 0,
          });
        });
      }
      setPlayers(list);

      // Update own ready state
      const me = state.players?.get(room.sessionId);
      if (me) {
        setMyReady(!!me.isReady);
      }
    };

    // Initial sync
    if (state.roomCode) setRoomCode(state.roomCode);
    if (state.gameMode) setGameMode(state.gameMode);
    syncPlayers();

    // Listen for state changes
    const handler = () => {
      if (state.roomCode) setRoomCode(state.roomCode);
      if (state.gameMode) setGameMode(state.gameMode);
      syncPlayers();
    };

    room.onStateChange(handler);

    return () => {
      // Cleanup — Colyseus doesn't have off for onStateChange,
      // but the effect cleanup handles the component unmount
    };
  }, [room]);

  const handleReady = () => {
    room.send("ready", {});
    setMyReady(true);
  };

  const handleUnready = () => {
    room.send("unready", {});
    setMyReady(false);
  };

  const handleCopyCode = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      if (copiedTimeout.current) clearTimeout(copiedTimeout.current);
      copiedTimeout.current = setTimeout(() => setCopied(false), 2000);
    });
  };

  const activePlayers = players.filter((p) => !p.isSpectator);
  const spectators = players.filter((p) => p.isSpectator);

  return (
    <div className="overlay lov-root">
      <div className="lov-panel">
        {/* Corner accents */}
        <div className="lobby-corner lobby-corner--tl" />
        <div className="lobby-corner lobby-corner--tr" />
        <div className="lobby-corner lobby-corner--bl" />
        <div className="lobby-corner lobby-corner--br" />

        {/* Header */}
        <div className="lov-header">
          <h2 className="lov-title">WAITING ROOM</h2>
          <div className="lov-mode-badge" data-mode={gameMode}>
            {gameMode === "staked" ? "💎 STAKED" : "🎮 FREE"}
          </div>
        </div>

        {/* Room Code */}
        <div className="lov-code-section">
          <span className="lov-code-label">ROOM CODE</span>
          <div className="lov-code-row">
            <span className="lov-code-value">{roomCode || "..."}</span>
            <button
              className="lov-code-copy"
              onClick={handleCopyCode}
              title="Copy room code"
            >
              {copied ? "✅" : "📋"}
            </button>
          </div>
        </div>

        {/* Player List */}
        <div className="lov-player-section">
          <span className="lov-section-label">
            PLAYERS ({activePlayers.length}/4)
          </span>
          <div className="lov-player-list">
            {activePlayers.length === 0 && (
              <div className="lov-empty">No players yet...</div>
            )}
            {activePlayers.map((p) => (
              <div
                key={p.sessionId}
                className={`lov-player-row ${p.sessionId === room.sessionId ? "lov-player-me" : ""}`}
              >
                <div
                  className="lov-player-color"
                  data-color={KART_COLORS[p.colorIndex] ?? "yellow"}
                />
                <span className="lov-player-name">
                  {p.name}
                  {p.sessionId === room.sessionId && (
                    <span className="lov-you-tag">YOU</span>
                  )}
                </span>
                <span
                  className={`lov-ready-badge ${p.isReady ? "ready" : "not-ready"}`}
                >
                  {p.isReady ? "READY" : "NOT READY"}
                </span>
              </div>
            ))}
          </div>

          {spectators.length > 0 && (
            <>
              <span className="lov-section-label" style={{ marginTop: 12 }}>
                SPECTATORS ({spectators.length})
              </span>
              <div className="lov-player-list">
                {spectators.map((p) => (
                  <div
                    key={p.sessionId}
                    className={`lov-player-row lov-spectator-row ${p.sessionId === room.sessionId ? "lov-player-me" : ""}`}
                  >
                    <span className="lov-spectator-icon">👁️</span>
                    <span className="lov-player-name">
                      {p.name}
                      {p.sessionId === room.sessionId && (
                        <span className="lov-you-tag">YOU</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="lov-actions">
          {!players.find((p) => p.sessionId === room.sessionId)
            ?.isSpectator && (
              <button
                className={`lov-btn ${myReady ? "lov-btn-unready" : "lov-btn-ready"}`}
                onClick={myReady ? handleUnready : handleReady}
              >
                {myReady ? "⏸ UNREADY" : "✅ READY UP"}
              </button>
            )}
          <button className="lov-btn lov-btn-leave" onClick={onLeave}>
            🚪 LEAVE
          </button>
        </div>
      </div>
    </div>
  );
}
