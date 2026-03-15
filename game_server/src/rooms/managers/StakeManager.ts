import type { PlayerSchema } from "../schema/PlayerSchema.js";
import { RoomState } from "../schema/RoomState.js";
import {
  calculateStakePayouts,
  calcTotalStakePool,
  type PlayerMatchStats,
  type PlayerPayout,
} from "../../services/financial.js";
import {
  getPlayerAssetBalance,
  verifyStakeDeposit,
  ASSET_DECIMALS,
  DEFAULT_ASSET,
} from "../../services/yellow.service.js";
import { env } from "../../config/env.js";
import { Decimal } from "decimal.js";

/**
 * Manages stake validation, reservation, and payout calculation.
 *
 * - Tracks per-player stake reservations (staked mode only)
 * - Verifies available balances via Yellow ledger
 * - Computes stake payouts at match end for downstream settlement
 */
export class StakeManager {
  private state: RoomState;
  private stakePerPlayerWei: bigint;
  private stakedPlayers = new Set<string>(); // wallet addresses that have staked
  private reservedStakeByWallet = new Map<string, bigint>();
  private verifiedDepositTxs = new Set<string>(); // txHash → already consumed
  private payoutSummaryCache: {
    payouts: PlayerPayout[];
    totalPool: bigint;
    rake: bigint;
  } | null = null;

  constructor(state: RoomState, stakeAmountUsdc?: number) {
    this.state = state;

    // If a valid dynamic stake is provided (e.g., from room options), use it.
    // Otherwise fallback to the STAKE_AMOUNT_WEI env var or 1 USDC.
    if (stakeAmountUsdc && stakeAmountUsdc > 0) {
      // 1 USDC = 1,000,000 micro-USDC (6 decimals standard)
      this.stakePerPlayerWei = BigInt(Math.floor(stakeAmountUsdc * 1_000_000));
    } else {
      const stakeEnv = process.env.STAKE_AMOUNT_WEI;
      this.stakePerPlayerWei = stakeEnv ? BigInt(stakeEnv) : 1_000_000n; // 1 USDC default
    }

    this.state.stakeAmountMicro = Number(this.stakePerPlayerWei);
  }

  getStakePerPlayerWei(): bigint {
    return this.stakePerPlayerWei;
  }

  async canPlayerStake(walletAddress: string): Promise<boolean> {
    if (!env.YELLOW_ENABLED) return true;
    if (!walletAddress) return false;
    if (env.NODE_ENV === "development" && !env.YELLOW_PRIVATE_KEY) {
      return true;
    }
    // Custodial mode: readiness does not depend on the player's unified balance.
    return true;
  }

  /**
   * Verify an on-chain deposit transaction and register it as the player's stake.
   * Prevents the same txHash from being reused across players or matches.
   */
  async verifyAndReserveDeposit(
    walletAddress: string,
    txHash: string,
  ): Promise<{ valid: boolean; error?: string }> {
    if (!env.YELLOW_ENABLED) return { valid: true };
    if (!walletAddress) return { valid: false, error: "No wallet address" };
    if (env.NODE_ENV === "development" && !env.YELLOW_PRIVATE_KEY) {
      return { valid: true }; // bypass in dev/test mode
    }

    if (!txHash) {
      return {
        valid: false,
        error: "Please deposit your stake first before readying up.",
      };
    }

    const txKey = txHash.toLowerCase();
    if (this.verifiedDepositTxs.has(txKey)) {
      return {
        valid: false,
        error: "This deposit transaction has already been used.",
      };
    }

    const result = await verifyStakeDeposit(
      txHash,
      walletAddress,
      this.stakePerPlayerWei,
    );

    if (result.valid) {
      this.verifiedDepositTxs.add(txKey);
    }

    return result;
  }

  /**
   * Collects a player's stake by depositing into the state channel.
   * Only called for staked games.
   */
  async collectStake(walletAddress: string): Promise<void> {
    if (!env.YELLOW_ENABLED) return;
    if (!walletAddress) {
      throw new Error("Player wallet is required for staked matches");
    }

    if (this.stakedPlayers.has(walletAddress)) {
      return;
    }

    this.payoutSummaryCache = null; // invalidate cache when new stake is collected
    this.reserveStake(walletAddress, this.stakePerPlayerWei);
    this.stakedPlayers.add(walletAddress);
  }

  /**
   * Refund stake to a player (on leave during lobby/countdown).
   */
  async refundStake(walletAddress: string): Promise<void> {
    if (!env.YELLOW_ENABLED) return;
    if (!this.stakedPlayers.has(walletAddress)) return;

    if (env.NODE_ENV === "development" && !env.YELLOW_PRIVATE_KEY) {
      this.stakedPlayers.delete(walletAddress);
      this.releaseStake(walletAddress, this.stakePerPlayerWei);
      return;
    }

    this.stakedPlayers.delete(walletAddress);
    this.releaseStake(walletAddress, this.stakePerPlayerWei);
    console.log(
      `[StakeManager] Stake refund recorded for ${walletAddress}`,
    );
  }

  /**
   * Calculate and distribute payouts at match end.
   * Updates leaderboard payoutMicro fields and finalizes the state channel.
   */
  finalizeStakePayouts(): {
    payouts: PlayerPayout[];
    totalPool: bigint;
    rake: bigint;
  } {
    // Return cached result if already finalized (prevents double-call from
    // MatchManager's onFinalizePayouts callback + handleMatchEnd both calling this).
    if (this.payoutSummaryCache !== null) {
      return this.payoutSummaryCache;
    }

    const players = this.getNonSpectatorPlayers();
    if (players.length === 0) {
      return { payouts: [], totalPool: 0n, rake: 0n };
    }

    const isStaked = this.state.gameMode === "staked";

    // Calculate payouts (even for free games — for leaderboard display)
    const totalPool = isStaked
      ? calcTotalStakePool(this.stakePerPlayerWei, this.stakedPlayers.size)
      : 0n;

    const stats: PlayerMatchStats[] = players.map(([sessionId, player]) => ({
      sessionId,
      walletAddress: player.walletAddress,
      kills: player.kills,
      deaths: player.deaths,
    }));

    const payouts: PlayerPayout[] = isStaked
      ? calculateStakePayouts(stats, totalPool)
      : [];

    // Update leaderboard with payout amounts
    for (const entry of this.state.leaderboard) {
      const payout = payouts.find((p) => p.sessionId === entry.playerId);
      if (payout) {
        entry.payoutMicro = Number(payout.stakeShare);
      }
    }

    const paidTotal = payouts.reduce((sum, p) => sum + p.stakeShare, 0n);
    const rake = totalPool > paidTotal ? totalPool - paidTotal : 0n;

    this.stakedPlayers.clear();
    this.reservedStakeByWallet.clear();

    const summary = { payouts, totalPool, rake };
    this.payoutSummaryCache = summary;
    return summary;
  }

  private reserveStake(walletAddress: string, amountWei: bigint): void {
    const current = this.reservedStakeByWallet.get(walletAddress) ?? 0n;
    this.reservedStakeByWallet.set(walletAddress, current + amountWei);
  }

  private releaseStake(walletAddress: string, amountWei: bigint): void {
    const current = this.reservedStakeByWallet.get(walletAddress) ?? 0n;
    const next = current > amountWei ? current - amountWei : 0n;
    if (next === 0n) {
      this.reservedStakeByWallet.delete(walletAddress);
      return;
    }
    this.reservedStakeByWallet.set(walletAddress, next);
  }

  private async getWalletAvailableWei(walletAddress: string): Promise<bigint> {
    try {
      const balanceToken = await getPlayerAssetBalance(walletAddress, DEFAULT_ASSET);
      const totalWei = this.tokenAmountToWei(balanceToken);
      const reservedWei = this.reservedStakeByWallet.get(walletAddress) ?? 0n;
      return totalWei > reservedWei ? totalWei - reservedWei : 0n;
    } catch (err) {
      console.error(
        `[StakeManager] Failed to fetch channel balance for ${walletAddress}:`,
        err,
      );
      return 0n;
    }
  }

  private tokenAmountToWei(amountToken: string): bigint {
    try {
      return BigInt(
        new Decimal(amountToken || "0")
          .mul(new Decimal(10).pow(ASSET_DECIMALS))
          .toFixed(0, Decimal.ROUND_FLOOR),
      );
    } catch {
      return 0n;
    }
  }

  private getNonSpectatorPlayers(): Array<[string, PlayerSchema]> {
    const result: Array<[string, PlayerSchema]> = [];
    this.state.players.forEach((player, sessionId) => {
      if (!player.isSpectator) result.push([sessionId, player]);
    });
    return result;
  }
}
