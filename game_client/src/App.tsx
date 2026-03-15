import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { depositStake, type WalletLike } from "./net/yellowWallet";
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
import { ProfileScreen } from "./ui/ProfileScreen";
import type { Room } from "@colyseus/sdk";
import { EventBus } from "./game/EventBus";
import { EscapeMenu } from "./ui/EscapeMenu";

const KART_COLORS = ["yellow", "red", "purple", "black"] as const;

type WalletOption = {
  address: string;
  label: string;
};

export default function App() {
  const { ready, authenticated, login, getAccessToken, user } = usePrivy();
  const { wallets } = useWallets();
  const [token, setToken] = useState<string | null>(null);
  const [joinOptions, setJoinOptions] = useState<{
    name: string;
    roomCode?: string;
    isSpectator?: boolean;
    gameMode?: string;
    stakeAmount?: number;
    matchDuration?: number;
    walletAddress?: string;
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

  const walletOptions = useMemo(() => {
    const options: WalletOption[] = [];
    const seen = new Set<string>();
    const embedded = user?.wallet?.address;
    const formatAddress = (address: string) =>
      `${address.slice(0, 6)}...${address.slice(-4)}`;
    const addOption = (address: string, label: string) => {
      const key = address.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      options.push({ address, label });
    };

    if (embedded) {
      addOption(embedded, `Embedded (${formatAddress(embedded)})`);
    }

    let externalIndex = 1;
    wallets?.forEach((wallet) => {
      if (!wallet?.address) return;
      const isEmbedded =
        embedded && wallet.address.toLowerCase() === embedded.toLowerCase();
      if (isEmbedded) {
        addOption(
          wallet.address,
          `Embedded (${formatAddress(wallet.address)})`,
        );
      } else {
        addOption(
          wallet.address,
          `External ${externalIndex++} (${formatAddress(wallet.address)})`,
        );
      }
    });

    return options;
  }, [user?.wallet?.address, wallets]);

  const [selectedWalletAddress, setSelectedWalletAddress] = useState<
    string | null
  >(() => {
    try {
      return localStorage.getItem("kartfall_wallet_address");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!walletOptions.length) {
      setSelectedWalletAddress(null);
      return;
    }
    if (!selectedWalletAddress) {
      setSelectedWalletAddress(walletOptions[0].address);
      return;
    }
    const exists = walletOptions.some(
      (opt) =>
        opt.address.toLowerCase() === selectedWalletAddress.toLowerCase(),
    );
    if (!exists) {
      setSelectedWalletAddress(walletOptions[0].address);
    }
  }, [walletOptions, selectedWalletAddress]);

  const handleSelectWallet = useCallback((next: string) => {
    setSelectedWalletAddress(next);
    try {
      localStorage.setItem("kartfall_wallet_address", next);
    } catch {
      // ignore storage failures
    }
  }, []);

  const activeWalletAddress =
    selectedWalletAddress ||
    walletOptions[0]?.address ||
    wallets?.[0]?.address ||
    (ready && authenticated ? user?.wallet?.address : null) ||
    null;
  const [showEscapeMenu, setShowEscapeMenu] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const handleJoin = useCallback(
    async (
      name: string,
      roomCode?: string,
      isSpectator?: boolean,
      gameMode?: string,
      stakeAmount?: number,
      matchDuration?: number,
    ) => {
      // Persist the selected name before creating/joining
      await updateName(name);
      setJoinOptions({
        name,
        roomCode,
        isSpectator,
        gameMode,
        stakeAmount,
        matchDuration,
        walletAddress: activeWalletAddress ?? undefined,
      });
    },
    [updateName, activeWalletAddress],
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

  // ── Profile Overlay Toggle ──
  useEffect(() => {
    const handleOpenProfile = () => setShowProfile(true);
    EventBus.on("hud-profile", handleOpenProfile);
    return () => {
      EventBus.off("hud-profile", handleOpenProfile);
    };
  }, []);


  const baseContent = (() => {
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
          onOpenProfile={() => setShowProfile(true)}
        />
      );
    }
    return (
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        <PhaserGame room={room as Room} />

        {phase === "lobby" && (
          <LobbyOverlay
            room={room as Room}
            onLeave={handleLeave}
            activeWallet={
              wallets?.find(
                (w) =>
                  w?.address?.toLowerCase() ===
                  activeWalletAddress?.toLowerCase(),
              ) ?? null
            }
            token={token}
          />
        )}

        {phase === "countdown" && <CountdownOverlay room={room as Room} />}

        {phase === "playing" && (
          <>
            <GameHUD room={room as Room} />
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
  })();

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {baseContent}
      {showProfile && (
        <div style={{ position: "absolute", inset: 0, zIndex: 1000 }}>
          <ProfileScreen
            onBack={() => setShowProfile(false)}
            accessToken={token}
            walletOptions={walletOptions}
            selectedWalletAddress={activeWalletAddress}
            onSelectWallet={handleSelectWallet}
          />
        </div>
      )}
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

function getHttpEndpoint() {
  const wsUrl = import.meta.env.VITE_SERVER_URL || "ws://localhost:2567";
  return wsUrl.replace(/^ws(s?):/, "http$1:");
}

function LobbyOverlay({
  room,
  onLeave,
  activeWallet,
  token,
}: {
  room: Room;
  onLeave: () => void;
  activeWallet?: WalletLike | null;
  token?: string | null;
}) {
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [roomCode, setRoomCode] = useState("");
  const [gameMode, setGameMode] = useState("free");
  const [stakeAmountMicro, setStakeAmountMicro] = useState(0);
  const [myReady, setMyReady] = useState(false);
  const [stakeError, setStakeError] = useState<string | null>(null);
  const [isDepositing, setIsDepositing] = useState(false);
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
    setStakeAmountMicro(state.stakeAmountMicro ?? 0);
    syncPlayers();

    // Listen for state changes
    const handler = () => {
      if (state.roomCode) setRoomCode(state.roomCode);
      if (state.gameMode) setGameMode(state.gameMode);
      setStakeAmountMicro(state.stakeAmountMicro ?? 0);
      syncPlayers();
    };

    room.onStateChange(handler);

    room.onMessage("stake_required", (data: any) => {
      const message =
        typeof data?.message === "string"
          ? data.message
          : "Stake required before readying up.";
      setStakeError(message);
      setMyReady(false);
    });

    return () => {
      // Cleanup — Colyseus doesn't have off for onStateChange,
      // but the effect cleanup handles the component unmount
    };
  }, [room]);

  const handleReady = async () => {
    if (gameMode === "staked" && activeWallet && token) {
      setIsDepositing(true);
      setStakeError(null);
      try {
        const walletAddr = activeWallet.address ?? "";
        const base = getHttpEndpoint();
        const resp = await fetch(
          `${base}/api/yellow/status${walletAddr ? `?walletAddress=${encodeURIComponent(walletAddr)}` : ""}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!resp.ok) throw new Error("Could not fetch staking configuration");
        const yellowStatus = await resp.json();

        if (!yellowStatus.stakingAvailable) {
          throw new Error(
            "Staking is not available right now. Check your Yellow setup.",
          );
        }
        if (!yellowStatus.platformWallet) {
          throw new Error("Platform wallet not configured. Contact support.");
        }

        const stakeAmountUsdc = stakeAmountMicro / 1_000_000;
        const { txHash } = await depositStake(
          activeWallet,
          yellowStatus,
          stakeAmountUsdc,
        );
        room.send("ready", { txHash });
      } catch (err: any) {
        setStakeError(err?.message ?? "Deposit failed. Please try again.");
      } finally {
        setIsDepositing(false);
      }
    } else {
      room.send("ready", {});
      setStakeError(null);
    }
  };

  const handleUnready = () => {
    room.send("unready", {});
    setMyReady(false);
    setStakeError(null);
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
  const readyLocked = gameMode === "staked" && !!stakeError && !myReady;
  const readyLabel = isDepositing
    ? "⏳ DEPOSITING..."
    : myReady
      ? "⏸ UNREADY"
      : readyLocked
        ? "⛔ NEED STAKE"
        : "✅ READY UP";

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
              disabled={isDepositing}
              style={
                isDepositing
                  ? { opacity: 0.6, cursor: "not-allowed" }
                  : readyLocked
                    ? {
                        background: "rgba(255, 59, 59, 0.2)",
                        borderColor: "rgba(255, 59, 59, 0.6)",
                      }
                    : undefined
              }
            >
              {readyLabel}
            </button>
          )}
          <button className="lov-btn lov-btn-leave" onClick={onLeave}>
            🚪 LEAVE
          </button>
        </div>
        {stakeError && (
          <div
            style={{
              marginTop: 12,
              padding: "8px 12px",
              background: "rgba(255, 59, 59, 0.15)",
              border: "1px solid rgba(255, 59, 59, 0.4)",
              borderRadius: 8,
              fontSize: 12,
              color: "#ff6b6b",
              textAlign: "center",
            }}
          >
            {stakeError}
          </div>
        )}
      </div>
    </div>
  );
}
