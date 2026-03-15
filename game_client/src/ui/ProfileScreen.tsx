import { useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useMatchHistory } from "../net/useMatchHistory";
import { getHttpEndpoint } from "../net/http";

interface ProfileScreenProps {
  onBack: () => void;
  accessToken?: string | null;
  walletOptions?: { address: string; label: string }[];
  selectedWalletAddress?: string | null;
  onSelectWallet?: (address: string) => void;
}

function toBigInt(value: unknown): bigint {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "string") return BigInt(value || "0");
    if (typeof value === "number") return BigInt(Math.floor(value));
    return 0n;
  } catch {
    return 0n;
  }
}

function formatToken(amount: bigint, decimals: number) {
  if (!decimals) return amount.toString();
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  if (fraction === 0n) return whole.toString();
  const fractionStr = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fractionStr}`;
}

function parseTokenToWei(value: string, decimals: number): bigint {
  if (!value) return 0n;
  const [whole, fraction = ""] = value.split(".");
  const cleanWhole = whole ? whole.replace(/\D/g, "") : "0";
  const paddedFraction = fraction.replace(/\D/g, "").padEnd(decimals, "0").slice(0, decimals);
  try {
    return BigInt(cleanWhole || "0") * BigInt(10) ** BigInt(decimals) + BigInt(paddedFraction || "0");
  } catch {
    return 0n;
  }
}

function shortenAddress(addr: string) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

type ProfileTab = "overview" | "history";

export function ProfileScreen({
  onBack,
  accessToken,
  walletOptions,
  selectedWalletAddress,
  onSelectWallet,
}: ProfileScreenProps) {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");

  const activeWallet =
    wallets?.find(
      (w) => w.address?.toLowerCase() === selectedWalletAddress?.toLowerCase(),
    ) ||
    wallets?.[0] ||
    null;

  const walletAddress =
    selectedWalletAddress ||
    user?.wallet?.address ||
    wallets?.[0]?.address ||
    "Unknown";

  const { data: historyData, loading: historyLoading, error: historyError, refresh: refreshHistory } =
    useMatchHistory(accessToken ?? null, selectedWalletAddress);

  const assetSymbol = historyData?.asset ?? "TOKEN";
  const assetDecimals = historyData?.assetDecimals ?? 6;
  const walletBalance = historyData?.walletBalance ?? "0";

  const totalUnredeemed = useMemo(() => {
    return (historyData?.history ?? []).reduce(
      (sum, row) => sum + toBigInt(row.unredeemed),
      0n,
    );
  }, [historyData?.history]);

  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemingMatchId, setRedeemingMatchId] = useState<string | null>(null);
  const [redeemAllLoading, setRedeemAllLoading] = useState(false);

  const redeemMatch = async (matchId: string) => {
    if (!accessToken) { setRedeemError("Sign in to redeem."); return; }
    if (!activeWallet) { setRedeemError("Connect a wallet first."); return; }
    setRedeemingMatchId(matchId);
    setRedeemError(null);
    try {
      const resp = await fetch(`${getHttpEndpoint()}/api/match/withdraw`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, walletAddress: selectedWalletAddress ?? undefined }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error ?? `Withdraw failed (${resp.status})`);
      await refreshHistory();
    } catch (err: any) {
      setRedeemError(err?.message ?? "Redeem failed");
    } finally {
      setRedeemingMatchId(null);
    }
  };

  const redeemAll = async () => {
    const redeemable = (historyData?.history ?? []).filter((r) => toBigInt(r.unredeemed) > 0n);
    if (!redeemable.length) return;
    setRedeemAllLoading(true);
    setRedeemError(null);
    try {
      for (const row of redeemable) await redeemMatch(row.matchId);
    } finally {
      setRedeemAllLoading(false);
    }
  };

  const walletBal = parseTokenToWei(walletBalance, assetDecimals);
  const totalBalance = walletBal + totalUnredeemed;

  const wins = useMemo(
    () => (historyData?.history ?? []).filter((r) => toBigInt((r.payouts as any)?.stake) > 0n).length,
    [historyData?.history],
  );
  const totalGames = historyData?.history?.length ?? 0;

  return (
    <div className="pro-root">
      <div className="lobby-scanlines" style={{ zIndex: -1, opacity: 0.2 }} />

      <div className="pro-panel">
        {/* ── Header ── */}
        <div className="pro-header">
          <div>
            <div className="pro-title">PILOT PROFILE</div>
            <div className="pro-wallet-addr">
              <span className="pro-wallet-label">WALLET</span>
              <span className="pro-wallet-value">{shortenAddress(walletAddress)}</span>
            </div>
          </div>
          <button className="sk-sub-btn" onClick={onBack}>← Back</button>
        </div>

        {/* ── Wallet selector ── */}
        {walletOptions && walletOptions.length > 1 && (
          <select
            className="pro-wallet-select"
            value={selectedWalletAddress ?? walletAddress}
            onChange={(e) => onSelectWallet?.(e.target.value)}
          >
            {walletOptions.map((o) => (
              <option key={o.address} value={o.address}>{o.label}</option>
            ))}
          </select>
        )}

        {/* ── Balance card ── */}
        <div className="pro-balance-card">
          <div className="pro-balance-left">
            <div className="pro-balance-label">TOTAL BALANCE</div>
            <div className="pro-balance-amount">
              {formatToken(totalBalance, assetDecimals)}
              <span className="pro-balance-symbol">{assetSymbol.toUpperCase()}</span>
            </div>
            <div className="pro-balance-breakdown">
              <span className="pro-bal-item">
                <span className="pro-bal-dot pro-bal-dot--wallet" />
                {walletBalance} wallet
              </span>
              <span className="pro-bal-item">
                <span className="pro-bal-dot pro-bal-dot--unredeemed" />
                {formatToken(totalUnredeemed, assetDecimals)} unredeemed
              </span>
            </div>
          </div>
          <div className="pro-balance-right">
            {totalUnredeemed > 0n && (
              <div className="pro-redeem-badge">
                🔔 {formatToken(totalUnredeemed, assetDecimals)} {assetSymbol} ready to claim
              </div>
            )}
            <button
              className="pro-redeem-btn"
              onClick={() => void redeemAll()}
              disabled={redeemAllLoading || totalUnredeemed <= 0n}
            >
              {redeemAllLoading ? (
                <span className="pro-spinner" />
              ) : (
                "⬇ REDEEM ALL"
              )}
            </button>
          </div>
        </div>

        {redeemError && <div className="pro-error">{redeemError}</div>}

        {/* ── Quick stats row ── */}
        <div className="pro-stats-row">
          <div className="pro-stat-card">
            <div className="pro-stat-value">{totalGames}</div>
            <div className="pro-stat-label">MATCHES</div>
          </div>
          <div className="pro-stat-card">
            <div className="pro-stat-value" style={{ color: "#00c87a" }}>{wins}</div>
            <div className="pro-stat-label">WINS</div>
          </div>
          <div className="pro-stat-card">
            <div className="pro-stat-value" style={{ color: "#e5ff00" }}>
              {totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0}%
            </div>
            <div className="pro-stat-label">WIN RATE</div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="pro-tabs">
          <button
            className={`pro-tab${activeTab === "overview" ? " active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </button>
          <button
            className={`pro-tab${activeTab === "history" ? " active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            Match History
            {totalGames > 0 && <span className="pro-tab-badge">{totalGames}</span>}
          </button>
        </div>

        {/* ── Tab content ── */}
        {activeTab === "overview" && (
          <div className="pro-overview">
            <div className="pro-overview-hint">
              Stake tokens on staked matches to earn winnings. Redeem from Match History.
            </div>
            {totalUnredeemed > 0n ? (
              <div className="pro-claim-card">
                <div className="pro-claim-icon">💰</div>
                <div>
                  <div className="pro-claim-title">Winnings Available</div>
                  <div className="pro-claim-amount">
                    {formatToken(totalUnredeemed, assetDecimals)} {assetSymbol}
                  </div>
                </div>
                <button
                  className="pro-redeem-btn"
                  style={{ marginLeft: "auto" }}
                  onClick={() => void redeemAll()}
                  disabled={redeemAllLoading}
                >
                  {redeemAllLoading ? "..." : "CLAIM"}
                </button>
              </div>
            ) : (
              <div className="pro-empty-state">
                <div style={{ fontSize: 32 }}>🏎️</div>
                <div>No unclaimed winnings. Play a staked match to earn!</div>
              </div>
            )}
          </div>
        )}

        {activeTab === "history" && (
          <div className="pro-history">
            {historyLoading && (
              <div className="pro-loading">
                <span className="pro-spinner" /> Loading history…
              </div>
            )}
            {historyError && <div className="pro-error">{historyError}</div>}
            {!historyLoading && !historyData?.history?.length && (
              <div className="pro-empty-state">
                <div style={{ fontSize: 32 }}>📋</div>
                <div>No matches recorded yet.</div>
              </div>
            )}

            {historyData?.history?.map((row, idx) => {
              const stake = toBigInt((row.payouts as any)?.stake);
              const bets = toBigInt((row.payouts as any)?.bets);
              const total = toBigInt((row.payouts as any)?.total);
              const stakeAmount = toBigInt(row.stakeAmount);
              const unredeemed = toBigInt(row.unredeemed);
              const platformRake = toBigInt((row.payouts as any)?.platformRake);
              const date = new Date(row.date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              const isWin = total > 0n;
              const isStaked = row.mode === "staked";
              const pnl = total - stakeAmount;

              return (
                <div
                  key={row.matchId}
                  className={`pro-match-card${isWin ? " pro-match-card--win" : ""}`}
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  {/* Match header */}
                  <div className="pro-match-header">
                    <div className="pro-match-left">
                      <span className={`pro-match-mode-badge${isStaked ? " staked" : ""}`}>
                        {isStaked ? "🔒 STAKED" : "🎮 FREE"}
                      </span>
                      <span className="pro-match-id">#{row.matchId.slice(-6).toUpperCase()}</span>
                      <span className="pro-match-date">{date}</span>
                    </div>
                    <div className="pro-match-right">
                      {unredeemed > 0n ? (
                        <button
                          className="pro-match-redeem-btn"
                          onClick={() => void redeemMatch(row.matchId)}
                          disabled={redeemingMatchId === row.matchId}
                        >
                          {redeemingMatchId === row.matchId ? "…" : `⬇ REDEEM ${formatToken(unredeemed, assetDecimals)}`}
                        </button>
                      ) : (
                        <span className="pro-match-redeemed">✓ CLAIMED</span>
                      )}
                    </div>
                  </div>

                  {/* Payout breakdown (Polymarket-style) */}
                  <div className="pro-match-markets">
                    {isStaked && (
                      <div className="pro-market-row">
                        <span className="pro-market-label">Match stake</span>
                        <span className="pro-market-value">
                          {formatToken(stakeAmount, assetDecimals)} {assetSymbol}
                        </span>
                      </div>
                    )}
                    {stake > 0n && (
                      <div className="pro-market-row pro-market-row--positive">
                        <span className="pro-market-label">🏆 Stake winnings</span>
                        <span className="pro-market-value pro-market-value--green">
                          +{formatToken(stake, assetDecimals)}
                        </span>
                      </div>
                    )}
                    {bets > 0n && (
                      <div className="pro-market-row pro-market-row--positive">
                        <span className="pro-market-label">📊 Bet winnings</span>
                        <span className="pro-market-value pro-market-value--green">
                          +{formatToken(bets, assetDecimals)}
                        </span>
                      </div>
                    )}
                    {platformRake > 0n && (
                      <div className="pro-market-row">
                        <span className="pro-market-label">Platform rake (4%)</span>
                        <span className="pro-market-value pro-market-value--grey">
                          -{formatToken(platformRake, assetDecimals)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* P&L summary */}
                  {isStaked && (
                    <div className={`pro-match-pnl${pnl > 0n ? " positive" : pnl < 0n ? " negative" : ""}`}>
                      <span>NET P&L</span>
                      <span>
                        {pnl > 0n ? "+" : ""}
                        {formatToken(pnl >= 0n ? pnl : -pnl, assetDecimals)} {assetSymbol}
                        {pnl < 0n ? " lost" : pnl === 0n ? "" : " profit"}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
