/**
 * Server → Client broadcast event payload shapes.
 */

export interface AttackEvent {
  attackerId: string;
  weaponType: string;
  angle: number;
  x: number;
  y: number;
}

export interface HitEvent {
  victimId: string;
  damage: number;
  attackerId: string;
  weaponType: string;
  x: number;
  y: number;
}

export interface KillEvent {
  killerId: string;
  victimId: string;
  weaponType: string;
  x: number;
  y: number;
}

export interface ExplosionEvent {
  type: "rocket" | "bomb" | "mine" | "shockwave" | "sniper";
  x: number;
  y: number;
  radius: number;
}

export interface RespawnEvent {
  playerId: string;
  x: number;
  y: number;
}

export interface CratePickupEvent {
  crateId: string;
  playerId: string;
  weaponType: string;
}

export interface CountdownStartEvent {
  startsAt: number;
}

export interface GameStartedEvent {
  startsAt: number;
  endsAt: number;
  spawns: Array<{ playerId: string; x: number; y: number; angle: number }>;
}

export interface GameFinishedEvent {
  winnerId: string;
  leaderboard: Array<{
    playerId: string;
    name: string;
    kills: number;
    deaths: number;
    score: number;
    payoutMicro: number;
  }>;
}

export interface BetResolvedEvent {
  marketType: string;
  winnerId: string;
  payouts: Array<{ bettorId: string; amount: number }>;
}

export interface ErrorEvent {
  code: number;
  message: string;
}
