import type { MapSchema } from "@colyseus/schema";
import type { Room } from "colyseus";
import type { PlayerSchema } from "../schema/PlayerSchema.js";
import { CrateSchema } from "../schema/CrateSchema.js";
import { RoomState } from "../schema/RoomState.js";
import { GAME } from "../../config/constants.js";
import { CRATE_POSITIONS } from "../../utils/spawnPoints.js";
import { rollWeapon, type WeaponType } from "../../types/weapon.js";
import { WEAPONS } from "../../types/weapon.js";
import { distance } from "../../utils/math.js";
import type { CratePickupEvent } from "../../types/events.js";

/**
 * Manages weapon crate spawning, pickups, and weapon expiry timers.
 */
export class ItemSystem {
  private room: Room;
  private state: RoomState;

  constructor(room: Room, state: RoomState) {
    this.room = room;
    this.state = state;
  }

  /** Initialize all crates at their fixed positions. */
  initCrates(): void {
    for (const pos of CRATE_POSITIONS) {
      const crate = new CrateSchema();
      crate.x = pos.x;
      crate.y = pos.y;
      crate.isAvailable = true;
      this.state.crates.set(pos.id, crate);
    }
  }

  /** Run item tick. Handles crate respawns and weapon expiry. */
  tick(dt: number): void {
    const now = Date.now();
    this.tickCrateRespawns(now);
    this.tickWeaponExpiry(now);
  }

  /** Process a pickup request from a player. */
  handlePickup(sessionId: string, crateId: string): void {
    const player = this.state.players.get(sessionId);
    if (!player || !player.isAlive || player.isSpectator) return;

    // Can't pick up if already armed
    if (player.weaponType !== "none") return;

    const crate = this.state.crates.get(crateId);
    if (!crate || !crate.isAvailable) return;

    // Range check
    const dist = distance(player.x, player.y, crate.x, crate.y);
    if (dist > GAME.PICKUP_RANGE) return;

    // Assign random weapon
    const weapon = rollWeapon();
    player.weaponType = weapon;
    player.weaponExpiresAt = Date.now() + GAME.WEAPON_EXPIRY_MS;

    // Set ammo based on weapon type
    switch (weapon) {
      case "rocket":
        player.weaponAmmo = WEAPONS.rocket.ammo;
        break;
      case "bomb":
        player.weaponAmmo = WEAPONS.bomb.ammo;
        break;
      case "bullet":
        player.weaponAmmo = WEAPONS.bullet.ammo;
        break;
    }

    // Mark crate as picked up
    crate.isAvailable = false;
    crate.weaponType = weapon;
    crate.respawnAt = Date.now() + GAME.CRATE_RESPAWN_MS;

    // Broadcast
    this.room.broadcast("crate_pickup", {
      crateId,
      playerId: sessionId,
      weaponType: weapon,
    } satisfies CratePickupEvent);
  }

  private tickCrateRespawns(now: number): void {
    this.state.crates.forEach((crate) => {
      if (crate.isAvailable) return;
      if (crate.respawnAt > 0 && now >= crate.respawnAt) {
        crate.isAvailable = true;
        crate.weaponType = "";
        crate.respawnAt = 0;
      }
    });
  }

  private tickWeaponExpiry(now: number): void {
    this.state.players.forEach((player) => {
      if (player.weaponType === "none") return;
      if (player.weaponExpiresAt > 0 && now >= player.weaponExpiresAt) {
        player.weaponType = "none";
        player.weaponAmmo = 0;
        player.weaponExpiresAt = 0;
        player.isFiringBullets = false;
      }
    });
  }
}
