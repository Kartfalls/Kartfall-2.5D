import { useEffect, useState } from "react";
import type { Room } from "@colyseus/sdk";
import { EventBus } from "../game/EventBus";

interface CountdownOverlayProps {
  room: Room;
}

/**
 * Full-screen countdown overlay.
 * Shows remaining seconds from room state, then a 3-2-1-GO sequence for the final seconds.
 */
export function CountdownOverlay({ room }: CountdownOverlayProps) {
  const [remaining, setRemaining] = useState<number>(30);
  const [goVisible, setGoVisible] = useState(false);

  // Track remainingSeconds from room state
  useEffect(() => {
    const state = room.state as any;

    // Initial value
    if (state.remainingSeconds != null) {
      setRemaining(Math.ceil(state.remainingSeconds));
    }

    const onStateChange = () => {
      if (state.remainingSeconds != null) {
        setRemaining(Math.ceil(state.remainingSeconds));
      }
    };

    room.onStateChange(onStateChange);

    return () => {
      // Colyseus doesn't have offStateChange, but the room listener is cleaned up on leave
    };
  }, [room]);

  // Show "GO!" briefly when countdown finishes (phase will change to playing)
  useEffect(() => {
    if (remaining <= 0 && !goVisible) {
      setGoVisible(true);
      const t = setTimeout(() => setGoVisible(false), 800);
      return () => clearTimeout(t);
    }
  }, [remaining, goVisible]);

  const isLastThree = remaining <= 3 && remaining > 0;
  const text = goVisible ? "GO!" : String(remaining);
  const color = goVisible
    ? "var(--success)"
    : isLastThree
      ? "var(--danger)"
      : "var(--primary)";
  const fontSize = isLastThree || goVisible ? 96 : 64;

  return (
    <div
      className="overlay"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(8, 8, 9, 0.5)",
        zIndex: 50,
      }}
    >
      <div
        style={{
          fontSize: 14,
          color: "var(--grey)",
          marginBottom: 8,
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        Match starting in
      </div>
      <div
        style={{
          fontSize,
          fontWeight: 700,
          color,
          textShadow: `0 0 40px ${color}`,
          animation: "pulse 0.3s ease-out",
        }}
        key={remaining} // re-trigger animation on change
      >
        {text}
      </div>
    </div>
  );
}
