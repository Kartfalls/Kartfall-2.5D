import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import { PlayerSchema } from "./PlayerSchema.js";
import { CrateSchema } from "./CrateSchema.js";
import { ProjectileSchema } from "./ProjectileSchema.js";
import { BombSchema } from "./BombSchema.js";
import { BetSchema } from "./BetSchema.js";
import { LeaderboardEntry } from "./LeaderboardEntry.js";
import type { MatchPhase } from "../../types/matchPhase.js";

export class RoomState extends Schema {
  // ── Match metadata ──
  @type("string") phase: MatchPhase = "lobby";
  @type("string") roomCode: string = "";
  @type("string") hostPlayerId: string = "";
  @type("string") channelId: string = ""; // Yellow app session ID

  @type("uint16") matchDuration: number = 180; // seconds (configurable)
  @type("float64") matchStartsAt: number = 0; // epoch ms
  @type("float64") matchEndsAt: number = 0; // epoch ms
  @type("int16") remainingSeconds: number = 0; // countdown for client HUD

  // ── Gameplay state ──
  @type({ map: PlayerSchema })
  players = new MapSchema<PlayerSchema>();

  @type({ map: CrateSchema })
  crates = new MapSchema<CrateSchema>();

  @type({ map: ProjectileSchema })
  projectiles = new MapSchema<ProjectileSchema>();

  @type({ map: BombSchema })
  bombs = new MapSchema<BombSchema>();

  // ── Results ──
  @type("string") winnerPlayerId: string = "";
  @type([LeaderboardEntry])
  leaderboard = new ArraySchema<LeaderboardEntry>();

  // ── Game Mode ──
  @type("string") gameMode: string = "free"; // "free" | "staked"

  // ── Financial ──
  @type("uint32") stakeAmountMicro: number = 0; // display only
  @type("uint8") playerCount: number = 0;
  @type("uint8") maxPlayers: number = 4;
  @type("uint8") maxSpectators: number = 4;

  // ── Prediction Markets ──
  @type({ map: BetSchema })
  activeBets = new MapSchema<BetSchema>();
  @type("string") currentMarketType: string = ""; // "next_kill" | "winner" | ""
}
