import type { MapSchema } from "@colyseus/schema";
import type { PlayerSchema } from "../schema/PlayerSchema.js";
import type { InputMessage } from "../../types/input.js";
import { GAME } from "../../config/constants.js";
import { WALLS } from "../../utils/spawnPoints.js";
import { circleRectOverlap } from "../../utils/collision.js";
import { clamp } from "../../utils/math.js";

/**
 * 2D top-down movement system.
 * Processes raw WASD input → acceleration → velocity → position,
 * with wall collision resolution and world bounds clamping.
 */
export class MovementSystem {
  private inputBuffer = new Map<string, InputMessage>();

  /** Buffer an input from a client. */
  setInput(sessionId: string, input: InputMessage): void {
    this.inputBuffer.set(sessionId, input);
  }

  /** Clear input for a player (on leave). */
  clearInput(sessionId: string): void {
    this.inputBuffer.delete(sessionId);
  }

  /** Run one physics tick. dt is in milliseconds. */
  tick(players: MapSchema<PlayerSchema>, dt: number): void {
    const dtSec = dt / 1000;

    players.forEach((player, sessionId) => {
      if (!player.isAlive || player.isSpectator) return;

      const input = this.inputBuffer.get(sessionId);
      const { dx, dy } = this.inputToDirection(input);

      this.movePlayer(player, dx, dy, dtSec);
    });
  }

  private inputToDirection(input: InputMessage | undefined): {
    dx: number;
    dy: number;
  } {
    if (!input) return { dx: 0, dy: 0 };

    let dx = 0;
    let dy = 0;
    if (input.right) dx += 1;
    if (input.left) dx -= 1;
    if (input.forward) dy -= 1; // up = negative Y in screen coords
    if (input.backward) dy += 1;

    // Normalize diagonal movement
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }
    return { dx, dy };
  }

  private movePlayer(
    player: PlayerSchema,
    dx: number,
    dy: number,
    dtSec: number,
  ): void {
    // Boost pad: apply speed multiplier if active
    const now = Date.now();
    const maxSpeed = (player.boostedUntil > 0 && now < player.boostedUntil)
      ? GAME.MOVE_SPEED * GAME.BOOST_SPEED_MULT
      : GAME.MOVE_SPEED;

    if (dx !== 0 || dy !== 0) {
      // Accelerate toward input direction
      player.vx += dx * GAME.MOVE_ACCEL * dtSec;
      player.vy += dy * GAME.MOVE_ACCEL * dtSec;

      // Clamp to max speed (boosted or normal)
      const speed = Math.sqrt(player.vx ** 2 + player.vy ** 2);
      if (speed > maxSpeed) {
        player.vx = (player.vx / speed) * maxSpeed;
        player.vy = (player.vy / speed) * maxSpeed;
      }

      // Update facing angle
      player.angle = Math.atan2(dy, dx);
    } else {
      // Apply friction (decelerate to stop)
      const speed = Math.sqrt(player.vx ** 2 + player.vy ** 2);
      if (speed > 0) {
        const frictionDelta = GAME.MOVE_FRICTION * dtSec;
        if (speed <= frictionDelta) {
          player.vx = 0;
          player.vy = 0;
        } else {
          const scale = (speed - frictionDelta) / speed;
          player.vx *= scale;
          player.vy *= scale;
        }
      }
    }

    // Integrate position
    player.x += player.vx * dtSec;
    player.y += player.vy * dtSec;

    // Wall collision resolution
    this.resolveWallCollisions(player);

    // Clamp to world bounds
    this.clampToWorldBounds(player);
  }

  private resolveWallCollisions(player: PlayerSchema): void {
    const r = GAME.PLAYER_HITBOX_R;

    for (const wall of WALLS) {
      const result = circleRectOverlap(player.x, player.y, r, wall);
      if (!result) continue;

      const { overlap, nx, ny } = result;

      // Push player out of wall
      player.x += nx * overlap;
      player.y += ny * overlap;

      // Slide velocity along wall surface
      const dot = player.vx * nx + player.vy * ny;
      player.vx = (player.vx - dot * nx) * 0.7; // WALL_SLIDE_FACTOR
      player.vy = (player.vy - dot * ny) * 0.7;
    }
  }

  private clampToWorldBounds(player: PlayerSchema): void {
    const r = GAME.PLAYER_HITBOX_R;
    player.x = clamp(player.x, r, GAME.WORLD_W - r);
    player.y = clamp(player.y, r, GAME.WORLD_H - r);

    // Stop velocity at bounds
    if (player.x <= r || player.x >= GAME.WORLD_W - r) player.vx = 0;
    if (player.y <= r || player.y >= GAME.WORLD_H - r) player.vy = 0;
  }
}
