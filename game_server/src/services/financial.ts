export interface PlayerMatchStats {
  sessionId: string;
  walletAddress: string;
  kills: number;
  deaths: number;
}

export interface PlayerPayout {
  sessionId: string;
  walletAddress: string;
  stakeShare: bigint; // their cut of the stake pool (wei)
  playerCut: bigint; // their cut from bets placed on them (wei)
}

export interface BetPayouts {
  winningBettors: {
    address: string;
    payout: bigint; // this also in wei
  }[];
  platformRake: bigint; // the cut that the platform takes from the total bet pool (wei)
  playerCut: bigint;
}

const STAKE_RAKE_BPS = 400n; // 4%   platform fee on stake pool
const BET_RAKE_BPS = 250n; // 2.5% platform fee on bet pool
const BET_PLAYER_BPS = 100n; // 1%   goes to the player being bet on
const BPS_DENOMINATOR = 10000n; // it's just how you do percentage math with integers.
// 1 basis point (BPS) = 0.01%
// So 10000 BPS = 100%

export function calculateStakePayouts(
  stats: PlayerMatchStats[],
  totalStakePool: bigint,
): PlayerPayout[] {
  const rake = (totalStakePool * STAKE_RAKE_BPS) / BPS_DENOMINATOR;
  const distributable = totalStakePool - rake;
  const kdScores = stats.map((p) => ({
    ...p,
    kdScaled: BigInt(Math.floor((p.kills / (p.deaths + 1)) * 1000)),
  }));

  const totalKd = kdScores.reduce((sum, p) => sum + p.kdScaled, 0n);

  if (totalKd === 0n) {
    // if everyone has 0 kills, just split the pool evenly
    const evenShare = distributable / BigInt(stats.length);
    return stats.map((p) => ({
      sessionId: p.sessionId,
      walletAddress: p.walletAddress,
      stakeShare: evenShare,
      playerCut: 0n,
    }));
  }

  return kdScores.map((p) => {
    const share = (distributable * p.kdScaled) / totalKd;
    return {
      sessionId: p.sessionId,
      walletAddress: p.walletAddress,
      stakeShare: share,
      playerCut: 0n, // player cut is only from bets, not the stake pool
    };
  });
}
// BET PAYOUTS ARE CALCULATED IN A SEPARATE FUNCTION, BECAUSE THEY REQUIRE KNOWLEDGE OF THE BETTING OUTCOMES, WHICH MAY NOT BE AVAILABLE AT THE TIME STAKE PAYOUTS ARE CALCULATED.

/**
 * Calculates payouts for a single prediction market.
 *
 * Formula:
 *   platform_rake  = 2.5% of total bet pool
 *   player_cut     = 1%   of total bet pool (to the player being bet on)
 *   distributable  = pool - rake - player_cut
 *   bettor_payout  = (their_bet / total_winning_side) × distributable
 *
 * Edge case: no winning bets → platform keeps everything.
 */

export function calculateBetPayouts(
  totalBetPool: bigint,
  winningBets: { address: string; amount: bigint }[],
): BetPayouts {
  const rake = (totalBetPool * BET_RAKE_BPS) / BPS_DENOMINATOR;
  const playerCut = (totalBetPool * BET_PLAYER_BPS) / BPS_DENOMINATOR;
  const distributable = totalBetPool - rake - playerCut;

  const totalWinningSide = winningBets.reduce((sum, b) => sum + b.amount, 0n);

  // Edge case — no winning bets → platform keeps everything
  if (totalWinningSide === 0n) {
    return {
      winningBettors: [],
      platformRake: totalBetPool,
      playerCut: 0n,
    };
  }

  const winningBettors = winningBets.map((bet) => ({
    address: bet.address,
    payout: (bet.amount * distributable) / totalWinningSide,
  }));

  return { winningBettors, platformRake: rake, playerCut };
}

export function calcTotalStakePool(
  stakePerPlayer: bigint,
  playerCount: number,
): bigint {
  return stakePerPlayer * BigInt(playerCount);
}

/**
 * Merge playerCuts from all 4 bet markets into the stake payout array.
 * Call this after all markets have settled.
 */
export function mergePlayerCuts(
  stakePayouts: PlayerPayout[],
  playerCutsByAddress: Map<string, bigint>,
): PlayerPayout[] {
  return stakePayouts.map((p) => ({
    ...p,
    playerCut: playerCutsByAddress.get(p.walletAddress) ?? 0n,
  }));
}
