/**
 * Message type definitions mirroring server event payloads.
 * Used by both React UI and Phaser scenes.
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
  type: string; // "rocket" | "bomb"
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
  spawns: Record<string, { x: number; y: number }>;
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
  payouts: Array<{
    bettorId: string;
    amount: number;
  }>;
}

export interface ChatMessage {
  senderId: string;
  senderName: string;
  text: string;
}

export interface InputMessage {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
}
