import type { Room } from "colyseus";
import { RoomState } from "../schema/RoomState.js";
import { LeaderboardEntry } from "../schema/LeaderboardEntry.js";
import { GAME } from "../../config/constants.js";
import { PLAYER_SPAWNS } from "../../utils/spawnPoints.js";
import type {
  CountdownStartEvent,
  GameStartedEvent,
  GameFinishedEvent,
} from "../../types/events.js";
import type { MatchPhase } from "../../types/matchPhase.js";

/**
 * Manages match lifecycle phase transitions:
 * lobby → countdown → playing → finished → dispose
 */
export class MatchManager {
  private room: Room;
  private state: RoomState;
  private disposeTimeout: ReturnType<typeof setTimeout> | null = null;
  private lowPlayerCountAt: number | null = null;
  private onMatchStart: () => void;
  private onMatchEnd: () => void;
  private onFinalizePayouts?: () => void;

  constructor(
    room: Room,
    state: RoomState,
    onMatchStart: () => void,
    onMatchEnd: () => void,
    onFinalizePayouts?: () => void,
  ) {
    this.room = room;
    this.state = state;
    this.onMatchStart = onMatchStart;
    this.onMatchEnd = onMatchEnd;
    this.onFinalizePayouts = onFinalizePayouts;
  }

  /** Check if all players are ready and can start countdown. */
  checkReadyState(): void {
    if (this.state.phase !== "lobby") return;

    const players = this.getNonSpectatorPlayers();
    const minPlayers =
      this.state.gameMode === "staked"
        ? Math.max(GAME.MIN_PLAYERS_TO_START, 2)
        : GAME.MIN_PLAYERS_TO_START;
    if (players.length < minPlayers) return;

    const allReady = players.every(([, p]) => p.isReady);
    if (!allReady) return;

    this.transitionTo("countdown");
  }

  /** Called when a player unreadies or disconnects during countdown. */
  cancelCountdown(): void {
    if (this.state.phase !== "countdown") return;
    this.transitionTo("lobby");
  }

  /** Tick the match timer. dt in milliseconds. */
  tick(dt: number): void {
    const now = Date.now();

    if (this.state.phase === "countdown") {
      if (now >= this.state.matchStartsAt) {
        const players = this.getNonSpectatorPlayers();
        const minPlayers = Math.max(GAME.MIN_PLAYERS_TO_START, 2);
        if (players.length < minPlayers) {
          this.transitionTo("lobby");
          return;
        }
        this.transitionTo("playing");
      } else {
        this.state.remainingSeconds = Math.ceil(
          (this.state.matchStartsAt - now) / 1000,
        );
      }
    }

    if (this.state.phase === "playing") {
      if (now >= this.state.matchEndsAt) {
        this.transitionTo("finished");
      } else {
        this.state.remainingSeconds = Math.ceil(
          (this.state.matchEndsAt - now) / 1000,
        );
      }

      // Note: don't end match just because all died — they respawn.
      // Only end if playerCount dropped to <= 1 from disconnections.
      // Use a 6-second grace period so a briefly-disconnecting player
      // doesn't immediately kill the match before they can reconnect.
      if (this.state.playerCount <= 1) {
        if (this.lowPlayerCountAt === null) {
          this.lowPlayerCountAt = now;
        } else if (now - this.lowPlayerCountAt >= 6000) {
          this.transitionTo("finished");
        }
      } else {
        this.lowPlayerCountAt = null;
      }
    }
  }

  /** Get active match duration in seconds (from env or default). */
  get matchDurationSec(): number {
    return this.state.matchDuration;
  }

  dispose(): void {
    if (this.disposeTimeout) {
      clearTimeout(this.disposeTimeout);
      this.disposeTimeout = null;
    }
    this.lowPlayerCountAt = null;
  }

  // ── Private ──

  private transitionTo(phase: MatchPhase): void {
    const prev = this.state.phase;
    this.state.phase = phase;

    switch (phase) {
      case "countdown": {
        const now = Date.now();
        this.state.matchStartsAt = now + GAME.COUNTDOWN_SEC * 1000;
        this.state.remainingSeconds = GAME.COUNTDOWN_SEC;

        this.room.broadcast("countdown_start", {
          startsAt: this.state.matchStartsAt,
        } satisfies CountdownStartEvent);

        // Lock the room — no more players
        this.room.lock();
        break;
      }

      case "lobby": {
        // Reset countdown state
        this.state.matchStartsAt = 0;
        this.state.remainingSeconds = 0;

        // Unlock for new players
        this.room.unlock();
        break;
      }

      case "playing": {
        this.lowPlayerCountAt = null; // reset grace timer on each new match
        const now = Date.now();
        this.state.matchStartsAt = now;
        this.state.matchEndsAt = now + this.matchDurationSec * 1000;
        this.state.remainingSeconds = this.matchDurationSec;

        // Teleport players to spawn points
        const players = this.getNonSpectatorPlayers();
        const spawns: GameStartedEvent["spawns"] = [];

        players.forEach(([sessionId, player], index) => {
          const spawn = PLAYER_SPAWNS[index % PLAYER_SPAWNS.length];
          player.x = spawn.x;
          player.y = spawn.y;
          player.angle = spawn.angle;
          player.vx = 0;
          player.vy = 0;
          player.isAlive = true;
          player.hp = GAME.MAX_HP;
          player.kills = 0;
          player.deaths = 0;
          player.score = 0;
          player.weaponType = "none";
          player.weaponAmmo = 0;
          player.weaponExpiresAt = 0;
          player.isFiringBullets = false;
          player.isDamaged = false;
          player.isBoosting = false;
          player.respawnAt = 0;
          player.invulnUntil = 0;

          spawns.push({
            playerId: sessionId,
            x: spawn.x,
            y: spawn.y,
            angle: spawn.angle,
          });
        });

        this.room.broadcast("game_started", {
          startsAt: this.state.matchStartsAt,
          endsAt: this.state.matchEndsAt,
          spawns,
        } satisfies GameStartedEvent);

        this.onMatchStart();
        break;
      }

      case "finished": {
        // Calculate final scores and populate leaderboard
        this.populateLeaderboard();

        // Finalize payouts (e.g. stake shares) so payoutMicro is set on
        // each leaderboard entry before the broadcast reaches clients.
        this.onFinalizePayouts?.();

        this.room.broadcast("game_finished", {
          winnerId: this.state.winnerPlayerId,
          leaderboard: this.state.leaderboard.map((e) => ({
            playerId: e.playerId,
            name: e.name,
            kills: e.kills,
            deaths: e.deaths,
            score: e.score,
            payoutMicro: e.payoutMicro,
          })),
        } satisfies GameFinishedEvent);

        this.onMatchEnd();

        // Auto-dispose after result display
        this.disposeTimeout = setTimeout(() => {
          this.room.disconnect();
        }, GAME.RESULT_DISPLAY_SEC * 1000);
        break;
      }
    }
  }

  private populateLeaderboard(): void {
    const players = this.getNonSpectatorPlayers();

    // Sort by score descending
    const sorted = [...players].sort(([, a], [, b]) => b.score - a.score);

    this.state.leaderboard.clear();
    for (const [sessionId, player] of sorted) {
      const entry = new LeaderboardEntry();
      entry.playerId = sessionId;
      entry.name = player.name;
      entry.kills = player.kills;
      entry.deaths = player.deaths;
      entry.score = player.score;
      entry.payoutMicro = 0; // filled later by StakeManager
      this.state.leaderboard.push(entry);
    }

    // Winner = highest score
    if (sorted.length > 0) {
      this.state.winnerPlayerId = sorted[0][0];
    }
  }

  private getNonSpectatorPlayers(): Array<[string, any]> {
    const result: Array<[string, any]> = [];
    this.state.players.forEach((player, sessionId) => {
      if (!player.isSpectator) result.push([sessionId, player]);
    });
    return result;
  }
}
