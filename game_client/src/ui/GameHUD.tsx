import { useEffect, useMemo, useState } from "react";
import type { Room } from "@colyseus/sdk";
import { EventBus } from "../game/EventBus";
import {
  isAudioEnabled,
  readAudioSettings,
  writeAudioSettings,
} from "../game/audio";

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

/**
 * In-game HUD overlay — HP, timer, K/D, weapon slot.
 */
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
  const audioEnabled = isAudioEnabled();

  useEffect(() => {
    const onUpdate = (data: HUDData) => setHud(data);
    const onKill = (data: { killerId: string; victimId: string }) => {
      const entry = { ...data, id: Date.now() };
      setKillFeed((prev) => [...prev.slice(-4), entry]);
      // Auto-remove after 4s
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

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let lastReport = last;

    const loop = (now: number) => {
      frames++;
      const dt = now - last;
      last = now;

      // Report about every ~0.5s for stability
      if (now - lastReport >= 500) {
        const elapsed = now - lastReport;
        const computed = Math.round((frames * 1000) / Math.max(1, elapsed));
        setFps(computed);
        frames = 0;
        lastReport = now;
      }

      // Avoid unused var lint; keep dt for possible future smoothing
      void dt;
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const timeStr = useMemo(() => {
    const minutes = Math.floor(hud.remainingSeconds / 60);
    const seconds = hud.remainingSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [hud.remainingSeconds]);

  const hpPercent = Math.max(0, Math.min(100, hud.hp));
  const hpColor =
    hpPercent > 60
      ? "var(--success)"
      : hpPercent > 30
        ? "#FFB800"
        : "var(--danger)";

  const weaponExpirySec = Math.max(
    0,
    Math.ceil((hud.weaponExpiresAt - Date.now()) / 1000),
  );

  const pingMs: number | null = useMemo(() => {
    const anyRoom = room as any;
    const rtt =
      anyRoom?.connection?.rtt ??
      anyRoom?.connection?.latency ??
      anyRoom?.connection?.ping ??
      null;
    return typeof rtt === "number" && Number.isFinite(rtt) ? Math.round(rtt) : null;
  }, [room]);

  return (
    <div className="overlay" style={{ pointerEvents: "none" }}>
      {/* Top-left: compact K/D (kept away from center status) */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 16,
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div
          className="card"
          style={{
            padding: "6px 10px",
            display: "flex",
            gap: 10,
            alignItems: "baseline",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--success)", fontWeight: 700 }}>
            K {hud.kills}
          </div>
          <div style={{ fontSize: 12, color: "var(--danger)", fontWeight: 700 }}>
            D {hud.deaths}
          </div>
        </div>
      </div>

      {/* Top-center: primary status (HP + timer) */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          className="card"
          style={{
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            minWidth: 360,
            justifyContent: "center",
          }}
        >
          {/* HP bar */}
          <div style={{ width: 220 }}>
            <div
              style={{
                fontSize: 10,
                color: "var(--grey)",
                marginBottom: 4,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Health
            </div>
            <div
              style={{
                width: "100%",
                height: 12,
                background: "var(--border)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${hpPercent}%`,
                  height: "100%",
                  background: hpColor,
                  transition: "width 0.2s",
                }}
              />
            </div>
          </div>

          {/* Timer */}
          <div
            style={{
              minWidth: 86,
              textAlign: "center",
              fontSize: 22,
              color: "var(--primary)",
              fontWeight: 800,
              letterSpacing: 1,
            }}
            aria-label="Remaining time"
          >
            {timeStr}
          </div>
        </div>
      </div>

      {/* Top-right: controls + perf */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 16,
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          pointerEvents: "auto",
        }}
      >
        <div style={{ textAlign: "right", lineHeight: 1.2 }}>
          <div style={{ fontSize: 11, color: "var(--white)", fontWeight: 700 }}>
            FPS: {fps ?? "--"}
          </div>
          <div style={{ fontSize: 11, color: "var(--white)", fontWeight: 700 }}>
            PING: {pingMs ?? "--"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="card"
            type="button"
            title="Profile"
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              padding: 0,
              cursor: "pointer",
              color: "var(--white)",
              pointerEvents: "auto",
            }}
            onClick={() => EventBus.emit("hud-profile")}
          >
            👤
          </button>
          <button
            className="card"
            type="button"
            title={
              audioEnabled
                ? muted
                  ? "Unmute"
                  : "Mute"
                : "Audio disabled (set VITE_ENABLE_AUDIO=true)"
            }
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              padding: 0,
              cursor: "pointer",
              color: "var(--white)",
              pointerEvents: "auto",
              opacity: audioEnabled ? 1 : 0.5,
            }}
            onClick={() => {
              if (!audioEnabled) return;
              const nextMuted = !muted;
              setMuted(nextMuted);
              writeAudioSettings({ muted: nextMuted });
              EventBus.emit("audio-mute-changed", nextMuted);
            }}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <button
            className="card"
            type="button"
            title="Settings"
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              padding: 0,
              cursor: "pointer",
              color: "var(--white)",
              pointerEvents: "auto",
            }}
            onClick={() => EventBus.emit("hud-settings")}
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 190, // moved to right to make room for minimap
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
        }}
      >
        {/* Weapon slot */}
        {hud.weaponType !== "none" && (
          <div
            className="card"
            style={{
              padding: "6px 10px",
              fontSize: 11,
              textTransform: "uppercase",
              color: "var(--cyan)",
            }}
          >
            <div>{hud.weaponType}</div>
            {weaponExpirySec > 0 && (
              <div style={{ fontSize: 9, color: "var(--grey)" }}>
                {weaponExpirySec}s
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Dead overlay ── */}
      {!hud.isAlive && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            fontSize: 24,
            color: "var(--danger)",
            fontWeight: 700,
          }}
        >
          RESPAWNING...
        </div>
      )}

      {/* ── Kill feed ── */}
      <div
        style={{
          position: "absolute",
          top: 64,
          right: 16,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {killFeed.map((entry) => {
          const state = room.state as any;
          const killerName =
            state.players.get(entry.killerId)?.name ||
            entry.killerId.slice(0, 6);
          const victimName =
            state.players.get(entry.victimId)?.name ||
            entry.victimId.slice(0, 6);
          return (
            <div
              key={entry.id}
              style={{
                fontSize: 10,
                color: "var(--grey)",
                background: "rgba(15,15,20,0.8)",
                padding: "2px 8px",
              }}
            >
              <span style={{ color: "var(--primary)" }}>{killerName}</span> ⚔{" "}
              <span style={{ color: "var(--danger)" }}>{victimName}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
