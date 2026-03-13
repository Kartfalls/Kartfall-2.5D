import { useEffect, useState } from "react";
import type { PlayerProfile } from "../net/useProfile";

const KART_SPRITE_W = 96;
const KART_SPRITE_H = 96;
const KART_SPRITE_COLS = 9;
const KART_SPRITE_ROWS = 4;
const KART_TOTAL_DIRECTIONS = KART_SPRITE_COLS * KART_SPRITE_ROWS;

interface LobbyScreenProps {
  onJoin: (
    name: string,
    roomCode?: string,
    isSpectator?: boolean,
    gameMode?: string,
    stakeAmount?: number,
  ) => void;
  error?: string;
  isConnecting: boolean;
  authenticated: boolean;
  onLogin: () => void;
  profile?: PlayerProfile | null;
  profileLoading?: boolean;
  onUpdateProfileName?: (name: string) => Promise<PlayerProfile | null>;
  yellowStatus?: {
    stakingAvailable: boolean;
    clearnodeReachable: boolean;
    platformConfigured: boolean;
    playerBalance: string;
    asset: string;
    chainId: number | null;
    walletAddress: string;
  } | null;
  yellowLoading?: boolean;
}

export function LobbyScreen({
  onJoin,
  error,
  isConnecting,
  authenticated,
  onLogin,
  profile,
  profileLoading,
  onUpdateProfileName,
  yellowStatus,
  yellowLoading,
}: LobbyScreenProps) {
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [isSpectator, setIsSpectator] = useState(false);
  const [stakeAmount, setStakeAmount] = useState<number>(1);
  const [gameMode, setGameMode] = useState<"free" | "staked">("free");
  const [spinFrame, setSpinFrame] = useState(0);

  useEffect(() => {
    if (profile?.displayName && !name.trim()) {
      setName(profile.displayName);
    }
  }, [profile?.displayName, name]);

  // Slow spin using the 36 idle directions (9x4 sprite sheet)
  useEffect(() => {
    const id = setInterval(() => {
      setSpinFrame((f) => (f + 1) % KART_TOTAL_DIRECTIONS);
    }, 85);
    return () => clearInterval(id);
  }, []);

  const playerBalanceNum = yellowStatus?.playerBalance
    ? Number.parseFloat(yellowStatus.playerBalance)
    : 0;
  const stakingSupported = yellowStatus?.stakingAvailable ?? false;
  const stakeAffordable = playerBalanceNum >= (gameMode === "staked" ? stakeAmount : 0);

  const renderKartFrame = (scale: number) => {
    const frameX = (spinFrame % KART_SPRITE_COLS) * KART_SPRITE_W * scale;
    const frameY =
      Math.floor(spinFrame / KART_SPRITE_COLS) * KART_SPRITE_H * scale;

    return (
      <div
        aria-label="Kart preview"
        style={{
          width: KART_SPRITE_W * scale,
          height: KART_SPRITE_H * scale,
          backgroundImage: 'url("/sprites/karts/kart_yellow_idle.png")',
          backgroundRepeat: "no-repeat",
          backgroundSize: `${KART_SPRITE_COLS * KART_SPRITE_W * scale}px ${KART_SPRITE_ROWS * KART_SPRITE_H * scale}px`,
          backgroundPosition: `-${frameX}px -${frameY}px`,
          imageRendering: "pixelated",
          filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.35))",
        }}
      />
    );
  };

  const handleCreate = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    void onUpdateProfileName?.(trimmedName);
    onJoin(
      trimmedName,
      undefined,
      isSpectator,
      gameMode,
      gameMode === "staked" ? stakeAmount : 0,
    );
  };

  const handleJoin = () => {
    const trimmedName = name.trim();
    if (!trimmedName || !roomCode.trim()) return;
    void onUpdateProfileName?.(trimmedName);
    onJoin(
      trimmedName,
      roomCode.trim().toUpperCase(),
      isSpectator,
      gameMode,
      gameMode === "staked" ? stakeAmount : 0,
    );
  };

  const handlePlay = () => {
    if (!name.trim()) return;
    if (roomCode.trim()) {
      handleJoin();
    } else {
      handleCreate();
    }
  };

  return (
    <div className="sk-lobby">
      {/* ── Background ── */}
      <div className="sk-bg" />
      <div className="sk-bg-overlay" />

      {/* ── Left Sidebar ── */}
      <div className="sk-sidebar-left">
        {/* Profile Card */}
        <div className="sk-profile-card">
          <div className="sk-profile-avatar">
            <div className="sk-kart-preview">{renderKartFrame(0.8)}</div>
          </div>
          <div className="sk-profile-info">
            {authenticated ? (
              <>
                <input
                  className="sk-name-input"
                  type="text"
                  placeholder="Your Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={16}
                  autoComplete="off"
                />
                <div className="sk-auth-status">
                  {profileLoading
                    ? "⏳ Loading profile..."
                    : `LVL ${profile?.level ?? 1} • ${profile?.xp ?? 0} XP • ${profile?.coins ?? 0} COINS`}
                </div>
              </>
            ) : (
              <span className="sk-guest-name">Guest</span>
            )}
          </div>
        </div>

        {/* Game Mode */}
        <div className="sk-card">
          <div className="sk-card-title">GAME MODE</div>
          <div className="sk-mode-toggle">
            <button
              className={`sk-mode-opt ${gameMode === "free" ? "active" : ""}`}
              onClick={() => setGameMode("free")}
            >
              🎮 Free Play
            </button>
            <button
              className={`sk-mode-opt sk-mode-staked ${gameMode === "staked" ? "active" : ""}`}
              onClick={() => {
                if (!stakingSupported) return;
                setGameMode("staked");
              }}
              disabled={!stakingSupported}
              title={
                stakingSupported
                  ? ""
                  : yellowLoading
                    ? "Checking staking availability..."
                    : "Staking unavailable (clearnode or platform key not ready)"
              }
              style={{ opacity: stakingSupported ? 1 : 0.6, cursor: stakingSupported ? "pointer" : "not-allowed" }}
            >
              💎 Staked
            </button>
          </div>
          {gameMode === "staked" && (
            <div className="sk-stake-row">
              <input
                className="sk-stake-input"
                type="number"
                min={1}
                max={1000}
                value={stakeAmount || ""}
                onChange={(e) => setStakeAmount(Number(e.target.value))}
                placeholder="Amount"
              />
              <span className="sk-stake-currency">USDC</span>
            </div>
          )}
          {gameMode === "staked" && (
            <div style={{ fontSize: 11, color: "var(--grey)", marginTop: 8 }}>
              {yellowLoading
                ? "Checking staking readiness..."
                : stakingSupported
                  ? `Wallet channel balance: ${playerBalanceNum.toFixed(2)}`
                  : "Staking is not available right now."}
              {stakingSupported && !stakeAffordable && (
                <div style={{ color: "var(--danger)" }}>
                  Not enough channel balance for this stake amount.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Spectator Toggle */}
        <div className="sk-card">
          <label className="sk-toggle-label">
            <div
              className={`sk-toggle ${isSpectator ? "active" : ""}`}
              onClick={() => setIsSpectator(!isSpectator)}
              role="switch"
              aria-checked={isSpectator}
            />
            <span>{isSpectator ? "👁️ Spectator" : "🎮 Player"}</span>
          </label>
        </div>

        {/* Auth */}
        {!authenticated ? (
          <button className="sk-login-btn" onClick={onLogin}>
            🔐 Sign In
          </button>
        ) : (
          <div className="sk-auth-status">✅ Signed In</div>
        )}
      </div>

      {/* ── Center ── */}
      <div className="sk-center">
        <div className="sk-logo-wrap">
          <img
            className="sk-logo"
            src="/sprites/ui/title_logo.png"
            alt="KARTFALL"
            draggable={false}
          />
        </div>

        <div className="sk-hero-kart">
          {renderKartFrame(1.5)}
        </div>

        {/* Big Play Button */}
        {authenticated && (
          <button
            className="sk-play-btn"
            onClick={handlePlay}
            disabled={
              !name.trim() ||
              isConnecting ||
              (gameMode === "staked" && (!stakingSupported || !stakeAffordable))
            }
          >
            <span className="sk-play-icon">▶</span>
            <span className="sk-play-text">
              {isConnecting ? "CONNECTING..." : "PLAY"}
            </span>
            <span className="sk-play-arrow">▲</span>
          </button>
        )}

        {/* Create / Join */}
        {authenticated && (
          <div className="sk-sub-actions">
            <button
              className="sk-sub-btn"
              onClick={handleCreate}
              disabled={!name.trim() || isConnecting}
            >
              Create
            </button>
            <button
              className="sk-sub-btn sk-sub-join"
              onClick={handleJoin}
              disabled={!name.trim() || !roomCode.trim() || isConnecting}
            >
              Join
            </button>
          </div>
        )}

        {error && <div className="sk-error">⚠️ {error}</div>}
      </div>

      {/* ── Right Sidebar ── */}
      <div className="sk-sidebar-right">
        {/* Room Code */}
        <div className="sk-card">
          <div className="sk-card-title">JOIN A ROOM</div>
          <div className="sk-room-input-wrap">
            <span className="sk-room-icon">🔑</span>
            <input
              className="sk-room-input"
              type="text"
              placeholder="ROOM CODE"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={6}
              autoComplete="off"
            />
          </div>
        </div>

        {/* Stats / Features */}
        <div className="sk-card">
          <div className="sk-card-title">{authenticated ? "YOUR STATS" : "FEATURES"}</div>
          {authenticated && profile ? (
            <>
              <div className="sk-feature">🎯 {profile.totalKills} Kills</div>
              <div className="sk-feature">🏆 {profile.totalWins} Wins</div>
              <div className="sk-feature">🏎️ {profile.totalGames} Games Played</div>
            </>
          ) : (
            <>
              <div className="sk-feature">⚔️ 4v4 Battle Arena</div>
              <div className="sk-feature">🚀 3 Weapon Types</div>
              <div className="sk-feature">💰 Prediction Bets</div>
            </>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="sk-footer">
        <span className="sk-version">v1.1.0</span>
      </div>
    </div>
  );
}
