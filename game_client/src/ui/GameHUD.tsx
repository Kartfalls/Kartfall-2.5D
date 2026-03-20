import { useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "@colyseus/sdk";
import { EventBus } from "../game/EventBus";
import {
  isAudioEnabled,
  readAudioSettings,
  writeAudioSettings,
  AUDIO_KEYS,
} from "../game/audio";
import {
  synthSetMuted,
  synthUnlock,
  sfxAttack,
  sfxExplosion,
  sfxHit,
  sfxPickup,
  sfxKill,
  sfxRespawn,
  sfxCountdown,
  startMusic,
  stopMusic,
} from "../game/synth";

interface HUDData {
  hp: number;
  kills: number;
  deaths: number;
  weaponType: string;
  weaponExpiresAt: number;
  remainingSeconds: number;
  isAlive: boolean;
}

interface GameHUDProps {
  room: Room;
}

const WEAPON_ICONS: Record<string, string> = {
  bullet: "🔫",
  rocket: "🚀",
  bomb: "💣",
};

const WEAPON_MAX_MS = 30_000;

export function GameHUD({ room }: GameHUDProps) {
  const [hud, setHud] = useState<HUDData>({
    hp: 100,
    kills: 0,
    deaths: 0,
    weaponType: "none",
    weaponExpiresAt: 0,
    remainingSeconds: 180,
    isAlive: true,
  });

  const [killFeed, setKillFeed] = useState<
    { killerId: string; victimId: string; id: number }[]
  >([]);

  const [muted, setMuted] = useState(() => readAudioSettings().muted);
  const [fps, setFps] = useState<number | null>(null);
  const [streakBanner, setStreakBanner] = useState<{
    label: string;
    playerName: string;
    id: number;
  } | null>(null);
  const audioEnabled = isAudioEnabled();
  const mutedRef = useRef(muted);

  // Keep ref in sync
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // ── Synth audio integration ──
  useEffect(() => {
    synthUnlock();
    startMusic();

    const onSfx = (key: string) => {
      if (mutedRef.current) return;
      switch (key) {
        case AUDIO_KEYS.SFX_EXPLOSION:
          sfxExplosion();
          break;
        case AUDIO_KEYS.SFX_HIT:
          sfxHit();
          break;
        case AUDIO_KEYS.SFX_PICKUP:
          sfxPickup();
          break;
        case AUDIO_KEYS.SFX_KILL:
          sfxKill();
          break;
        case AUDIO_KEYS.SFX_RESPAWN:
          sfxRespawn();
          break;
        case AUDIO_KEYS.SFX_COUNTDOWN:
          sfxCountdown();
          break;
        case AUDIO_KEYS.SFX_ATTACK:
          // handled by sfx-weapon for weapon-specific sound
          break;
      }
    };

    const onSfxWeapon = (weaponType: string) => {
      if (mutedRef.current) return;
      sfxAttack(weaponType);
    };

    EventBus.on("sfx", onSfx);
    EventBus.on("sfx-weapon", onSfxWeapon);

    return () => {
      EventBus.off("sfx", onSfx);
      EventBus.off("sfx-weapon", onSfxWeapon);
      stopMusic();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync mute to synth
  useEffect(() => {
    synthSetMuted(muted);
  }, [muted]);

  // ── HUD + kill feed events ──
  useEffect(() => {
    const onUpdate = (data: HUDData) => setHud(data);
    const onKill = (data: { killerId: string; victimId: string }) => {
      const entry = { ...data, id: Date.now() };
      setKillFeed((prev) => [...prev.slice(-4), entry]);
      setTimeout(() => {
        setKillFeed((prev) => prev.filter((e) => e.id !== entry.id));
      }, 4000);
    };

    EventBus.on("hud-update", onUpdate);
    EventBus.on("kill-feed", onKill);
    return () => {
      EventBus.off("hud-update", onUpdate);
      EventBus.off("kill-feed", onKill);
    };
  }, []);

  // ── Streak banner ──
  useEffect(() => {
    const onStreak = (data: { label: string; playerName: string; streak: number }) => {
      const entry = { label: data.label, playerName: data.playerName, id: Date.now() };
      setStreakBanner(entry);
      setTimeout(() => {
        setStreakBanner((prev) => (prev?.id === entry.id ? null : prev));
      }, 2200);
    };
    EventBus.on("streak-event", onStreak);
    return () => { EventBus.off("streak-event", onStreak); };
  }, []);

  // ── FPS counter ──
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let lastReport = performance.now();

    const loop = (now: number) => {
      frames++;
      if (now - lastReport >= 500) {
        setFps(Math.round((frames * 1000) / Math.max(1, now - lastReport)));
        frames = 0;
        lastReport = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const timeStr = useMemo(() => {
    const m = Math.floor(hud.remainingSeconds / 60);
    const s = hud.remainingSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [hud.remainingSeconds]);

  const hpPercent = Math.max(0, Math.min(100, hud.hp));
  const hpColor =
    hpPercent > 60 ? "#00c87a" : hpPercent > 30 ? "#FFB800" : "#ff3d3d";

  const isTimerWarn = hud.remainingSeconds <= 30 && hud.remainingSeconds > 10;
  const isTimerCrit = hud.remainingSeconds <= 10 && hud.remainingSeconds > 0;

  const weaponRemainMs = Math.max(0, hud.weaponExpiresAt - Date.now());
  const weaponExpirySec = Math.ceil(weaponRemainMs / 1000);
  const weaponPercent = Math.min(100, (weaponRemainMs / WEAPON_MAX_MS) * 100);

  const pingMs: number | null = useMemo(() => {
    const anyRoom = room as any;
    const rtt =
      anyRoom?.connection?.rtt ??
      anyRoom?.connection?.latency ??
      anyRoom?.connection?.ping ??
      null;
    return typeof rtt === "number" && Number.isFinite(rtt)
      ? Math.round(rtt)
      : null;
  }, [room]);

  const handleMuteToggle = () => {
    if (!audioEnabled) return;
    const next = !muted;
    setMuted(next);
    writeAudioSettings({ muted: next });
    EventBus.emit("audio-mute-changed", next);
  };

  // HP segments (10 bars)
  const HP_SEGS = 10;
  const filledSegs = Math.ceil((hpPercent / 100) * HP_SEGS);

  return (
    <div className="overlay" style={{ pointerEvents: "none" }}>
      {/* ── Low HP vignette ── */}
      {hud.hp < 30 && hud.isAlive && (
        <div className="hud-vignette-low-hp" />
      )}

      {/* ── Top-left: K/D ── */}
      <div className="hud-kd">
        <div className="hud-kd-badge hud-kd-badge--k">⚔️ {hud.kills}</div>
        <div className="hud-kd-badge hud-kd-badge--d">💀 {hud.deaths}</div>
      </div>

      {/* ── Top-center: HP + Timer ── */}
      <div className="hud-top-center">
        <div className="card hud-status-card">
          {/* Health */}
          <div className="hud-hp-section">
            <div className="hud-hp-label">
              <span>HEALTH</span>
              <span style={{ color: hpColor, fontWeight: 700 }}>{hud.hp}</span>
            </div>
            <div className="hud-hp-bar">
              {Array.from({ length: HP_SEGS }).map((_, i) => (
                <div
                  key={i}
                  className={`hud-hp-seg${i < filledSegs ? " filled" : ""}`}
                  style={i < filledSegs ? { background: hpColor, boxShadow: `0 0 6px ${hpColor}80` } : undefined}
                />
              ))}
            </div>
          </div>

          <div className="hud-divider" />

          {/* Timer */}
          <div
            className={`hud-timer${isTimerWarn ? " hud-timer--warn" : ""}${isTimerCrit ? " hud-timer--crit" : ""}`}
            aria-label="Remaining time"
          >
            {timeStr}
          </div>
        </div>
      </div>

      {/* ── Top-right: perf + controls ── */}
      <div className="hud-top-right" style={{ pointerEvents: "auto" }}>
        <div className="hud-perf">
          <div>{fps ?? "--"} FPS</div>
          <div>{pingMs ?? "--"} ms</div>
        </div>
        <div className="hud-icon-btns">
          <button
            className="hud-icon-btn"
            type="button"
            title="Profile"
            onClick={() => EventBus.emit("hud-profile")}
          >
            👤
          </button>
          <button
            className="hud-icon-btn"
            type="button"
            title={
              audioEnabled
                ? muted
                  ? "Unmute"
                  : "Mute"
                : "Audio disabled"
            }
            style={{ opacity: audioEnabled ? 1 : 0.45 }}
            onClick={handleMuteToggle}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <button
            className="hud-icon-btn"
            type="button"
            title="Menu (Esc)"
            onClick={() => EventBus.emit("hud-settings")}
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* ── Kill feed ── */}
      <div className="hud-killfeed">
        {killFeed.map((entry) => {
          const state = room.state as any;
          const killerName =
            state.players.get(entry.killerId)?.name ||
            entry.killerId.slice(0, 6);
          const victimName =
            state.players.get(entry.victimId)?.name ||
            entry.victimId.slice(0, 6);
          return (
            <div key={entry.id} className="hud-killfeed-entry">
              <span className="hud-kf-killer">{killerName}</span>
              <span className="hud-kf-icon">💀</span>
              <span className="hud-kf-victim">{victimName}</span>
            </div>
          );
        })}
      </div>

      {/* ── Bottom: weapon slot ── */}
      {hud.weaponType !== "none" && (
        <div className="hud-weapon-wrap">
          <div className="card hud-weapon-card">
            <div className="hud-weapon-icon">
              {WEAPON_ICONS[hud.weaponType] ?? "🎯"}
            </div>
            <div className="hud-weapon-info">
              <div className="hud-weapon-name">{hud.weaponType.toUpperCase()}</div>
              {weaponExpirySec > 0 && (
                <>
                  <div className="hud-weapon-timer">{weaponExpirySec}s</div>
                  <div className="hud-weapon-bar">
                    <div
                      className="hud-weapon-bar-fill"
                      style={{ width: `${weaponPercent}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── RESPAWNING overlay ── */}
      {!hud.isAlive && (
        <div className="hud-respawning">
          <div className="hud-respawning-text">RESPAWNING</div>
          <div className="hud-respawning-sub">prepare to re-enter</div>
        </div>
      )}

      {/* ── Kill streak banner ── */}
      {streakBanner && (
        <div className="hud-streak-banner">
          <div className="hud-streak-label">{streakBanner.label}</div>
          <div className="hud-streak-player">{streakBanner.playerName}</div>
        </div>
      )}
    </div>
  );
}
