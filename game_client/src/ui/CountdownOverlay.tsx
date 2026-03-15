import { useEffect, useRef, useState } from "react";
import type { Room } from "@colyseus/sdk";
import { sfxCountdown, synthUnlock } from "../game/synth";
import { readAudioSettings } from "../game/audio";

interface CountdownOverlayProps {
  room: Room;
}

export function CountdownOverlay({ room }: CountdownOverlayProps) {
  const [remaining, setRemaining] = useState<number>(30);
  const [goVisible, setGoVisible] = useState(false);
  const prevRemaining = useRef<number | null>(null);

  useEffect(() => {
    const state = room.state as any;
    if (state.remainingSeconds != null) {
      setRemaining(Math.ceil(state.remainingSeconds));
    }

    const onStateChange = () => {
      if (state.remainingSeconds != null) {
        setRemaining(Math.ceil(state.remainingSeconds));
      }
    };
    room.onStateChange(onStateChange);
  }, [room]);

  // Unlock AudioContext as early as possible (user already interacted to reach this screen)
  useEffect(() => { synthUnlock(); }, []);

  // Play tick sound + animate on each number change
  useEffect(() => {
    if (prevRemaining.current === remaining) return;
    prevRemaining.current = remaining;

    const { muted } = readAudioSettings();
    if (!muted) {
      if (remaining > 0) {
        sfxCountdown(false);
      } else {
        sfxCountdown(true); // GO! fanfare
      }
    }
  }, [remaining]);

  useEffect(() => {
    if (remaining <= 0 && !goVisible) {
      setGoVisible(true);
      const t = setTimeout(() => setGoVisible(false), 900);
      return () => clearTimeout(t);
    }
  }, [remaining, goVisible]);

  const isLastThree = remaining <= 3 && remaining > 0;
  const text = goVisible ? "GO!" : String(remaining);

  const colorClass = goVisible
    ? "countdown-go"
    : isLastThree
      ? "countdown-num countdown-num--crit"
      : "countdown-num";

  // Ring progress: goes from full circle at max (~10s) to empty
  const maxSec = 10;
  const progress = Math.min(1, remaining / maxSec);
  const RADIUS = 70;
  const CIRC = 2 * Math.PI * RADIUS;
  const dash = CIRC * progress;

  return (
    <div
      className="overlay"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(5, 5, 8, 0.55)",
        backdropFilter: "blur(4px)",
        zIndex: 50,
      }}
    >
      <div className="countdown-label">Match starting in</div>

      {/* Ring + number */}
      <div className="countdown-ring-wrap">
        <svg
          className="countdown-ring-svg"
          viewBox="0 0 160 160"
          width="160"
          height="160"
        >
          {/* Track */}
          <circle
            cx="80"
            cy="80"
            r={RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="6"
          />
          {/* Progress arc */}
          <circle
            cx="80"
            cy="80"
            r={RADIUS}
            fill="none"
            stroke={goVisible ? "#00c87a" : isLastThree ? "#ff3d3d" : "#e5ff00"}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${CIRC}`}
            strokeDashoffset={0}
            transform="rotate(-90 80 80)"
            style={{ transition: "stroke-dasharray 0.4s ease, stroke 0.2s" }}
          />
        </svg>

        <div className={colorClass} key={text}>
          {text}
        </div>
      </div>

      {!goVisible && remaining > 3 && (
        <div className="countdown-sub">
          {remaining <= 10 ? "⚡ imminent" : "get ready"}
        </div>
      )}
    </div>
  );
}
