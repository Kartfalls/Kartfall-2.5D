import type { MapSchema } from "@colyseus/schema";
import type { Room } from "colyseus";
import type { PlayerSchema } from "../schema/PlayerSchema.js";
import { ProjectileSchema } from "../schema/ProjectileSchema.js";
import { BombSchema } from "../schema/BombSchema.js";
import { RoomState } from "../schema/RoomState.js";
import { WEAPONS, type WeaponType } from "../../types/weapon.js";
import { GAME } from "../../config/constants.js";
import { WALLS } from "../../utils/spawnPoints.js";
import { lineIntersectsAnyWall } from "../../utils/collision.js";
import { distance } from "../../utils/math.js";
import type {
  AttackEvent,
  HitEvent,
  KillEvent,
  ExplosionEvent,
} from "../../types/events.js";

let projectileIdCounter = 0;
let bombIdCounter = 0;

/**
 * Handles weapon firing, projectile advancement, hit detection,
 * damage application, and bomb detonation.
 */
export class CombatSystem {
  private room: Room;
  private state: RoomState;
  private onKill: (killerId: string, victimId: string, weapon: string) => void;

  constructor(
    room: Room,
    state: RoomState,
    onKill: (killerId: string, victimId: string, weapon: string) => void,
  ) {
    this.room = room;
    this.state = state;
    this.onKill = onKill;
  }

  /** Process an attack command from a player. */
  handleAttack(sessionId: string, angle: number): void {
    const player = this.state.players.get(sessionId);
    if (!player || !player.isAlive || player.isSpectator) return;
    if (player.weaponType === "none") return;

    const weapon = player.weaponType as WeaponType;

    // Broadcast attack event for client VFX
    this.room.broadcast("attack_event", {
      attackerId: sessionId,
      weaponType: weapon,
      angle,
      x: player.x,
      y: player.y,
    } satisfies AttackEvent);

    switch (weapon) {
      case "rocket":
        this.fireRocket(player, sessionId, angle);
        break;
      case "bullet":
        this.startBulletStream(player, sessionId, angle);
        break;
      case "bomb":
        this.placeBomb(player, sessionId);
        break;
    }
  }

  /** Stop bullet stream fire. */
  handleStopAttack(sessionId: string): void {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    player.isFiringBullets = false;
  }

  /** Run combat tick. dt in milliseconds. */
  tick(dt: number): void {
    const now = Date.now();
    this.advanceProjectiles(dt);
    this.tickBulletStreams(now);
    this.tickBombs(now);
  }

  // ─── Rocket ───────────────────────────────────────────────────────────

  private fireRocket(
    player: PlayerSchema,
    sessionId: string,
    angle: number,
  ): void {
    const stats = WEAPONS.rocket;
    const proj = new ProjectileSchema();
    proj.ownerId = sessionId;
    proj.type = "rocket";
    proj.x = player.x + Math.cos(angle) * 24; // offset from player center
    proj.y = player.y + Math.sin(angle) * 24;
    proj.vx = Math.cos(angle) * stats.speed;
    proj.vy = Math.sin(angle) * stats.speed;
    proj.angle = angle;
    proj.createdAt = Date.now();

    const id = `p${++projectileIdCounter}`;
    this.state.projectiles.set(id, proj);

    // Clear weapon
    player.weaponType = "none";
    player.weaponAmmo = 0;
    player.weaponExpiresAt = 0;
  }

  // ─── Bullet ───────────────────────────────────────────────────────────

  private startBulletStream(
    player: PlayerSchema,
    sessionId: string,
    angle: number,
  ): void {
    if (player.weaponAmmo <= 0) return;

    player.isFiringBullets = true;
    player.angle = angle; // face the attack direction

    // Fire first bullet immediately
    this.fireBullet(player, sessionId, angle);
  }

  private fireBullet(
    player: PlayerSchema,
    sessionId: string,
    angle: number,
  ): void {
    if (player.weaponAmmo <= 0) {
      player.isFiringBullets = false;
      player.weaponType = "none";
      player.weaponExpiresAt = 0;
      return;
    }

    const stats = WEAPONS.bullet;
    // Apply random spread
    const spread = (Math.random() - 0.5) * 2 * stats.spread;
    const fireAngle = angle + spread;

    const proj = new ProjectileSchema();
    proj.ownerId = sessionId;
    proj.type = "bullet";
    proj.x = player.x + Math.cos(fireAngle) * 16;
    proj.y = player.y + Math.sin(fireAngle) * 16;
    proj.vx = Math.cos(fireAngle) * stats.speed;
    proj.vy = Math.sin(fireAngle) * stats.speed;
    proj.angle = fireAngle;
    proj.createdAt = Date.now();

    const id = `p${++projectileIdCounter}`;
    this.state.projectiles.set(id, proj);

    player.weaponAmmo -= 1;
    player.lastBulletFireTime = Date.now();

    if (player.weaponAmmo <= 0) {
      player.isFiringBullets = false;
      player.weaponType = "none";
      player.weaponExpiresAt = 0;
    }
  }

  private tickBulletStreams(now: number): void {
    this.state.players.forEach((player, sessionId) => {
      if (!player.isFiringBullets || !player.isAlive) return;
      if (player.weaponType !== "bullet") {
        player.isFiringBullets = false;
        return;
      }

      const elapsed = now - player.lastBulletFireTime;
      if (elapsed >= WEAPONS.bullet.fireInterval) {
        this.fireBullet(player, sessionId, player.angle);
      }
    });
  }

  // ─── Bomb ─────────────────────────────────────────────────────────────

  private placeBomb(player: PlayerSchema, sessionId: string): void {
    const bomb = new BombSchema();
    bomb.ownerId = sessionId;
    bomb.x = player.x;
    bomb.y = player.y;
    bomb.detonateAt = Date.now() + WEAPONS.bomb.fuseTime;
    bomb.isDetonated = false;

    const id = `b${++bombIdCounter}`;
    this.state.bombs.set(id, bomb);

    // Clear weapon
    player.weaponType = "none";
    player.weaponAmmo = 0;
    player.weaponExpiresAt = 0;
  }

  private tickBombs(now: number): void {
    const toRemove: string[] = [];

    this.state.bombs.forEach((bomb, id) => {
      if (bomb.isDetonated) return;
      if (now >= bomb.detonateAt) {
        bomb.isDetonated = true;
        this.detonateBomb(bomb);
        toRemove.push(id);
      }
    });

    for (const id of toRemove) {
      this.state.bombs.delete(id);
    }
  }

  private detonateBomb(bomb: BombSchema): void {
    const stats = WEAPONS.bomb;

    // Broadcast explosion
    this.room.broadcast("explosion_event", {
      type: "bomb",
      x: bomb.x,
      y: bomb.y,
      radius: stats.blastRadius,
    } satisfies ExplosionEvent);

    // Apply blast damage (can damage the placer!)
    this.applyBlastDamage(
      bomb.x,
      bomb.y,
      stats.blastRadius,
      stats.damage,
      stats.splashDamage,
      bomb.ownerId,
      true, // canSelfDamage
    );
  }

  // ─── Projectile advancement ───────────────────────────────────────────

  private advanceProjectiles(dt: number): void {
    const now = Date.now();
    const dtSec = dt / 1000;
    const toRemove: string[] = [];

    this.state.projectiles.forEach((proj, id) => {
      const weaponStats =
        proj.type === "rocket" ? WEAPONS.rocket : WEAPONS.bullet;
      const lifetime = weaponStats.lifetime;

      // Check lifetime
      if (now - proj.createdAt >= lifetime) {
        toRemove.push(id);
        return;
      }

      const nextX = proj.x + proj.vx * dtSec;
      const nextY = proj.y + proj.vy * dtSec;

      // Check wall collision (line trace to prevent tunneling)
      if (lineIntersectsAnyWall(proj.x, proj.y, nextX, nextY, WALLS)) {
        // Rocket explodes on wall hit
        if (proj.type === "rocket") {
          this.room.broadcast("explosion_event", {
            type: "rocket",
            x: proj.x,
            y: proj.y,
            radius: WEAPONS.rocket.explosionRadius,
          } satisfies ExplosionEvent);

          this.applyBlastDamage(
            proj.x,
            proj.y,
            WEAPONS.rocket.explosionRadius,
            WEAPONS.rocket.damage,
            WEAPONS.rocket.splashDamage,
            proj.ownerId,
            false,
          );
        }
        toRemove.push(id);
        return;
      }

      // Move projectile
      proj.x = nextX;
      proj.y = nextY;

      // Check out of world bounds
      if (
        proj.x < 0 ||
        proj.x > GAME.WORLD_W ||
        proj.y < 0 ||
        proj.y > GAME.WORLD_H
      ) {
        toRemove.push(id);
        return;
      }

      // Check player hit
      const hitSessionId = this.checkProjectileHit(proj);
      if (hitSessionId) {
        const hitPlayer = this.state.players.get(hitSessionId);
        if (hitPlayer) {
          if (proj.type === "rocket") {
            // Direct hit = full damage
            this.room.broadcast("explosion_event", {
              type: "rocket",
              x: proj.x,
              y: proj.y,
              radius: WEAPONS.rocket.explosionRadius,
            } satisfies ExplosionEvent);

            // Apply direct + splash
            this.applyBlastDamage(
              proj.x,
              proj.y,
              WEAPONS.rocket.explosionRadius,
              WEAPONS.rocket.damage,
              WEAPONS.rocket.splashDamage,
              proj.ownerId,
              false,
            );
          } else {
            // Bullet — direct damage only
            this.applyDamage(
              hitPlayer,
              hitSessionId,
              WEAPONS.bullet.damage,
              proj.ownerId,
              "bullet",
            );

            this.room.broadcast("hit_event", {
              victimId: hitSessionId,
              damage: WEAPONS.bullet.damage,
              attackerId: proj.ownerId,
              weaponType: "bullet",
              x: proj.x,
              y: proj.y,
            } satisfies HitEvent);
          }
        }
        toRemove.push(id);
      }
    });

    for (const id of toRemove) {
      this.state.projectiles.delete(id);
    }
  }

  private checkProjectileHit(proj: ProjectileSchema): string | null {
    const projRadius =
      proj.type === "rocket"
        ? WEAPONS.rocket.projectileRadius
        : WEAPONS.bullet.projectileRadius;

    for (const [sessionId, player] of this.state.players) {
      if (sessionId === proj.ownerId) continue; // can't shoot yourself
      if (!player.isAlive || player.isSpectator) continue;
      if (player.invulnUntil > Date.now()) continue; // respawn invuln

      const dist = distance(proj.x, proj.y, player.x, player.y);
      const hitRadius = GAME.PLAYER_HIT_R + projRadius;

      if (dist <= hitRadius) return sessionId;
    }
    return null;
  }

  // ─── Damage ───────────────────────────────────────────────────────────

  private applyBlastDamage(
    cx: number,
    cy: number,
    radius: number,
    centerDmg: number,
    edgeDmg: number,
    ownerId: string,
    canSelfDamage: boolean,
  ): void {
    for (const [sessionId, player] of this.state.players) {
      if (!player.isAlive || player.isSpectator) continue;
      if (!canSelfDamage && sessionId === ownerId) continue;
      if (player.invulnUntil > Date.now()) continue;

      const dist = distance(player.x, player.y, cx, cy);
      if (dist > radius) continue;

      // Linear falloff from center to edge
      const t = dist / radius;
      const damage = Math.round(centerDmg + (edgeDmg - centerDmg) * t);

      const weaponType =
        radius === WEAPONS.rocket.explosionRadius ? "rocket" : "bomb";
      this.applyDamage(player, sessionId, damage, ownerId, weaponType);

      this.room.broadcast("hit_event", {
        victimId: sessionId,
        damage,
        attackerId: ownerId,
        weaponType,
        x: player.x,
        y: player.y,
      } satisfies HitEvent);
    }
  }

  private applyDamage(
    player: PlayerSchema,
    victimId: string,
    damage: number,
    attackerId: string,
    weaponType: string,
  ): void {
    player.hp = Math.max(0, player.hp - damage);
    player.isDamaged = true;
    setTimeout(() => {
      player.isDamaged = false;
    }, 400);

    if (player.hp <= 0) {
      player.isAlive = false;
      player.deaths += 1;
      player.respawnAt = Date.now() + GAME.RESPAWN_DELAY_MS;
      player.weaponType = "none";
      player.weaponAmmo = 0;
      player.weaponExpiresAt = 0;
      player.isFiringBullets = false;
      player.vx = 0;
      player.vy = 0;

      // Credit kill to attacker
      const attacker = this.state.players.get(attackerId);
      if (attacker && attackerId !== victimId) {
        attacker.kills += 1;
        attacker.score = Math.round(
          (attacker.kills / (attacker.deaths + 1)) * 1000,
        );
      }
      player.score = Math.round((player.kills / (player.deaths + 1)) * 1000);

      // Broadcast kill event
      this.room.broadcast("kill_event", {
        killerId: attackerId,
        victimId,
        weaponType,
        x: player.x,
        y: player.y,
      } satisfies KillEvent);

      // Notify room for bet resolution
      this.onKill(attackerId, victimId, weaponType);
    }
  }
}
