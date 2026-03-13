import { useState } from "react";
import type { Room } from "@colyseus/sdk";

interface BettingPanelProps {
  room: Room;
}

/**
 * Spectator prediction market panel.
 * Only renders when the local player is a spectator.
 */
export function BettingPanel({ room }: BettingPanelProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");
  const [betAmount, setBetAmount] = useState("");
  const [marketType] = useState("next_kill");

  // Check if local user is spectator
  const state = room.state as any;
  const localPlayer = state.players?.get(room.sessionId);
  if (localPlayer && !localPlayer.isSpectator) return null;

  const handlePlaceBet = () => {
    if (!selectedPlayer || !betAmount) return;
    const amountMicro = Math.floor(parseFloat(betAmount) * 1_000_000);
    if (amountMicro <= 0) return;

    room.send("place_bet", {
      marketType,
      targetPlayerId: selectedPlayer,
      amount: amountMicro,
    });

    setSelectedPlayer("");
    setBetAmount("");
  };

  // Gather player list
  const players: { id: string; name: string }[] = [];
  state.players?.forEach((p: any, id: string) => {
    if (!p.isSpectator) {
      players.push({ id, name: p.name || id.slice(0, 6) });
    }
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 60,
        left: 16,
        width: 220,
        zIndex: 30,
        pointerEvents: "auto",
      }}
    >
      <div className="card" style={{ padding: 12 }}>
        <div
          style={{
            fontSize: 11,
            color: "var(--cyan)",
            letterSpacing: 2,
            marginBottom: 10,
            textTransform: "uppercase",
          }}
        >
          Prediction Market
        </div>

        <div style={{ fontSize: 10, color: "var(--grey)", marginBottom: 8 }}>
          Next Kill:
        </div>

        {players.map((p) => (
          <div
            key={p.id}
            onClick={() => setSelectedPlayer(p.id)}
            style={{
              padding: "4px 8px",
              fontSize: 11,
              cursor: "pointer",
              background:
                selectedPlayer === p.id
                  ? "rgba(229, 255, 0, 0.1)"
                  : "transparent",
              border:
                selectedPlayer === p.id
                  ? "1px solid var(--primary)"
                  : "1px solid var(--border)",
              marginBottom: 4,
            }}
          >
            {p.name}
          </div>
        ))}

        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
          <input
            className="input"
            type="number"
            placeholder="USDC"
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
            style={{ flex: 1, fontSize: 11 }}
            min="0.01"
            step="0.01"
          />
          <button
            className="btn"
            onClick={handlePlaceBet}
            disabled={!selectedPlayer || !betAmount}
            style={{ fontSize: 10, padding: "4px 10px" }}
          >
            BET
          </button>
        </div>
      </div>
    </div>
  );
}
