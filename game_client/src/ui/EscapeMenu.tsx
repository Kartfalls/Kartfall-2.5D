import { useEffect, useState } from "react";
import type { Room } from "@colyseus/sdk";

const KART_COLORS = ["yellow", "red", "purple", "black"] as const;

interface EscapeMenuProps {
    room: Room;
    onLeave: () => void;
    onResume: () => void;
}

export function EscapeMenu({ room, onLeave, onResume }: EscapeMenuProps) {
    const [entries, setEntries] = useState<any[]>([]);

    useEffect(() => {
        const refresh = () => {
            const state = room.state as any;
            const list: any[] = [];

            state.players?.forEach((p: any, id: string) => {
                if (p.isSpectator) return;
                list.push({
                    id,
                    name: p.name || id.slice(0, 6),
                    kills: p.kills ?? 0,
                    deaths: p.deaths ?? 0,
                    score: p.score ?? 0,
                    colorIndex: p.colorIndex ?? 0,
                });
            });

            list.sort((a, b) => b.score - a.score || b.kills - a.kills);
            setEntries(list);
        };

        room.onStateChange(refresh);
        refresh();

        // Listen to "Escape" again here to close, but we have onResume prop,
        // so let the parent handle the toggle or handle it here.
        return () => {
            room.onStateChange.remove(refresh);
        };
    }, [room]);

    return (
        <div className="overlay" style={{ zIndex: 100, background: "rgba(0,0,0,0.6)" }}>
            <div className="card" style={{ padding: 24, minWidth: 400, transform: "scale(1.2)" }}>
                <h2 style={{ textAlign: "center", marginBottom: 8, color: "var(--primary)" }}>GAME MENU</h2>
                <div style={{ textAlign: "center", fontSize: 12, color: "var(--danger)", marginBottom: 24 }}>
                    MATCH IS STILL IN PROGRESS!
                </div>

                <div style={{ marginBottom: 24, maxHeight: 200, overflowY: "auto" }}>
                    <div style={{ fontSize: 10, color: "var(--grey)", marginBottom: 8 }}>CURRENT SCORES</div>
                    {entries.map((e, i) => (
                        <div
                            key={e.id}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                padding: "8px 12px",
                                background: e.id === room.sessionId ? "rgba(77,91,206,0.18)" : "rgba(255,255,255,0.03)",
                                borderRadius: 8,
                                marginBottom: 4,
                                gap: 12,
                            }}
                        >
                            <div style={{ width: 16, color: "var(--grey)", fontSize: 12, fontWeight: "bold" }}>{i + 1}</div>
                            <div
                                className="lov-player-color"
                                data-color={KART_COLORS[e.colorIndex] ?? "yellow"}
                            />
                            <div style={{ flex: 1, fontSize: 14, fontWeight: "bold" }}>
                                {e.name} {e.id === room.sessionId && <span style={{ fontSize: 10, color: "var(--primary)" }}>(YOU)</span>}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--grey)" }}>
                                {e.kills}K - {e.deaths}D
                            </div>
                            <div style={{ fontSize: 16, fontWeight: "bold", color: "var(--white)" }}>
                                {e.score}
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                    <button
                        className="sk-sub-btn"
                        style={{ flex: 1 }}
                        onClick={onResume}
                    >
                        RESUME
                    </button>
                    <button
                        className="lov-btn lov-btn-leave"
                        style={{ flex: 1 }}
                        onClick={onLeave}
                    >
                        LEAVE MATCH
                    </button>
                </div>
            </div>
        </div>
    );
}
