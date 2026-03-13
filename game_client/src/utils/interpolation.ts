/**
 * Smooth position interpolation for remote entities.
 * Uses Phaser.Math.Linear (lerp) to smoothly approach the server position.
 */
import Phaser from "phaser";
import { DISPLAY } from "../game/constants";

/**
 * Interpolate a sprite toward a target position.
 * @param sprite  The Phaser game object to move
 * @param targetX Server-authoritative X
 * @param targetY Server-authoritative Y
 * @param isLocal Whether this is the local player (faster lerp)
 */
export function interpolatePosition(
  sprite: Phaser.GameObjects.Sprite,
  targetX: number,
  targetY: number,
  isLocal: boolean = false,
): void {
  const factor = isLocal ? DISPLAY.LERP_LOCAL : DISPLAY.LERP_REMOTE;
  sprite.x = Phaser.Math.Linear(sprite.x, targetX, factor);
  sprite.y = Phaser.Math.Linear(sprite.y, targetY, factor);
}
