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
 * damage application, bomb/mine detonation, hazard zone, and boost pads.
 */
export class CombatSystem {
  private room: Room;
  private state: RoomState;
  private onKill: (killerId: string, victimId: string, weapon: string) => void;

  // Per-player hazard damage throttle (not synced — in-memory only)
  private lastHazardDmgAt = new Map<string, number>();

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
      case "sniper":
        this.fireSniper(player, sessionId, angle);
        break;
      case "mine":
        this.placeMine(player, sessionId);
        break;
      case "shockwave":
        this.firePulse(player, sessionId);
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
    this.tickPulseCharges(now);
    this.tickHazardZone(now);
    this.tickBoostPads(now);
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
    proj.x = player.x + Math.cos(angle) * 24;
    proj.y = player.y + Math.sin(angle) * 24;
    proj.vx = Math.cos(angle) * stats.speed;
    proj.vy = Math.sin(angle) * stats.speed;
    proj.angle = angle;
    proj.createdAt = Date.now();

    const id = `p${++projectileIdCounter}`;
    this.state.projectiles.set(id, proj);

    player.weaponType = "none";
    player.weaponAmmo = 0;
    player.weaponExpiresAt = 0;
  }

  // ─── Sniper ───────────────────────────────────────────────────────────

  private fireSniper(
    player: PlayerSchema,
    sessionId: string,
    angle: number,
  ): void {
    const stats = WEAPONS.sniper;
    const proj = new ProjectileSchema();
    proj.ownerId = sessionId;
    proj.type = "sniper";
    proj.x = player.x + Math.cos(angle) * 20;
    proj.y = player.y + Math.sin(angle) * 20;
    proj.vx = Math.cos(angle) * stats.speed;
    proj.vy = Math.sin(angle) * stats.speed;
    proj.angle = angle;
    proj.createdAt = Date.now();

    const id = `p${++projectileIdCounter}`;
    this.state.projectiles.set(id, proj);

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
    player.angle = angle;

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
    bomb.isMine = false;

    const id = `b${++bombIdCounter}`;
    this.state.bombs.set(id, bomb);

    player.weaponType = "none";
    player.weaponAmmo = 0;
    player.weaponExpiresAt = 0;
  }

  // ─── Mine ─────────────────────────────────────────────────────────────

  private placeMine(player: PlayerSchema, sessionId: string): void {
    const now = Date.now();
    const mine = new BombSchema();
    mine.ownerId = sessionId;
    mine.x = player.x;
    mine.y = player.y;
    mine.detonateAt = now + WEAPONS.mine.fuseTime;
    mine.armedAt = now + WEAPONS.mine.armDelay;
    mine.isDetonated = false;
    mine.isMine = true;
    mine.triggerRadius = WEAPONS.mine.triggerRadius;

    const id = `b${++bombIdCounter}`;
    this.state.bombs.set(id, mine);

    // Decrement ammo; if more ammo left, keep weapon
    player.weaponAmmo -= 1;
    if (player.weaponAmmo <= 0) {
      player.weaponType = "none";
      player.weaponAmmo = 0;
      player.weaponExpiresAt = 0;
    }
  }

  private tickBombs(now: number): void {
    const toRemove: string[] = [];

    this.state.bombs.forEach((bomb, id) => {
      if (bomb.isDetonated) return;

      if (bomb.isMine) {
        // Check proximity trigger (only after arm delay)
        if (now >= bomb.armedAt) {
          for (const [sid, player] of this.state.players) {
            if (sid === bomb.ownerId) continue; // never triggers on placer
            if (!player.isAlive || player.isSpectator) continue;
            if (player.invulnUntil > now) continue;

            const dist = distance(player.x, player.y, bomb.x, bomb.y);
            if (dist <= bomb.triggerRadius) {
              bomb.isDetonated = true;
              this.detonateExplosive(bomb, "mine");
              toRemove.push(id);
              break;
            }
          }
        }
        // Also respect fuse timer as fallback
        if (!bomb.isDetonated && now >= bomb.detonateAt) {
          bomb.isDetonated = true;
          this.detonateExplosive(bomb, "mine");
          toRemove.push(id);
        }
      } else {
        // Regular bomb — fuse timer
        if (now >= bomb.detonateAt) {
          bomb.isDetonated = true;
          this.detonateExplosive(bomb, "bomb");
          toRemove.push(id);
        }
      }
    });

    for (const id of toRemove) {
      this.state.bombs.delete(id);
    }
  }

  private detonateExplosive(bomb: BombSchema, weaponType: "bomb" | "mine"): void {
    const stats = weaponType === "mine" ? WEAPONS.mine : WEAPONS.bomb;

    this.room.broadcast("explosion_event", {
      type: weaponType,
      x: bomb.x,
      y: bomb.y,
      radius: stats.blastRadius,
    } satisfies ExplosionEvent);

    this.applyBlastDamage(
      bomb.x,
      bomb.y,
      stats.blastRadius,
      stats.damage,
      stats.splashDamage,
      bomb.ownerId,
      weaponType === "bomb", // bombs can self-damage; mines cannot
      weaponType,
    );
  }

  // ─── Shockwave Pulse ──────────────────────────────────────────────────

  private firePulse(player: PlayerSchema, _sessionId: string): void {
    player.pulseChargeUntil = Date.now() + WEAPONS.shockwave.chargeTime;
    // Weapon is cleared after detonation in tickPulseCharges
  }

  private tickPulseCharges(now: number): void {
    this.state.players.forEach((player, sessionId) => {
      if (!player.isAlive || player.pulseChargeUntil <= 0) return;
      if (now < player.pulseChargeUntil) return; // still charging

      // Detonate!
      const px = player.x;
      const py = player.y;
      player.pulseChargeUntil = 0;
      player.weaponType = "none";
      player.weaponAmmo = 0;
      player.weaponExpiresAt = 0;

      this.room.broadcast("explosion_event", {
        type: "shockwave",
        x: px,
        y: py,
        radius: WEAPONS.shockwave.blastRadius,
      } satisfies ExplosionEvent);

      this.applyBlastDamage(
        px,
        py,
        WEAPONS.shockwave.blastRadius,
        WEAPONS.shockwave.damage,
        WEAPONS.shockwave.splashDamage,
        sessionId,
        true, // shockwave can self-damage
        "shockwave",
      );
    });
  }

  // ─── Hazard Zone ──────────────────────────────────────────────────────

  private tickHazardZone(now: number): void {
    const zone = GAME.HAZARD_ZONE;

    this.state.players.forEach((player, sessionId) => {
      if (!player.isAlive || player.isSpectator) return;
      if (player.invulnUntil > now) return;

      // Check if player is inside the hazard rectangle
      if (
        player.x >= zone.x &&
        player.x <= zone.x + zone.w &&
        player.y >= zone.y &&
        player.y <= zone.y + zone.h
      ) {
        const last = this.lastHazardDmgAt.get(sessionId) ?? 0;
        if (now - last >= GAME.HAZARD_INTERVAL_MS) {
          this.lastHazardDmgAt.set(sessionId, now);
          this.applyDamage(player, sessionId, GAME.HAZARD_DMG, "hazard", "hazard");

          this.room.broadcast("hit_event", {
            victimId: sessionId,
            damage: GAME.HAZARD_DMG,
            attackerId: "hazard",
            weaponType: "hazard",
            x: player.x,
            y: player.y,
          } satisfies HitEvent);
        }
      }
    });
  }

  // ─── Boost Pads ───────────────────────────────────────────────────────

  private tickBoostPads(now: number): void {
    const pads = GAME.BOOST_PAD_POSITIONS;
    const r = GAME.BOOST_PAD_R;
    const dur = GAME.BOOST_DURATION_MS;

    this.state.players.forEach((player) => {
      if (!player.isAlive || player.isSpectator) return;

      // Clear boost flag if expired
      if (player.boostedUntil > 0 && now >= player.boostedUntil) {
        player.isBoosting = false;
        player.boostedUntil = 0;
      }

      for (const pad of pads) {
        const dist = distance(player.x, player.y, pad.x, pad.y);
        if (dist <= r) {
          player.boostedUntil = now + dur;
          player.isBoosting = true;
          break;
        }
      }
    });
  }

  // ─── Projectile advancement ───────────────────────────────────────────

  private advanceProjectiles(dt: number): void {
    const now = Date.now();
    const dtSec = dt / 1000;
    const toRemove: string[] = [];

    this.state.projectiles.forEach((proj, id) => {
      const lifetime = this.getProjectileLifetime(proj.type);

      if (now - proj.createdAt >= lifetime) {
        toRemove.push(id);
        return;
      }

      const nextX = proj.x + proj.vx * dtSec;
      const nextY = proj.y + proj.vy * dtSec;

      // Wall collision
      if (lineIntersectsAnyWall(proj.x, proj.y, nextX, nextY, WALLS)) {
        if (proj.type === "rocket") {
          this.room.broadcast("explosion_event", {
            type: "rocket",
            x: proj.x,
            y: proj.y,
            radius: WEAPONS.rocket.explosionRadius,
          } satisfies ExplosionEvent);
          this.applyBlastDamage(
            proj.x, proj.y,
            WEAPONS.rocket.explosionRadius,
            WEAPONS.rocket.damage,
            WEAPONS.rocket.splashDamage,
            proj.ownerId, false, "rocket",
          );
        }
        toRemove.push(id);
        return;
      }

      proj.x = nextX;
      proj.y = nextY;

      // World bounds
      if (proj.x < 0 || proj.x > GAME.WORLD_W || proj.y < 0 || proj.y > GAME.WORLD_H) {
        toRemove.push(id);
        return;
      }

      // Player hit
      const hitSessionId = this.checkProjectileHit(proj);
      if (hitSessionId) {
        const hitPlayer = this.state.players.get(hitSessionId);
        if (hitPlayer) {
          if (proj.type === "rocket") {
            this.room.broadcast("explosion_event", {
              type: "rocket",
              x: proj.x,
              y: proj.y,
              radius: WEAPONS.rocket.explosionRadius,
            } satisfies ExplosionEvent);
            this.applyBlastDamage(
              proj.x, proj.y,
              WEAPONS.rocket.explosionRadius,
              WEAPONS.rocket.damage,
              WEAPONS.rocket.splashDamage,
              proj.ownerId, false, "rocket",
            );
          } else if (proj.type === "sniper") {
            this.applyDamage(hitPlayer, hitSessionId, WEAPONS.sniper.damage, proj.ownerId, "sniper");
            this.room.broadcast("hit_event", {
              victimId: hitSessionId,
              damage: WEAPONS.sniper.damage,
              attackerId: proj.ownerId,
              weaponType: "sniper",
              x: proj.x,
              y: proj.y,
            } satisfies HitEvent);
          } else {
            // Bullet
            this.applyDamage(hitPlayer, hitSessionId, WEAPONS.bullet.damage, proj.ownerId, "bullet");
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

  private getProjectileLifetime(type: string): number {
    switch (type) {
      case "rocket": return WEAPONS.rocket.lifetime;
      case "sniper": return WEAPONS.sniper.lifetime;
      default:       return WEAPONS.bullet.lifetime;
    }
  }

  private checkProjectileHit(proj: ProjectileSchema): string | null {
    let projRadius: number;
    switch (proj.type) {
      case "rocket": projRadius = WEAPONS.rocket.projectileRadius; break;
      case "sniper": projRadius = WEAPONS.sniper.projectileRadius; break;
      default:       projRadius = WEAPONS.bullet.projectileRadius;
    }

    for (const [sessionId, player] of this.state.players) {
      if (sessionId === proj.ownerId) continue;
      if (!player.isAlive || player.isSpectator) continue;
      if (player.invulnUntil > Date.now()) continue;

      const dist = distance(proj.x, proj.y, player.x, player.y);
      if (dist <= GAME.PLAYER_HIT_R + projRadius) return sessionId;
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
    weaponType: string,
  ): void {
    for (const [sessionId, player] of this.state.players) {
      if (!player.isAlive || player.isSpectator) continue;
      if (!canSelfDamage && sessionId === ownerId) continue;
      if (player.invulnUntil > Date.now()) continue;

      const dist = distance(player.x, player.y, cx, cy);
      if (dist > radius) continue;

      const t = dist / radius;
      const damage = Math.round(centerDmg + (edgeDmg - centerDmg) * t);

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
    setTimeout(() => { player.isDamaged = false; }, 400);

    if (player.hp <= 0) {
      player.isAlive = false;
      player.deaths += 1;
      player.respawnAt = Date.now() + GAME.RESPAWN_DELAY_MS;
      player.weaponType = "none";
      player.weaponAmmo = 0;
      player.weaponExpiresAt = 0;
      player.isFiringBullets = false;
      player.pulseChargeUntil = 0;
      player.vx = 0;
      player.vy = 0;

      const attacker = this.state.players.get(attackerId);
      if (attacker && attackerId !== victimId) {
        attacker.kills += 1;
        attacker.score = Math.round((attacker.kills / (attacker.deaths + 1)) * 1000);
      }
      player.score = Math.round((player.kills / (player.deaths + 1)) * 1000);

      this.room.broadcast("kill_event", {
        killerId: attackerId,
        victimId,
        weaponType,
        x: player.x,
        y: player.y,
      } satisfies KillEvent);

      this.onKill(attackerId, victimId, weaponType);
    }
  }
}
