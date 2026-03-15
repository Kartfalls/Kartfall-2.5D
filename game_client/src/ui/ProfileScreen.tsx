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
  const fractionStr = fraction
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return `${whole.toString()}.${fractionStr}`;
}

function parseTokenToWei(value: string, decimals: number): bigint {
  if (!value) return 0n;
  const [whole, fraction = ""] = value.split(".");
  const cleanWhole = whole ? whole.replace(/\D/g, "") : "0";
  const cleanFraction = fraction.replace(/\D/g, "");
  const paddedFraction = cleanFraction
    .padEnd(decimals, "0")
    .slice(0, decimals);
  try {
    return (
      BigInt(cleanWhole || "0") * BigInt(10) ** BigInt(decimals) +
      BigInt(paddedFraction || "0")
    );
  } catch {
    return 0n;
  }
}

function shortenAddress(addr: string) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function ProfileScreen({
  onBack,
  accessToken,
  walletOptions,
  selectedWalletAddress,
  onSelectWallet,
}: ProfileScreenProps) {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const activeWallet =
    wallets?.find(
      (wallet) =>
        wallet.address?.toLowerCase() === selectedWalletAddress?.toLowerCase(),
    ) ||
    wallets?.[0] ||
    null;

  const walletAddress =
    selectedWalletAddress ||
    user?.wallet?.address ||
    wallets?.[0]?.address ||
    "Unknown";

  const {
    data: historyData,
    loading: historyLoading,
    error: historyError,
    refresh: refreshHistory,
  } = useMatchHistory(accessToken ?? null, selectedWalletAddress);

  const assetSymbol = historyData?.asset ?? "TOKEN";
  const assetDecimals = historyData?.assetDecimals ?? 6;
  const walletBalance = historyData?.walletBalance ?? "0";

  const totalUnredeemed = useMemo(() => {
    const rows = historyData?.history ?? [];
    return rows.reduce(
      (sum, row) => sum + toBigInt(row.unredeemed),
      0n,
    );
  }, [historyData?.history]);

  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemingMatchId, setRedeemingMatchId] = useState<string | null>(null);
  const [redeemAllLoading, setRedeemAllLoading] = useState(false);

  const redeemMatch = async (matchId: string) => {
    if (!accessToken) {
      setRedeemError("Sign in to redeem.");
      return;
    }
    if (!activeWallet) {
      setRedeemError("Connect a wallet first.");
      return;
    }

    setRedeemingMatchId(matchId);
    setRedeemError(null);

    try {
      const base = getHttpEndpoint();
      const resp = await fetch(`${base}/api/match/withdraw`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          matchId,
          walletAddress: selectedWalletAddress ?? undefined,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.error ?? `Withdraw failed (${resp.status})`);
      }

      // Server handles the full payout (custody withdraw + ERC20 transfer).
      // No client-side wallet interaction needed.
      await refreshHistory();
    } catch (err: any) {
      setRedeemError(err?.message ?? "Redeem failed");
    } finally {
      setRedeemingMatchId(null);
    }
  };

  const redeemAll = async () => {
    const rows = historyData?.history ?? [];
    const redeemable = rows.filter(
      (row) => toBigInt(row.unredeemed) > 0n,
    );
    if (!redeemable.length) return;
    setRedeemAllLoading(true);
    setRedeemError(null);
    try {
      for (const row of redeemable) {
        await redeemMatch(row.matchId);
      }
    } finally {
      setRedeemAllLoading(false);
    }
  };

  const totalBalanceDisplay = useMemo(() => {
    const wallet = parseTokenToWei(walletBalance, assetDecimals);
    const total = wallet + totalUnredeemed;
    return formatToken(total, assetDecimals);
  }, [walletBalance, totalUnredeemed, assetDecimals]);

  return (
    <div className="res-root" style={{ background: "rgba(8, 8, 9, 0.95)" }}>
      <div className="lobby-scanlines" style={{ zIndex: -1, opacity: 0.3 }} />
      <div className="lobby-vignette" style={{ zIndex: -1 }} />

      <div
        className="res-panel profile-screen-panel"
        style={{ minWidth: "520px", maxWidth: "980px" }}
      >
        <div className="lobby-corner lobby-corner--tl" />
        <div className="lobby-corner lobby-corner--tr" />
        <div className="lobby-corner lobby-corner--bl" />
        <div className="lobby-corner lobby-corner--br" />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div>
            <h2 className="res-title" style={{ fontSize: "28px" }}>
              PILOT PROFILE
            </h2>
            <p
              className="res-subtitle"
              style={{ color: "var(--white)", opacity: 0.7 }}
            >
              WALLET:{" "}
              <span style={{ fontFamily: "monospace", color: "var(--cyan)" }}>
                {shortenAddress(walletAddress)}
              </span>
            </p>
          </div>
          <button className="sk-sub-btn" onClick={onBack}>
            Back
          </button>
        </div>

        {walletOptions && walletOptions.length > 1 && (
          <div style={{ marginBottom: 18, width: "100%" }}>
            <div
              style={{
                fontSize: "10px",
                color: "var(--grey)",
                letterSpacing: "1px",
                marginBottom: 6,
              }}
            >
              ACTIVE WALLET
            </div>
            <select
              value={selectedWalletAddress ?? walletAddress}
              onChange={(e) => onSelectWallet?.(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(0,0,0,0.4)",
                color: "var(--white)",
                fontFamily: "inherit",
                fontSize: 12,
              }}
            >
              {walletOptions.map((option) => (
                <option key={option.address} value={option.address}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div
          style={{
            width: "100%",
            padding: "14px 18px",
            borderRadius: 10,
            background: "rgba(0,0,0,0.55)",
            border: "1px solid rgba(255,255,255,0.12)",
            marginBottom: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "var(--grey)" }}>BALANCE</div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: 0.5,
              }}
            >
              {totalBalanceDisplay} {assetSymbol.toUpperCase()}
            </div>
            <div style={{ fontSize: 11, color: "var(--grey)" }}>
              {walletBalance} wallet +{" "}
              {formatToken(totalUnredeemed, assetDecimals)} unredeemed
            </div>
          </div>
          <button
            className="sk-sub-btn"
            onClick={() => void redeemAll()}
            disabled={redeemAllLoading || totalUnredeemed <= 0n}
          >
            {redeemAllLoading ? "REDEEMING..." : "REDEEM"}
          </button>
        </div>

        {redeemError && (
          <div style={{ color: "var(--danger)", marginBottom: 12 }}>
            {redeemError}
          </div>
        )}

        <div style={{ width: "100%" }}>
          <div
            style={{
              fontSize: 12,
              color: "var(--grey)",
              letterSpacing: "1px",
              marginBottom: 8,
            }}
          >
            MATCH HISTORY
          </div>
          {historyLoading && (
            <div style={{ color: "var(--primary)" }}>Loading history...</div>
          )}
          {historyError && (
            <div style={{ color: "var(--danger)" }}>{historyError}</div>
          )}
          {!historyLoading && !historyData?.history?.length && (
            <div style={{ color: "var(--grey)" }}>
              No matches recorded yet.
            </div>
          )}
          {historyData?.history?.map((row) => {
            const stake = toBigInt((row.payouts as any)?.stake);
            const bets = toBigInt((row.payouts as any)?.bets);
            const playerCut = toBigInt((row.payouts as any)?.playerCut);
            const total = toBigInt((row.payouts as any)?.total);
            const stakeAmount = toBigInt(row.stakeAmount);
            const platformRake = toBigInt((row.payouts as any)?.platformRake);
            const unredeemed = toBigInt(row.unredeemed);
            const date = new Date(row.date).toLocaleString();
            return (
              <div
                key={row.matchId}
                style={{
                  padding: "14px 16px",
                  borderRadius: 10,
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      Match {row.matchId}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--grey)" }}>
                      {row.mode.toUpperCase()} • {date}
                    </div>
                  </div>
                  <button
                    className="sk-sub-btn"
                    onClick={() => void redeemMatch(row.matchId)}
                    disabled={
                      redeemingMatchId === row.matchId || unredeemed <= 0n
                    }
                  >
                    {redeemingMatchId === row.matchId
                      ? "REDEEMING..."
                      : unredeemed > 0n
                        ? "REDEEM"
                        : "REDEEMED"}
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: 8,
                    fontSize: 12,
                  }}
                >
                  <div>
                    <div style={{ color: "var(--grey)" }}>Stake</div>
                    <div>{formatToken(stake, assetDecimals)}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--grey)" }}>Stake Amount</div>
                    <div>{formatToken(stakeAmount, assetDecimals)}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--grey)" }}>Bet Wins</div>
                    <div>{formatToken(bets, assetDecimals)}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--grey)" }}>Player Cut</div>
                    <div>{formatToken(playerCut, assetDecimals)}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--grey)" }}>Total</div>
                    <div>{formatToken(total, assetDecimals)}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--grey)" }}>Platform Rake</div>
                    <div>{formatToken(platformRake, assetDecimals)}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--grey)" }}>Unredeemed</div>
                    <div>{formatToken(unredeemed, assetDecimals)}</div>
                  </div>
                </div>

                {row.participants?.length ? (
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 11,
                      color: "var(--grey)",
                    }}
                  >
                    Participants:{" "}
                    {row.participants
                      .map((p: string) => shortenAddress(p))
                      .join(", ")}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
