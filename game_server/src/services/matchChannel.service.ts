import { getSupabase } from "./supabase.js";

export type MatchChannelStatus = "open" | "settled" | "closed";

export interface MatchChannelInsert {
  matchId: string;
  channelId: string;
  participants: string[];
  asset: string;
  chainId: number;
  mode: string;
  stakeAmount: bigint;
  status: MatchChannelStatus;
  version: bigint;
  createdAt: number;
}

export interface ChannelBalanceUpsert {
  channelId: string;
  wallet: string;
  unredeemedAmount: bigint;
  lastUpdated: number;
}

export interface ChannelHistoryInsert {
  channelId: string;
  matchId: string;
  wallet: string;
  payouts: Record<string, unknown>;
  betBreakdown: Record<string, unknown>;
  stakeBreakdown: Record<string, unknown>;
  resultSummary: Record<string, unknown>;
  createdAt: number;
}

function normalizeWallet(wallet: string): string {
  return wallet.toLowerCase();
}

export async function createMatchChannelRecord(
  payload: MatchChannelInsert,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("match_channels").insert({
    match_id: payload.matchId,
    channel_id: payload.channelId,
    participants: payload.participants.map((p) => normalizeWallet(p)),
    asset: payload.asset,
    chain_id: payload.chainId,
    mode: payload.mode,
    stake_amount: payload.stakeAmount.toString(),
    status: payload.status,
    version: payload.version.toString(),
    created_at: payload.createdAt,
  });

  if (error) {
    console.error("[MatchChannels] createMatchChannelRecord error:", error);
  }
}

export async function addChannelParticipant(
  matchId: string,
  wallet: string,
): Promise<void> {
  const sb = getSupabase();
  const normalized = normalizeWallet(wallet);
  const { data, error } = await sb
    .from("match_channels")
    .select("participants")
    .eq("match_id", matchId)
    .maybeSingle();

  if (error) {
    console.error("[MatchChannels] addChannelParticipant select error:", error);
    return;
  }

  const current = Array.isArray(data?.participants) ? data?.participants : [];
  if (current.map((p: string) => p.toLowerCase()).includes(normalized)) {
    return;
  }

  const updated = [...current, normalized];
  const { error: updateError } = await sb
    .from("match_channels")
    .update({ participants: updated })
    .eq("match_id", matchId);

  if (updateError) {
    console.error(
      "[MatchChannels] addChannelParticipant update error:",
      updateError,
    );
  }
}

export async function updateChannelVersion(
  matchId: string,
  version: bigint,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("match_channels")
    .update({ version: version.toString() })
    .eq("match_id", matchId);

  if (error) {
    console.error("[MatchChannels] updateChannelVersion error:", error);
  }
}

export async function markChannelSettled(matchId: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("match_channels")
    .update({ status: "settled" })
    .eq("match_id", matchId);

  if (error) {
    console.error("[MatchChannels] markChannelSettled error:", error);
  }
}

export async function markChannelClosed(matchId: string): Promise<void> {
  const sb = getSupabase();
  const now = Date.now();
  const { error } = await sb
    .from("match_channels")
    .update({ status: "closed", closed_at: now })
    .eq("match_id", matchId);

  if (error) {
    console.error("[MatchChannels] markChannelClosed error:", error);
  }
}

export async function upsertChannelBalances(
  balances: ChannelBalanceUpsert[],
): Promise<void> {
  if (!balances.length) return;
  const sb = getSupabase();
  const rows = balances.map((b) => ({
    channel_id: b.channelId,
    wallet: normalizeWallet(b.wallet),
    unredeemed_amount: b.unredeemedAmount.toString(),
    last_updated: b.lastUpdated,
  }));

  const { error } = await sb.from("channel_balances").upsert(rows, {
    onConflict: "channel_id,wallet",
  });

  if (error) {
    console.error("[MatchChannels] upsertChannelBalances error:", error);
  }
}

export async function clearChannelBalances(channelId: string): Promise<void> {
  const sb = getSupabase();
  const now = Date.now();
  const { error } = await sb
    .from("channel_balances")
    .update({ unredeemed_amount: "0", last_updated: now })
    .eq("channel_id", channelId);

  if (error) {
    console.error("[MatchChannels] clearChannelBalances error:", error);
  }
}

export async function insertChannelHistory(
  rows: ChannelHistoryInsert[],
): Promise<void> {
  if (!rows.length) return;
  const sb = getSupabase();
  const payload = rows.map((row) => ({
    channel_id: row.channelId,
    match_id: row.matchId,
    wallet: normalizeWallet(row.wallet),
    payouts: row.payouts,
    bet_breakdown: row.betBreakdown,
    stake_breakdown: row.stakeBreakdown,
    result_summary: row.resultSummary,
    created_at: row.createdAt,
  }));

  const { error } = await sb.from("channel_history").insert(payload);
  if (error) {
    console.error("[MatchChannels] insertChannelHistory error:", error);
  }
}

export async function getMatchChannel(matchId: string): Promise<any | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("match_channels")
    .select("*")
    .eq("match_id", matchId)
    .maybeSingle();

  if (error) {
    console.error("[MatchChannels] getMatchChannel error:", error);
    return null;
  }
  return data ?? null;
}

export async function getChannelBalance(
  channelId: string,
  wallet: string,
): Promise<bigint> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("channel_balances")
    .select("unredeemed_amount")
    .eq("channel_id", channelId)
    .eq("wallet", normalizeWallet(wallet))
    .maybeSingle();

  if (error) {
    console.error("[MatchChannels] getChannelBalance error:", error);
    return 0n;
  }

  const raw = data?.unredeemed_amount ?? "0";
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

export async function getChannelBalancesForWallet(
  wallet: string,
): Promise<Array<{ channelId: string; unredeemedAmount: bigint }>> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("channel_balances")
    .select("channel_id, unredeemed_amount")
    .eq("wallet", normalizeWallet(wallet));

  if (error) {
    console.error("[MatchChannels] getChannelBalancesForWallet error:", error);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    channelId: row.channel_id,
    unredeemedAmount: BigInt(row.unredeemed_amount ?? "0"),
  }));
}

export async function getHistoryForWallet(
  wallet: string,
): Promise<any[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("channel_history")
    .select("*")
    .eq("wallet", normalizeWallet(wallet))
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[MatchChannels] getHistoryForWallet error:", error);
    return [];
  }
  return data ?? [];
}

export async function getMatchChannelsByIds(
  matchIds: string[],
): Promise<any[]> {
  if (!matchIds.length) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from("match_channels")
    .select("*")
    .in("match_id", matchIds);

  if (error) {
    console.error("[MatchChannels] getMatchChannelsByIds error:", error);
    return [];
  }
  return data ?? [];
}
