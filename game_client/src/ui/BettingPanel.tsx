import { useEffect, useState } from "react";
import type { Room } from "@colyseus/sdk";
import { EventBus } from "../game/EventBus";

interface BettingPanelProps {
  room: Room;
}

interface PlayerOdds {
  id: string;
  name: string;
  kills: number;
  deaths: number;
  score: number;
  isAlive: boolean;
  prob: number; // 0-1
}

interface MyBet {
  marketType: string;
  targetPlayerId: string;
  targetName: string;
  amount: number;
  placedAt: number;
}

const QUICK_AMOUNTS = [0.5, 1, 2, 5];

function calcOdds(players: Omit<PlayerOdds, "prob">[]): PlayerOdds[] {
  const totalScore = players.reduce((s, p) => s + Math.max(p.score, 0), 0);
  if (totalScore === 0) {
    const eq = 1 / Math.max(players.length, 1);
    return players.map((p) => ({ ...p, prob: eq }));
  }
  return players.map((p) => ({
    ...p,
    prob: Math.max(p.score, 0) / totalScore,
  }));
}

function probToMultiplier(prob: number): string {
  if (prob <= 0) return "—";
  const m = 1 / prob;
  return `${(m * 0.96).toFixed(2)}x`; // 4% rake
}

type MarketTab = "next_kill" | "match_winner";

export function BettingPanel({ room }: BettingPanelProps) {
  const [tab, setTab] = useState<MarketTab>("next_kill");
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");
  const [betAmount, setBetAmount] = useState<string>("");
  const [myBets, setMyBets] = useState<MyBet[]>([]);
  const [recentKill, setRecentKill] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerOdds[]>([]);
  const [betMsg, setBetMsg] = useState<string | null>(null);

  // Spectator check
  const state = room.state as any;
  const localPlayer = state.players?.get(room.sessionId);
  if (localPlayer && !localPlayer.isSpectator) return null;

  // Refresh player list + odds every state change
  useEffect(() => {
    const refresh = () => {
      const raw: Omit<PlayerOdds, "prob">[] = [];
      state.players?.forEach((p: any, id: string) => {
        if (!p.isSpectator) {
          raw.push({
            id,
            name: p.name || id.slice(0, 6),
            kills: p.kills ?? 0,
            deaths: p.deaths ?? 0,
            score: p.score ?? p.kills ?? 0,
            isAlive: p.isAlive ?? true,
          });
        }
      });
      setPlayers(calcOdds(raw));
    };
    refresh();
    room.onStateChange(refresh);
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recent kill feed
  useEffect(() => {
    const onKill = (data: { killerId: string }) => {
      const killerName =
        (room.state as any).players?.get(data.killerId)?.name ||
        data.killerId.slice(0, 6);
      setRecentKill(`⚔️ ${killerName} got a kill!`);
      const t = setTimeout(() => setRecentKill(null), 3000);
      return () => clearTimeout(t);
    };
    EventBus.on("kill-feed", onKill);
    return () => { EventBus.off("kill-feed", onKill); };
  }, [room]);

  const handlePlaceBet = () => {
    const amount = parseFloat(betAmount);
    if (!selectedPlayer || !amount || amount <= 0) return;
    const amountMicro = Math.floor(amount * 1_000_000);

    room.send("place_bet", {
      marketType: tab,
      targetPlayerId: selectedPlayer,
      amount: amountMicro,
    });

    const targetName =
      players.find((p) => p.id === selectedPlayer)?.name ?? "???";
    setMyBets((prev) => [
      ...prev,
      {
        marketType: tab,
        targetPlayerId: selectedPlayer,
        targetName,
        amount,
        placedAt: Date.now(),
      },
    ]);

    setBetMsg(`✅ Bet ${amount} USDC on ${targetName}`);
    setTimeout(() => setBetMsg(null), 3000);
    setSelectedPlayer("");
    setBetAmount("");
  };

  const selectedPlayerData = players.find((p) => p.id === selectedPlayer);
  const potentialPayout =
    selectedPlayerData && parseFloat(betAmount) > 0
      ? (parseFloat(betAmount) / selectedPlayerData.prob) * 0.96
      : null;

  const totalWagered = myBets.reduce((s, b) => s + b.amount, 0);

  return (
    <div className="bet-panel">
      {/* Header */}
      <div className="bet-header">
        <div className="bet-title">
          <span className="bet-title-icon">📊</span>
          PREDICTION MARKET
        </div>
        {recentKill && (
          <div className="bet-kill-flash">{recentKill}</div>
        )}
      </div>

      {/* Market tabs */}
      <div className="bet-tabs">
        <button
          className={`bet-tab${tab === "next_kill" ? " active" : ""}`}
          onClick={() => setTab("next_kill")}
        >
          ⚔️ Next Kill
        </button>
        <button
          className={`bet-tab${tab === "match_winner" ? " active" : ""}`}
          onClick={() => setTab("match_winner")}
        >
          🏆 Winner
        </button>
      </div>

      {/* Market type label */}
      <div className="bet-market-label">
        {tab === "next_kill"
          ? "Who gets the next kill?"
          : "Who wins the match?"}
      </div>

      {/* Player odds cards */}
      <div className="bet-odds-list">
        {players.map((p) => (
          <div
            key={p.id}
            className={`bet-odds-card${selectedPlayer === p.id ? " selected" : ""}${!p.isAlive ? " dead" : ""}`}
            onClick={() => p.isAlive && setSelectedPlayer(p.id === selectedPlayer ? "" : p.id)}
          >
            <div className="bet-odds-player">
              <span className={`bet-alive-dot${p.isAlive ? " alive" : ""}`} />
              <span className="bet-odds-name">{p.name}</span>
              {!p.isAlive && <span className="bet-dead-tag">DEAD</span>}
            </div>

            <div className="bet-odds-stats">
              <span className="bet-stat">⚔️ {p.kills}</span>
              <span className="bet-stat">💀 {p.deaths}</span>
            </div>

            {/* Probability bar */}
            <div className="bet-prob-row">
              <div className="bet-prob-bar">
                <div
                  className="bet-prob-fill"
                  style={{ width: `${(p.prob * 100).toFixed(1)}%` }}
                />
              </div>
              <span className="bet-prob-pct">{(p.prob * 100).toFixed(0)}%</span>
            </div>

            <div className="bet-multiplier">{probToMultiplier(p.prob)}</div>
          </div>
        ))}
      </div>

      {/* Bet input */}
      {selectedPlayer && (
        <div className="bet-input-section">
          <div className="bet-input-label">
            Betting on{" "}
            <strong>{selectedPlayerData?.name}</strong>
          </div>

          {/* Quick amounts */}
          <div className="bet-quick-amounts">
            {QUICK_AMOUNTS.map((a) => (
              <button
                key={a}
                className={`bet-quick-btn${parseFloat(betAmount) === a ? " active" : ""}`}
                onClick={() => setBetAmount(String(a))}
              >
                {a}
              </button>
            ))}
          </div>

          <div className="bet-input-row">
            <input
              className="bet-input"
              type="number"
              placeholder="Amount (USDC)"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              min="0.01"
              step="0.01"
            />
            <span className="bet-input-currency">USDC</span>
          </div>

          {potentialPayout !== null && (
            <div className="bet-potential">
              Potential win:{" "}
              <strong style={{ color: "#00c87a" }}>
                +{potentialPayout.toFixed(2)} USDC
              </strong>
            </div>
          )}

          <button
            className="bet-place-btn"
            onClick={handlePlaceBet}
            disabled={!betAmount || parseFloat(betAmount) <= 0}
          >
            Place Bet
          </button>
        </div>
      )}

      {betMsg && <div className="bet-confirm-msg">{betMsg}</div>}

      {/* My positions */}
      {myBets.length > 0 && (
        <div className="bet-positions">
          <div className="bet-positions-title">
            MY BETS{" "}
            <span className="bet-positions-total">
              {totalWagered.toFixed(2)} USDC wagered
            </span>
          </div>
          {myBets.slice(-3).map((b, i) => (
            <div key={i} className="bet-position-row">
              <span className="bet-position-market">
                {b.marketType === "next_kill" ? "⚔️" : "🏆"}
              </span>
              <span className="bet-position-name">{b.targetName}</span>
              <span className="bet-position-amount">
                {b.amount.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
