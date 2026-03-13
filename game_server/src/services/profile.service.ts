/**
 * Player profile persistence service — Supabase edition.
 * All public functions are async (Supabase SDK is async).
 */
import { getSupabase } from "./supabase.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlayerProfile {
  privyUserId: string;
  walletAddress: string;
  displayName: string;
  totalKills: number;
  totalDeaths: number;
  totalWins: number;
  totalGames: number;
  xp: number;
  level: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  coins: number;
  createdAt: number;
  lastSeen: number;
}

export interface MatchStatsUpdate {
  kills: number;
  deaths: number;
  won: boolean;
}

// ---------------------------------------------------------------------------
// XP / Level maths (√-based, configurable)
// ---------------------------------------------------------------------------
const XP_PER_LEVEL_FACTOR = 120;
const XP_PER_KILL = 40;
const XP_PER_DEATH = 5;
const XP_PER_WIN = 200;
const XP_PER_GAME = 15;
const COINS_PER_KILL = 10;
const COINS_PER_WIN = 100;
const COINS_PER_GAME = 5;

export function levelFromXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / XP_PER_LEVEL_FACTOR)));
}

export function xpForLevel(level: number): number {
  return level * level * XP_PER_LEVEL_FACTOR;
}

// ---------------------------------------------------------------------------
// Row → profile
// ---------------------------------------------------------------------------

function rowToProfile(row: any): PlayerProfile {
  const xp = row.xp as number;
  const level = levelFromXp(xp);
  return {
    privyUserId: row.privy_user_id,
    walletAddress: row.wallet_address,
    displayName: row.display_name,
    totalKills: row.total_kills,
    totalDeaths: row.total_deaths,
    totalWins: row.total_wins,
    totalGames: row.total_games,
    xp,
    level,
    xpForCurrentLevel: xpForLevel(level),
    xpForNextLevel: xpForLevel(level + 1),
    coins: row.coins,
    createdAt: row.created_at,
    lastSeen: row.last_seen,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieve a profile. Returns null if not found.
 */
export async function getProfile(
  privyUserId: string,
): Promise<PlayerProfile | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("player_profiles")
    .select("*")
    .eq("privy_user_id", privyUserId)
    .maybeSingle();

  if (error) {
    console.error("[Profile] getProfile error:", error.message);
    return null;
  }
  return data ? rowToProfile(data) : null;
}

/**
 * Get-or-create a profile. Call on every login/join.
 */
export async function getOrCreateProfile(
  privyUserId: string,
  walletAddress: string,
  displayName: string,
): Promise<PlayerProfile> {
  const sb = getSupabase();
  const now = Date.now();

  // Upsert — insert if new, update wallet_address + last_seen if existing
  const { error } = await sb.from("player_profiles").upsert(
    {
      privy_user_id: privyUserId,
      wallet_address: walletAddress || undefined,
      display_name: displayName || undefined,
      created_at: now,
      last_seen: now,
    },
    {
      onConflict: "privy_user_id",
      ignoreDuplicates: false,
    },
  );

  if (error) {
    console.error("[Profile] getOrCreateProfile upsert error:", error.message);
  }

  const profile = await getProfile(privyUserId);
  if (!profile) {
    throw new Error(
      "Profile row unavailable after upsert. Ensure `player_profiles` table exists and Supabase schema is migrated.",
    );
  }

  return profile;
}

/**
 * Update the player's display name.
 */
export async function updateDisplayName(
  privyUserId: string,
  displayName: string,
): Promise<PlayerProfile | null> {
  const sb = getSupabase();
  const { error } = await sb
    .from("player_profiles")
    .update({
      display_name: displayName.trim().slice(0, 24),
      last_seen: Date.now(),
    })
    .eq("privy_user_id", privyUserId);

  if (error) {
    console.error("[Profile] updateDisplayName error:", error.message);
  }
  return getProfile(privyUserId);
}

/**
 * Record end-of-match stats, award XP & coins.
 */
export async function recordMatchStats(
  privyUserId: string,
  stats: MatchStatsUpdate,
  roomCode?: string,
): Promise<PlayerProfile | null> {
  const sb = getSupabase();

  const gainedXp =
    stats.kills * XP_PER_KILL +
    stats.deaths * XP_PER_DEATH +
    (stats.won ? XP_PER_WIN : 0) +
    XP_PER_GAME;

  const gainedCoins =
    stats.kills * COINS_PER_KILL +
    (stats.won ? COINS_PER_WIN : 0) +
    COINS_PER_GAME;

  // Fetch current values for incrementing
  const current = await getProfile(privyUserId);
  if (!current) return null;

  const { error: updateError } = await sb
    .from("player_profiles")
    .update({
      total_kills: current.totalKills + stats.kills,
      total_deaths: current.totalDeaths + stats.deaths,
      total_wins: current.totalWins + (stats.won ? 1 : 0),
      total_games: current.totalGames + 1,
      xp: current.xp + gainedXp,
      coins: current.coins + gainedCoins,
      last_seen: Date.now(),
    })
    .eq("privy_user_id", privyUserId);

  if (updateError) {
    console.error("[Profile] recordMatchStats error:", updateError.message);
  }

  // Record match history
  const { error: historyError } = await sb.from("match_history").insert({
    privy_user_id: privyUserId,
    room_code: roomCode ?? null,
    kills: stats.kills,
    deaths: stats.deaths,
    won: stats.won,
    xp_earned: gainedXp,
    coins_earned: gainedCoins,
    played_at: Date.now(),
  });

  if (historyError) {
    console.error("[Profile] match_history insert error:", historyError.message);
  }

  return getProfile(privyUserId);
}
