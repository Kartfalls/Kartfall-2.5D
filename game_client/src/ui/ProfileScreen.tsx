import { useState, useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useYellowClient } from "../net/useYellowClient";
import { ethers } from "ethers";

interface ProfileScreenProps {
    onBack: () => void;
}

export function ProfileScreen({ onBack }: ProfileScreenProps) {
    const { user } = usePrivy();
    const { wallets } = useWallets();
    const {
        yellowClient,
        initClient,
        isInitializing,
        error: yellowError,
        defaultAsset,
        defaultChainId,
    } = useYellowClient();

    // Balances
    const [l1Balance, setL1Balance] = useState<string>("0.00");
    const [clearnodeBalance, setClearnodeBalance] = useState<string>("0.00");

    // UI States
    const [isLoadingBalances, setIsLoadingBalances] = useState(false);
    const [isWithdrawing, setIsWithdrawing] = useState(false);
    const [withdrawSuccess, setWithdrawSuccess] = useState(false);

    // Address helper
    const walletAddress = user?.wallet?.address || wallets?.[0]?.address || "Unknown";
    const shortAddress = walletAddress !== "Unknown"
        ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
        : walletAddress;

    // Initialize Yellow Network client on mount
    useEffect(() => {
        if (!yellowClient && !isInitializing && wallets?.length > 0) {
            initClient();
        }
    }, [yellowClient, isInitializing, wallets, initClient]);

    // Fetch balances once client is ready
    useEffect(() => {
        async function fetchBalances() {
            if (!yellowClient || !wallets?.[0]) return;
            setIsLoadingBalances(true);

            try {
                // 1. Fetch ClearNode balance via Yellow SDK
                const cnBalances = await yellowClient.getBalances(walletAddress as any) as any;

                // Yellow SDK may return an array directly, or an object mapped by address
                let usdcEntry;
                if (Array.isArray(cnBalances)) {
                    usdcEntry = cnBalances.find((b: any) => b.asset.toLowerCase() === defaultAsset.toLowerCase());
                } else if (cnBalances[walletAddress as any]) {
                    usdcEntry = cnBalances[walletAddress as any].find((b: any) => b.asset.toLowerCase() === defaultAsset.toLowerCase());
                }

                if (usdcEntry) {
                    setClearnodeBalance(usdcEntry.amount.toString());
                }

                // 2. Fetch L1 Wallet Balance (USDC Native) via ethers
                const provider = await wallets[0].getEthereumProvider();
                const web3Provider = new ethers.BrowserProvider(provider as any);

                // Minimal ERC20 ABI to fetch balanceOf
                const minABI = [
                    {
                        constant: true,
                        inputs: [{ name: "_owner", type: "address" }],
                        name: "balanceOf",
                        outputs: [{ name: "balance", type: "uint256" }],
                        type: "function",
                    },
                    {
                        constant: true,
                        inputs: [],
                        name: "decimals",
                        outputs: [{ name: "", type: "uint8" }],
                        type: "function",
                    }
                ];

                const contract = new ethers.Contract(defaultAsset, minABI, web3Provider);
                const l1Wei = await contract.balanceOf(walletAddress);
                const decimals = await contract.decimals();
                const formattedL1 = ethers.formatUnits(l1Wei, decimals);
                setL1Balance(Number(formattedL1).toFixed(2));

            } catch (err) {
                console.error("Failed to fetch balances:", err);
            } finally {
                setIsLoadingBalances(false);
            }
        }

        fetchBalances();
    }, [yellowClient, wallets, walletAddress, defaultAsset]);

    // Handle Withdrawal (Redeem)
    const handleRedeem = async () => {
        if (!yellowClient) return;
        if (Number(clearnodeBalance) <= 0) return;

        setIsWithdrawing(true);
        setWithdrawSuccess(false);

        try {
            // Execute the withdrawal entirely client-side using Yellow SDK
            // This will prompt the Privy wallet to sign the state transaction
            const newState = await yellowClient.withdraw(
                defaultChainId,
                defaultAsset,
                //@ts-ignore - decimal.js compat
                Number(clearnodeBalance)
            );

            console.log("Withdrawal initiated. New state:", newState);

            // Zero out the display balance speculatively, as L1 settlement takes time
            setClearnodeBalance("0.00");
            setWithdrawSuccess(true);

        } catch (err: any) {
            console.error("Redeem failed:", err);
            alert(`Withdrawal Failed: ${err.message || "Unknown error"}`);
        } finally {
            setIsWithdrawing(false);
        }
    };

    return (
        <div className="res-root" style={{ background: "rgba(8, 8, 9, 0.95)" }}>
            {/* Background patterns */}
            <div className="lobby-scanlines" style={{ zIndex: -1, opacity: 0.3 }} />
            <div className="lobby-vignette" style={{ zIndex: -1 }} />

            <div className="res-panel" style={{ minWidth: "480px" }}>
                {/* Corners */}
                <div className="lobby-corner lobby-corner--tl" />
                <div className="lobby-corner lobby-corner--tr" />
                <div className="lobby-corner lobby-corner--bl" />
                <div className="lobby-corner lobby-corner--br" />

                <h2 className="res-title" style={{ fontSize: "28px" }}>PILOT PROFILE</h2>
                <p className="res-subtitle" style={{ color: "var(--white)", opacity: 0.7 }}>
                    WALLET: <span style={{ fontFamily: "monospace", color: "var(--cyan)" }}>{shortAddress}</span>
                </p>

                {yellowError ? (
                    <div style={{ color: "var(--danger)", marginBottom: "24px", fontSize: "12px", textAlign: "center" }}>
                        Network Error: {yellowError}
                    </div>
                ) : isInitializing ? (
                    <div style={{ color: "var(--primary)", marginBottom: "32px", fontSize: "12px", letterSpacing: "2px" }}>
                        CONNECTING TO CLEARNODE...
                    </div>
                ) : (
                    <div style={{ width: "100%", opacity: isLoadingBalances ? 0.5 : 1, transition: "opacity 0.2s" }}>

                        {/* L1 Balance Block */}
                        <div style={{
                            background: "rgba(0,0,0,0.4)",
                            border: "1px solid rgba(255,255,255,0.05)",
                            padding: "20px",
                            borderRadius: "4px",
                            marginBottom: "16px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                        }}>
                            <div>
                                <div style={{ fontSize: "10px", color: "var(--grey)", letterSpacing: "1px", marginBottom: "4px" }}>
                                    L1 WALLET BALANCE (ARBITRUM)
                                </div>
                                <div style={{ fontSize: "24px", color: "var(--white)", fontWeight: "bold" }}>
                                    {l1Balance} <span style={{ fontSize: "14px", color: "var(--cyan)" }}>USDC</span>
                                </div>
                            </div>
                            <div style={{ opacity: 0.5, fontSize: "24px" }}>🪙</div>
                        </div>

                        {/* ClearNode Balance Block */}
                        <div style={{
                            background: "linear-gradient(45deg, rgba(229, 255, 0, 0.05), rgba(0,0,0,0.4))",
                            border: "1px solid var(--glass-border)",
                            padding: "20px",
                            borderRadius: "4px",
                            marginBottom: "32px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                        }}>
                            <div>
                                <div style={{ fontSize: "10px", color: "var(--primary)", letterSpacing: "1px", marginBottom: "4px" }}>
                                    UNSETTLED GAME EARNINGS
                                </div>
                                <div style={{ fontSize: "28px", color: "var(--primary)", fontWeight: "bold", textShadow: "0 0 10px rgba(229,255,0,0.3)" }}>
                                    {clearnodeBalance} <span style={{ fontSize: "14px", color: "var(--white)" }}>USDC</span>
                                </div>
                                {withdrawSuccess && (
                                    <div style={{ fontSize: "10px", color: "var(--success)", marginTop: "6px" }}>
                                        ✓ Withdrawal transaction submitted
                                    </div>
                                )}
                            </div>

                            {/* Redeem Button */}
                            <button
                                className="btn lov-btn-ready"
                                onClick={handleRedeem}
                                disabled={isWithdrawing || Number(clearnodeBalance) <= 0}
                                style={{
                                    opacity: (isWithdrawing || Number(clearnodeBalance) <= 0) ? 0.5 : 1,
                                    cursor: (isWithdrawing || Number(clearnodeBalance) <= 0) ? "not-allowed" : "pointer"
                                }}
                            >
                                {isWithdrawing ? "SIGNING..." : "REDEEM"}
                            </button>
                        </div>

                    </div>
                )}

                {/* Action Button */}
                <div className="res-actions" style={{ marginTop: "auto" }}>
                    <button className="btn res-btn lov-btn-leave" onClick={onBack}>
                        ← GO BACK
                    </button>
                </div>
            </div>
        </div>
    );
}
