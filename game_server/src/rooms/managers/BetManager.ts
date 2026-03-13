import type { Room } from "colyseus";
import { BetSchema } from "../schema/BetSchema.js";
import { RoomState } from "../schema/RoomState.js";
import { GAME } from "../../config/constants.js";
import { calculateBetPayouts } from "../../services/financial.js";
import {
  ASSET_DECIMALS,
  DEFAULT_ASSET,
  getPlayerAssetBalance,
  transferOffChain,
} from "../../services/yellow.service.js";
import { env } from "../../config/env.js";
import type { BetResolvedEvent } from "../../types/events.js";
import { Decimal } from "decimal.js";

interface InternalBet {
  bettorSessionId: string;
  bettorWallet: string;
  marketType: string;
  targetPlayerId: string;
  amountWei: bigint;
}

/**
 * Manages prediction market betting for spectators.
 * Handles bet placement, live market resolution (on kill events),
 * and static market resolution (on match end).
 */
export class BetManager {
  private room: Room;
  private state: RoomState;

  /** Internal bet tracking with full-precision amounts */
  private bets: InternalBet[] = [];
  private betIdCounter = 0;
  private reservedBetsByWallet = new Map<string, bigint>();

  constructor(room: Room, state: RoomState) {
    this.room = room;
    this.state = state;
  }

  /** Start a new live prediction market round. */
  startNextKillMarket(): void {
    this.state.currentMarketType = "next_kill";
    // Clear previous round's bets from schema (keep internal tracking)
    this.state.activeBets.clear();
  }

  /** Place a bet from a spectator. */
  async placeBet(
    sessionId: string,
    walletAddress: string,
    marketType: string,
    targetPlayerId: string,
    amountWei: bigint,
  ): Promise<{ success: boolean; error?: string }> {
    // Validate
    if (amountWei < GAME.MIN_BET_WEI) {
      return { success: false, error: "Bet amount too low (min 0.1 USDC)" };
    }
    if (amountWei > GAME.MAX_BET_WEI) {
      return { success: false, error: "Bet amount too high (max 10 USDC)" };
    }

    if (!walletAddress) {
      return { success: false, error: "Wallet is required to place bets" };
    }

    // Check target player exists and is not spectator
    const targetPlayer = this.state.players.get(targetPlayerId);
    if (!targetPlayer || targetPlayer.isSpectator) {
      return { success: false, error: "Invalid target player" };
    }

    // Check market type matches current
    if (
      marketType === "next_kill" &&
      this.state.currentMarketType !== "next_kill"
    ) {
      return { success: false, error: "No active next_kill market" };
    }

    if (!(env.NODE_ENV === "development" && !env.YELLOW_PRIVATE_KEY)) {
      const availableWei = await this.getAvailableBetBalanceWei(walletAddress);
      if (availableWei < amountWei) {
        return {
          success: false,
          error: "Insufficient channel balance for this bet",
        };
      }
    }

    this.reserveBet(walletAddress, amountWei);

    // Store internally
    const bet: InternalBet = {
      bettorSessionId: sessionId,
      bettorWallet: walletAddress,
      marketType,
      targetPlayerId,
      amountWei,
    };
    this.bets.push(bet);

    // Add to synced schema for spectator display
    const betSchema = new BetSchema();
    betSchema.bettorSessionId = sessionId;
    betSchema.bettorWallet = walletAddress;
    betSchema.marketType = marketType;
    betSchema.targetPlayerId = targetPlayerId;
    betSchema.amountMicro = Number(amountWei);
    this.state.activeBets.set(`bet${++this.betIdCounter}`, betSchema);

    return { success: true };
  }

  /**
   * Resolve live "next_kill" market when a kill happens.
   * Returns the player cut (1% of bet pool) to credit to the bet-on player.
   */
  async resolveKillEvent(killerId: string, _victimId: string): Promise<void> {
    const killBets = this.bets.filter((b) => b.marketType === "next_kill");
    if (killBets.length === 0) return;

    const totalPool = killBets.reduce((sum, b) => sum + b.amountWei, 0n);
    const winningBets = killBets
      .filter((b) => b.targetPlayerId === killerId)
      .map((b) => ({ address: b.bettorWallet, amount: b.amountWei }));

    const result = calculateBetPayouts(totalPool, winningBets);

    // Distribute payouts (skip in dev)
    if (env.NODE_ENV !== "development") {
      try {
        for (const winner of result.winningBettors) {
          await transferOffChain(winner.address, winner.payout);
        }
        // Player cut goes to the player being bet on
        const killer = this.state.players.get(killerId);
        if (killer && result.playerCut > 0n) {
          await transferOffChain(killer.walletAddress, result.playerCut);
        }
      } catch (err) {
        console.error("[BetManager] Payout distribution error:", err);
      }
    }

    // Broadcast resolution
    this.room.broadcast("bet_resolved", {
      marketType: "next_kill",
      winnerId: killerId,
      payouts: result.winningBettors.map((w) => ({
        bettorId: w.address,
        amount: Number(w.payout),
      })),
    } satisfies BetResolvedEvent);

    this.releaseReservedForBets(killBets);

    // Remove resolved bets
    this.bets = this.bets.filter((b) => b.marketType !== "next_kill");

    // Start new round
    this.startNextKillMarket();
  }

  /**
   * Resolve static markets (winner, most_deaths) at match end.
   */
  async resolveMatchEnd(winnerId: string, mostDeathsId: string): Promise<void> {
    // Resolve "winner" bets
    await this.resolveStaticMarket("winner", winnerId);

    // Resolve "most_deaths" bets
    await this.resolveStaticMarket("most_deaths", mostDeathsId);

    // Clear all remaining bets
    this.releaseReservedForBets(this.bets);
    this.bets = [];
    this.reservedBetsByWallet.clear();
    this.state.activeBets.clear();
    this.state.currentMarketType = "";
  }

  private async resolveStaticMarket(
    marketType: string,
    winnerId: string,
  ): Promise<void> {
    const marketBets = this.bets.filter((b) => b.marketType === marketType);
    if (marketBets.length === 0) return;

    const totalPool = marketBets.reduce((sum, b) => sum + b.amountWei, 0n);
    const winningBets = marketBets
      .filter((b) => b.targetPlayerId === winnerId)
      .map((b) => ({ address: b.bettorWallet, amount: b.amountWei }));

    const result = calculateBetPayouts(totalPool, winningBets);

    if (env.NODE_ENV !== "development") {
      try {
        for (const winner of result.winningBettors) {
          await transferOffChain(winner.address, winner.payout);
        }
      } catch (err) {
        console.error(`[BetManager] ${marketType} payout error:`, err);
      }
    }

    this.room.broadcast("bet_resolved", {
      marketType,
      winnerId,
      payouts: result.winningBettors.map((w) => ({
        bettorId: w.address,
        amount: Number(w.payout),
      })),
    } satisfies BetResolvedEvent);

    this.releaseReservedForBets(marketBets);

    // Remove resolved bets
    this.bets = this.bets.filter((b) => b.marketType !== marketType);
  }

  private reserveBet(walletAddress: string, amountWei: bigint): void {
    const current = this.reservedBetsByWallet.get(walletAddress) ?? 0n;
    this.reservedBetsByWallet.set(walletAddress, current + amountWei);
  }

  private releaseReservedForBets(bets: InternalBet[]): void {
    for (const bet of bets) {
      const current = this.reservedBetsByWallet.get(bet.bettorWallet) ?? 0n;
      const next = current > bet.amountWei ? current - bet.amountWei : 0n;
      if (next === 0n) {
        this.reservedBetsByWallet.delete(bet.bettorWallet);
      } else {
        this.reservedBetsByWallet.set(bet.bettorWallet, next);
      }
    }
  }

  private async getAvailableBetBalanceWei(walletAddress: string): Promise<bigint> {
    try {
      const balanceToken = await getPlayerAssetBalance(walletAddress, DEFAULT_ASSET);
      const totalWei = this.tokenAmountToWei(balanceToken);
      const reservedWei = this.reservedBetsByWallet.get(walletAddress) ?? 0n;
      return totalWei > reservedWei ? totalWei - reservedWei : 0n;
    } catch (err) {
      console.error(
        `[BetManager] Failed to fetch channel balance for ${walletAddress}:`,
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
}
