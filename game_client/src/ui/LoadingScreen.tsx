import { useEffect, useState } from "react";

export function LoadingScreen() {
    const [dots, setDots] = useState("");

    useEffect(() => {
        const interval = setInterval(() => {
            setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
        }, 500);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="lobby-root">
            {/* ── Background Layers ── */}
            <div className="lobby-bg-far" />
            <div className="lobby-bg-mid" />
            <div className="lobby-grid" />
            <div className="lobby-scanlines" />
            <div className="lobby-vignette" />

            {/* ── Title / Center Focus ── */}
            <div className="loading-center">
                <img
                    className="lobby-logo"
                    src="/sprites/ui/title_logo.png"
                    alt="KARTFALL"
                    draggable={false}
                    style={{ width: "400px", maxWidth: "80vw", animation: "pulse-glow 3s ease-in-out infinite" }}
                />

                <div className="loading-links">
                    <button className="loading-link-btn apple-btn">
                        <span className="icon">🍏</span>
                        <div className="text-col">
                            <span className="small">Download on the</span>
                            <span className="large">App Store</span>
                        </div>
                    </button>
                    <button className="loading-link-btn google-btn">
                        <span className="icon">▶️</span>
                        <div className="text-col">
                            <span className="small">GET IT ON</span>
                            <span className="large">Google Play</span>
                        </div>
                    </button>
                    <button className="loading-link-btn discord-btn">
                        <span className="icon">💬</span>
                        <div className="text-col">
                            <span className="large">Discord</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* ── Bottom Left Loading Text ── */}
            <div className="loading-indicator">
                <div className="loading-spinner"></div>
                <h2>Loading{dots}</h2>
            </div>

            {/* ── Bottom Right Studio Logo ── */}
            <div className="loading-studio">
                <span className="studio-text">Tall Team</span>
            </div>
        </div>
    );
}
