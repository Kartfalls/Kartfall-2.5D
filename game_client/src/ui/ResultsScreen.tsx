import { useEffect, useState } from "react";
import type { Room } from "@colyseus/sdk";
import { EventBus } from "../game/EventBus";

interface LeaderboardEntryData {
  playerId: string;
  name: string;
  kills: number;
  deaths: number;
  score: number;
  payoutMicro: number;
}

interface ResultsScreenProps {
  room: Room;
  onLeave: () => void;
}

/**
 * Premium arcade-styled Results Screen.
 * Appears over the game canvas when the match concludes.
 */
export function ResultsScreen({ room, onLeave }: ResultsScreenProps) {
  const [results, setResults] = useState<{
    winnerName: string;
    leaderboard: LeaderboardEntryData[];
    rakeAmount: number;
  } | null>(null);

  useEffect(() => {
    const onFinished = (data: any) => {
      setResults({
        winnerName: data.winnerName ?? "Unknown",
        leaderboard: data.leaderboard ?? [],
        rakeAmount: data.rakeAmount ?? 0,
      });
    };

    EventBus.on("game-finished", onFinished);
    return () => {
      EventBus.off("game-finished", onFinished);
    };
  }, []);

  // Fallback: read from room state if game-finished was missed
  useEffect(() => {
    if (results) return;

    const state = room.state as any;
    if (state.leaderboard?.length > 0) {
      const entries: LeaderboardEntryData[] = [];
      state.leaderboard.forEach((e: any) => {
        entries.push({
          playerId: e.playerId,
          name: e.name || "Player",
          kills: e.kills,
          deaths: e.deaths,
          score: e.score,
          payoutMicro: e.payoutMicro ?? 0,
        });
      });
      setResults({
        winnerName: entries[0]?.name ?? "Unknown",
        leaderboard: entries,
        rakeAmount: 0,
      });
    }
  }, [room, results]);

  const handlePlayAgain = () => {
    EventBus.emit("return-to-menu");
    onLeave(); // Disconnects from current room and drops React out of connected state
  };

  return (
    <div className="res-root">
      {/* Background decorations matched to lobby */}
      <div className="lobby-scanlines" style={{ zIndex: -1, opacity: 0.5 }} />
      <div className="lobby-vignette" style={{ zIndex: -1 }} />

      <div className="res-panel">
        {/* Corner accents (re-using lobby styling) */}
        <div className="lobby-corner lobby-corner--tl" />
        <div className="lobby-corner lobby-corner--tr" />
        <div className="lobby-corner lobby-corner--bl" />
        <div className="lobby-corner lobby-corner--br" />

        <h2 className="res-title">MATCH OVER</h2>

        {results ? (
          <>
            <h3 className="res-subtitle">🏆 CHAMPION: {results.winnerName}</h3>

            <div className="res-table-container">
              <table className="res-table">
                <thead>
                  <tr>
                    <th>RANK</th>
                    <th style={{ textAlign: "left" }}>DRIVER</th>
                    <th>SCORE</th>
                    <th>K</th>
                    <th>D</th>
                    <th style={{ textAlign: "right", paddingRight: "24px" }}>
                      PAYOUT
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.leaderboard.map((entry, index) => {
                    const isWinner = index === 0;
                    return (
                      <tr
                        key={entry.playerId}
                        className={isWinner ? "res-winner" : ""}
                      >
                        <td style={{ fontWeight: isWinner ? 800 : 400 }}>
                          #{index + 1}
                        </td>
                        <td
                          style={{
                            textAlign: "left",
                            fontWeight: isWinner ? 700 : 400,
                          }}
                        >
                          {entry.name}
                          {entry.playerId === room.sessionId && (
                            <span
                              className="lov-you-tag"
                              style={{ marginLeft: "8px" }}
                            >
                              YOU
                            </span>
                          )}
                        </td>
                        <td>{entry.score}</td>
                        <td style={{ color: "var(--grey)" }}>{entry.kills}</td>
                        <td style={{ color: "var(--grey)" }}>{entry.deaths}</td>
                        <td
                          className="res-payout"
                          style={{ paddingRight: "24px" }}
                        >
                          {entry.payoutMicro > 0
                            ? `+ ${(entry.payoutMicro / 1_000_000).toFixed(2)} USDC`
                            : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {results.rakeAmount > 0 ? (
              <div className="res-metrics">
                <span className="res-metric-item">PLATFORM RAKE (4%)</span>
                <span
                  className="res-metric-item"
                  style={{ color: "var(--primary)" }}
                >
                  {(results.rakeAmount / 1_000_000).toFixed(2)} USDC
                </span>
              </div>
            ) : (
              <div className="res-metrics">
                <span className="res-metric-item">GAME MODE: FREEPLAY</span>
                <span className="res-metric-item">READY UP FOR NEXT MATCH</span>
              </div>
            )}
          </>
        ) : (
          <div
            style={{
              padding: "40px",
              color: "var(--grey)",
              letterSpacing: "2px",
            }}
          >
            CALCULATING RESULTS...
          </div>
        )}

        {/* Action Buttons */}
        <div className="res-actions">
          <button
            className="btn res-btn lov-btn-ready"
            onClick={handlePlayAgain}
          >
            ⚔️ PLAY AGAIN
          </button>
          <button
            className="btn res-btn lov-btn-leave"
            onClick={() => {
              EventBus.emit("return-to-menu");
              onLeave();
            }}
          >
            🚪 MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
}
