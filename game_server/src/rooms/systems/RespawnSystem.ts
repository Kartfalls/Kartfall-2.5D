import type { Room } from "colyseus";
import type { PlayerSchema } from "../schema/PlayerSchema.js";
import { RoomState } from "../schema/RoomState.js";
import { GAME } from "../../config/constants.js";
import { RESPAWN_POINTS } from "../../utils/spawnPoints.js";
import { distance } from "../../utils/math.js";
import type { RespawnEvent } from "../../types/events.js";

/**
 * Handles death → respawn timer → teleport to safe spawn.
 */
export class RespawnSystem {
  private room: Room;
  private state: RoomState;

  constructor(room: Room, state: RoomState) {
    this.room = room;
    this.state = state;
  }

  /** Run respawn tick. Checks timers and respawns dead players. */
  tick(dt: number): void {
    const now = Date.now();

    this.state.players.forEach((player, sessionId) => {
      if (player.isSpectator) return;
      if (player.isAlive) return;
      if (player.respawnAt <= 0) return;

      if (now >= player.respawnAt) {
        this.respawnPlayer(player, sessionId);
      }
    });
  }

  private respawnPlayer(player: PlayerSchema, sessionId: string): void {
    const spawn = this.chooseSafeSpawn();

    player.x = spawn.x;
    player.y = spawn.y;
    player.vx = 0;
    player.vy = 0;
    player.isAlive = true;
    player.hp = GAME.MAX_HP;
    player.respawnAt = 0;
    player.weaponType = "none";
    player.weaponAmmo = 0;
    player.weaponExpiresAt = 0;
    player.isFiringBullets = false;
    player.isDamaged = false;
    player.invulnUntil = Date.now() + GAME.RESPAWN_INVULN_MS;

    this.room.broadcast("respawn_event", {
      playerId: sessionId,
      x: spawn.x,
      y: spawn.y,
    } satisfies RespawnEvent);
  }

  /** Choose a spawn point that's at least RESPAWN_MIN_DIST from living players. */
  private chooseSafeSpawn(): { x: number; y: number } {
    // Collect living player positions
    const livingPositions: Array<{ x: number; y: number }> = [];
    this.state.players.forEach((p) => {
      if (p.isAlive && !p.isSpectator) {
        livingPositions.push({ x: p.x, y: p.y });
      }
    });

    // Score each spawn point by minimum distance to any living player
    let bestSpawn = RESPAWN_POINTS[0];
    let bestMinDist = -1;

    for (const spawn of RESPAWN_POINTS) {
      let minDist = Infinity;
      for (const pos of livingPositions) {
        const d = distance(spawn.x, spawn.y, pos.x, pos.y);
        if (d < minDist) minDist = d;
      }

      // If far enough, pick randomly among valid candidates
      if (minDist >= GAME.RESPAWN_MIN_DIST) {
        if (Math.random() < 0.3 || bestMinDist < 0) {
          bestSpawn = spawn;
          bestMinDist = minDist;
        }
      } else if (minDist > bestMinDist) {
        // Fallback: pick the one furthest from any player
        bestSpawn = spawn;
        bestMinDist = minDist;
      }
    }

    return bestSpawn;
  }
}
