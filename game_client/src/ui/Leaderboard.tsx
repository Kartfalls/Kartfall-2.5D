import { useEffect, useState } from "react";
import type { Room } from "@colyseus/sdk";

interface LeaderboardEntry {
  id: string;
  name: string;
  kills: number;
  deaths: number;
  score: number;
}

interface LeaderboardProps {
  room: Room;
}

/**
 * Collapsible leaderboard panel showing kills, deaths, score for all players.
 * Updated from room state on each schema change.
 */
export function Leaderboard({ room }: LeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    const refresh = () => {
      const state = room.state as any;
      const list: LeaderboardEntry[] = [];

      state.players?.forEach((p: any, id: string) => {
        if (p.isSpectator) return;
        list.push({
          id,
          name: p.name || id.slice(0, 6),
          kills: p.kills ?? 0,
          deaths: p.deaths ?? 0,
          score: p.score ?? 0,
        });
      });

      list.sort((a, b) => b.score - a.score || b.kills - a.kills);
      setEntries(list);
    };

    // Listen to state changes
    room.onStateChange(refresh);
    refresh();

    return () => {
      room.onStateChange.remove(refresh);
    };
  }, [room]);

  if (entries.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 72,
        left: 16,
        zIndex: 30,
        pointerEvents: "auto",
      }}
    >
      <div
        className="card"
        style={{
          padding: collapsed ? "6px 10px" : 10,
          width: collapsed ? 72 : 240,
          maxHeight: collapsed ? undefined : "calc(100vh - 140px)",
          overflow: "hidden",
        }}
      >
        <div
          onClick={() => setCollapsed(!collapsed)}
          style={{
            cursor: "pointer",
            fontSize: 10,
            color: "var(--primary)",
            letterSpacing: 1,
            textTransform: "uppercase",
            userSelect: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{collapsed ? "▲ LB" : "▼ LEADERBOARD"}</span>
          {!collapsed && (
            <span style={{ color: "var(--grey)", letterSpacing: 0 }}>
              {entries.length}
            </span>
          )}
        </div>

        {!collapsed && (
          <div style={{ marginTop: 8, overflowY: "auto", maxHeight: "calc(100vh - 200px)" }}>
            {entries.map((e, i) => (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 10,
                  background:
                    i === 0
                      ? "rgba(77,91,206,0.18)"
                      : i < 3
                        ? "rgba(0,255,204,0.08)"
                        : "rgba(255,255,255,0.03)",
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    width: 18,
                    textAlign: "center",
                    fontSize: 11,
                    fontWeight: 800,
                    color: i === 0 ? "var(--primary)" : "var(--grey)",
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: i === 0 ? "var(--primary)" : "var(--white)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={e.name}
                  >
                    {e.name}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--grey)", marginTop: 2 }}>
                    {e.kills}K • {e.deaths}D
                  </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--white)" }}>
                  {e.score}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
