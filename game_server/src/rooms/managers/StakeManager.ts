import type { PlayerSchema } from "../schema/PlayerSchema.js";
import { RoomState } from "../schema/RoomState.js";
import {
  calculateStakePayouts,
  calcTotalStakePool,
  type PlayerMatchStats,
} from "../../services/financial.js";
import {
  createMatchChannel,
  depositPlayerStake,
  finalizeMatchChannel,
  getPlayerAssetBalance,
  updateMatchState,
  DEFAULT_ASSET,
  ASSET_DECIMALS,
  type MatchChannelConfig,
} from "../../services/yellow.service.js";
import { env } from "../../config/env.js";
import { GAME } from "../../config/constants.js";
import { Decimal } from "decimal.js";

/**
 * Manages state channel lifecycle, stake collection,
 * and match-end payout distribution via Yellow Network.
 *
 * - Creates a Yellow App Session (state channel) for EVERY match
 * - Staked games: collects deposits from each player into the channel
 * - Free games: channel is used for spectator bets + game event recording
 * - At match end: submits final allocations and closes the channel
 */
export class StakeManager {
  private state: RoomState;
  private stakePerPlayerWei: bigint;
  private stakedPlayers = new Set<string>(); // wallet addresses that have staked
  private reservedStakeByWallet = new Map<string, bigint>();
  private channelVersion = 0n; // monotonically increasing version counter

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

  /**
   * Creates a Yellow state channel for this match.
   * Called at match start for ALL game modes (free + staked).
   * All non-spectator player wallets become channel participants.
   */
  async createChannel(roomId: string): Promise<void> {
    if (!env.YELLOW_ENABLED) {
      console.log("[StakeManager] Yellow disabled — skipping channel creation");
      return;
    }
    if (!env.YELLOW_ASSET_ADDRESS || !env.YELLOW_CUSTODY_ADDRESS || !env.YELLOW_ADJUDICATOR_ADDRESS) {
      console.warn("[StakeManager] Yellow config missing contract addresses — staked mode unavailable");
      return;
    }
    const players = this.getNonSpectatorPlayers();
    const wallets = players.map(([, p]) => p.walletAddress).filter((w) => !!w);

    // Include spectator wallets too — they participate via bets
    const spectators: string[] = [];
    this.state.players.forEach((p) => {
      if (p.isSpectator && p.walletAddress) {
        spectators.push(p.walletAddress);
      }
    });

    const allWallets = [...wallets, ...spectators];

    if (allWallets.length === 0) {
      console.log("[StakeManager] No wallets — skipping channel creation");
      return;
    }

    try {
      const config: MatchChannelConfig = {
        applicationId: env.YELLOW_APP_ID || GAME.YELLOW_APP_ID,
        playerWallets: allWallets,
        roomCode: this.state.roomCode,
        gameMode: this.state.gameMode,
        matchId: `${roomId}_${Date.now()}`,
      };

      const result = await createMatchChannel(config);
      this.state.channelId = result.appSessionId;
      this.channelVersion = 1n;

      console.log(
        `[StakeManager] Channel created: ${result.appSessionId} with ${allWallets.length} participants`,
      );
    } catch (err) {
      console.error("[StakeManager] Failed to create channel:", err);
      // Don't block the match — channel is best-effort
    }
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

    if (env.NODE_ENV === "development" && !env.YELLOW_PRIVATE_KEY) {
      this.stakedPlayers.add(walletAddress);
      this.reserveStake(walletAddress, this.stakePerPlayerWei);
      return;
    }
    if (!env.YELLOW_ASSET_ADDRESS || !env.YELLOW_CUSTODY_ADDRESS || !env.YELLOW_ADJUDICATOR_ADDRESS) {
      throw new Error("Yellow contract addresses missing — cannot collect stake");
    }

    if (!this.state.channelId) {
      throw new Error("State channel is not available for stake collection");
    }

    try {
      const availableWei = await this.getWalletAvailableWei(walletAddress);
      if (availableWei < this.stakePerPlayerWei) {
        throw new Error(
          `Insufficient channel balance for stake (${availableWei.toString()} < ${this.stakePerPlayerWei.toString()})`,
        );
      }

      const amount = new Decimal(this.stakePerPlayerWei.toString()).div(
        new Decimal(10).pow(ASSET_DECIMALS),
      );

      await depositPlayerStake(
        this.state.channelId,
        walletAddress,
        amount,
        this.channelVersion++,
      );

      this.reserveStake(walletAddress, this.stakePerPlayerWei);
      this.stakedPlayers.add(walletAddress);
    } catch (err) {
      console.error(
        `[StakeManager] Failed to collect stake from ${walletAddress}:`,
        err,
      );
      throw err;
    }
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

    // In channel mode, refunds are handled by updating the channel state
    // to remove the player's allocation before match starts
    this.stakedPlayers.delete(walletAddress);
    this.releaseStake(walletAddress, this.stakePerPlayerWei);
    console.log(
      `[StakeManager] Stake refund recorded for ${walletAddress} (channel will be updated at finalization)`,
    );
  }

  /**
   * Records a game event (kill, pickup, etc.) into the state channel.
   * Called during gameplay for on-channel record keeping.
   */
  async recordGameEvent(eventData: Record<string, unknown>): Promise<void> {
    if (!env.YELLOW_ENABLED || !this.state.channelId) return;

    try {
      await updateMatchState(
        this.state.channelId,
        eventData,
        [], // no allocation change for game events
        this.channelVersion++,
      );
    } catch (err) {
      // Don't block gameplay for channel updates
      console.error("[StakeManager] Failed to record game event:", err);
    }
  }

  /**
   * Calculate and distribute payouts at match end.
   * Updates leaderboard payoutMicro fields and finalizes the state channel.
   */
  async distributePayouts(): Promise<void> {
    if (!env.YELLOW_ENABLED) return;
    const players = this.getNonSpectatorPlayers();
    if (players.length === 0) return;
    if (!env.YELLOW_ASSET_ADDRESS || !env.YELLOW_CUSTODY_ADDRESS || !env.YELLOW_ADJUDICATOR_ADDRESS) {
      console.warn("[StakeManager] Yellow contract addresses missing — skipping payouts");
      return;
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

    const payouts = isStaked ? calculateStakePayouts(stats, totalPool) : [];

    // Update leaderboard with payout amounts
    for (const entry of this.state.leaderboard) {
      const payout = payouts.find((p) => p.sessionId === entry.playerId);
      if (payout) {
        entry.payoutMicro = Number(payout.stakeShare);
      }
    }

    // Build match results for on-channel recording
    const matchResults = {
      gameMode: this.state.gameMode,
      roomCode: this.state.roomCode,
      playerCount: players.length,
      results: stats.map((s) => ({
        sessionId: s.sessionId,
        wallet: s.walletAddress,
        kills: s.kills,
        deaths: s.deaths,
      })),
      winner: this.state.winnerPlayerId,
      timestamp: new Date().toISOString(),
    };

    // Finalize the state channel
    if (this.state.channelId) {
      try {
        const allocations: AppAllocation[] = isStaked
          ? payouts.map((p) => ({
              participant: p.walletAddress as `0x${string}`,
              asset: DEFAULT_ASSET,
              amount: new Decimal(p.stakeShare.toString()).div(
                new Decimal(10).pow(ASSET_DECIMALS),
              ),
            }))
          : [];

        await finalizeMatchChannel(
          this.state.channelId,
          allocations,
          matchResults,
          this.channelVersion++,
        );

        console.log(`[StakeManager] Channel ${this.state.channelId} finalized`);
      } catch (err) {
        console.error("[StakeManager] Failed to finalize channel:", err);
      }
    } else if (isStaked) {
      // Fallback for staked games without a channel
      console.log(
        "[StakeManager] No channel — payouts logged locally:",
        payouts.map((p) => ({
          wallet: p.walletAddress,
          share: p.stakeShare.toString(),
        })),
      );
    }

    this.stakedPlayers.clear();
    this.reservedStakeByWallet.clear();
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
