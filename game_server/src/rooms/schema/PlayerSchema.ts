import { Schema, type } from "@colyseus/schema";

export class PlayerSchema extends Schema {
  // ── Identity ──
  @type("string") name: string = "";
  @type("string") walletAddress: string = "";
  @type("boolean") isSpectator: boolean = false;
  @type("boolean") isReady: boolean = false;

  // ── Position & movement (2D) ──
  @type("float32") x: number = 0;
  @type("float32") y: number = 0;
  @type("float32") vx: number = 0;
  @type("float32") vy: number = 0;
  @type("float32") angle: number = 0; // facing angle in radians (0 = right)

  // ── Health & alive state ──
  @type("uint8") hp: number = 100;
  @type("boolean") isAlive: boolean = true;
  @type("float64") respawnAt: number = 0; // epoch ms (0 = no pending respawn)

  // ── Weapon ──
  @type("string") weaponType: string = "none"; // "none" | "rocket" | "bomb" | "bullet"
  @type("float64") weaponExpiresAt: number = 0;
  @type("uint8") weaponAmmo: number = 0;

  // ── Combat stats ──
  @type("uint16") kills: number = 0;
  @type("uint16") deaths: number = 0;
  @type("int32") score: number = 0; // kills * 1000 / (deaths + 1)

  // ── Visual state hints ──
  @type("boolean") isBoosting: boolean = false;
  @type("boolean") isDamaged: boolean = false;
  @type("uint8") colorIndex: number = 0; // 0=yellow, 1=red, 2=purple, 3=black

  // ── Internal (not synced) ──
  /** Timestamp of last processed input (for rate limiting) */
  lastInputTime: number = 0;
  /** Invulnerability end time after respawn */
  invulnUntil: number = 0;
  /** Whether currently firing bullet stream */
  isFiringBullets: boolean = false;
  /** Last bullet fire timestamp */
  lastBulletFireTime: number = 0;
  /** Last ready toggle timestamp (debounce) */
  lastReadyToggle: number = 0;
  /** Privy user ID */
  privyUserId: string = "";
}
