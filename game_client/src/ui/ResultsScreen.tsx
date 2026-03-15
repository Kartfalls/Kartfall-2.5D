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

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

export function ResultsScreen({ room, onLeave }: ResultsScreenProps) {
  const [results, setResults] = useState<{
    winnerName: string;
    leaderboard: LeaderboardEntryData[];
    rakeAmount: number;
  } | null>(null);
  const roomGameMode = (room.state as any)?.gameMode;

  useEffect(() => {
    const onFinished = (data: any) => {
      setResults({
        winnerName: data.winnerName ?? "Unknown",
        leaderboard: data.leaderboard ?? [],
        rakeAmount: data.rakeAmount ?? 0,
      });
    };
    EventBus.on("game-finished", onFinished);
    return () => { EventBus.off("game-finished", onFinished); };
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
      setResults({ winnerName: entries[0]?.name ?? "Unknown", leaderboard: entries, rakeAmount: 0 });
    }
  }, [room, results]);

  const handlePlayAgain = () => {
    EventBus.emit("return-to-menu");
    onLeave();
  };

  const myRank = results?.leaderboard.findIndex(
    (e) => e.playerId === room.sessionId,
  ) ?? -1;
  const isWinner = myRank === 0;

  return (
    <div className="res-root">
      <div className="lobby-scanlines" style={{ zIndex: -1, opacity: 0.4 }} />
      <div className="lobby-vignette" style={{ zIndex: -1 }} />

      <div className="res-panel">
        <div className="lobby-corner lobby-corner--tl" />
        <div className="lobby-corner lobby-corner--tr" />
        <div className="lobby-corner lobby-corner--bl" />
        <div className="lobby-corner lobby-corner--br" />

        {/* Header */}
        {results ? (
          <div className={isWinner ? "res-outcome res-outcome--win" : "res-outcome res-outcome--loss"}>
            <div className="res-outcome-icon">{isWinner ? "🏆" : "💀"}</div>
            <div className="res-outcome-text">
              {isWinner ? "VICTORY" : myRank === -1 ? "MATCH OVER" : "DEFEAT"}
            </div>
            {!isWinner && myRank >= 0 && (
              <div className="res-outcome-rank">#{myRank + 1} PLACE</div>
            )}
          </div>
        ) : (
          <h2 className="res-title">MATCH OVER</h2>
        )}

        {results ? (
          <>
            <div className="res-champion-banner">
              <span className="res-champion-label">CHAMPION</span>
              <span className="res-champion-name">{results.winnerName}</span>
            </div>

            <div className="res-table-container">
              <table className="res-table">
                <thead>
                  <tr>
                    <th>RANK</th>
                    <th style={{ textAlign: "left" }}>DRIVER</th>
                    <th>SCORE</th>
                    <th>K</th>
                    <th>D</th>
                    <th style={{ textAlign: "right", paddingRight: 24 }}>PAYOUT</th>
                  </tr>
                </thead>
                <tbody>
                  {results.leaderboard.map((entry, i) => {
                    const isMe = entry.playerId === room.sessionId;
                    return (
                      <tr
                        key={entry.playerId}
                        className={`res-row-anim${i === 0 ? " res-winner" : ""}${isMe ? " res-row--me" : ""}`}
                        style={{ animationDelay: `${i * 80}ms` }}
                      >
                        <td className="res-rank-cell">
                          {i < 3 ? (
                            <span className="res-medal">{RANK_MEDALS[i]}</span>
                          ) : (
                            `#${i + 1}`
                          )}
                        </td>
                        <td style={{ textAlign: "left" }}>
                          {entry.name}
                          {isMe && <span className="lov-you-tag" style={{ marginLeft: 8 }}>YOU</span>}
                        </td>
                        <td style={{ fontWeight: i === 0 ? 700 : 400 }}>{entry.score}</td>
                        <td style={{ color: "var(--success)" }}>{entry.kills}</td>
                        <td style={{ color: "var(--grey)" }}>{entry.deaths}</td>
                        <td className="res-payout" style={{ paddingRight: 24 }}>
                          {entry.payoutMicro > 0 ? (
                            <span className="res-payout--positive">
                              +{(entry.payoutMicro / 1_000_000).toFixed(2)} USDC
                            </span>
                          ) : (
                            <span style={{ color: "var(--grey)" }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="res-metrics">
              {results.rakeAmount > 0 ? (
                <>
                  <span className="res-metric-item">PLATFORM RAKE (4%)</span>
                  <span className="res-metric-item" style={{ color: "var(--primary)" }}>
                    {(results.rakeAmount / 1_000_000).toFixed(2)} USDC
                  </span>
                </>
              ) : (
                <>
                  <span className="res-metric-item">
                    {roomGameMode === "staked" ? "🔒 STAKED" : "🎮 FREEPLAY"}
                  </span>
                  <span className="res-metric-item">
                    {roomGameMode === "staked" ? "Redeem winnings in Profile" : ""}
                  </span>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="res-loading">
            <div className="res-loading-dots">
              <span /><span /><span />
            </div>
            CALCULATING RESULTS
          </div>
        )}

        <div className="res-actions">
          <button className="btn res-btn lov-btn-ready" onClick={handlePlayAgain}>
            ⚔️ PLAY AGAIN
          </button>
          <button
            className="btn res-btn lov-btn-leave"
            onClick={() => { EventBus.emit("return-to-menu"); onLeave(); }}
          >
            🚪 MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
}
