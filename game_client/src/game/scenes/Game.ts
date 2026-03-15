import Phaser from "phaser";
import { getStateCallbacks, type Room } from "@colyseus/sdk";
import { EventBus } from "../EventBus";
import { DISPLAY } from "../constants";
import {
  COLORS,
  type KartColor,
  type KartState,
  kartKey,
  TEX_PROJ_ROCKET,
  TEX_PROJ_BULLET,
  TEX_PROJ_BOMB,
  TEX_PICKUP_ROCKET,
  TEX_PICKUP_BOMB,
  TEX_PICKUP_BULLET,
  TEX_PICKUP_GLOW,
  TEX_PICKUP_CRATE,
  TEX_PARTICLE_SMOKE,
  TEX_PARTICLE_SPARK,
  TEX_PARTICLE_EXHAUST,
  TEX_TILESET,
  TEX_DAMAGE_FLASH,
  ANIM_EXPLOSION_ROCKET,
  ANIM_EXPLOSION_BOMB,
  ANIM_IMPACT_BULLET,
  ANIM_IMPACT_GROUND,
  ANIM_PICKUP_GLOW,
  ANIM_BOMB_SPIN,
  ANIM_SMOKE,
  ANIM_SPARK,
  animDeath,
  animRespawn,
} from "../spriteKeys";
import { angleToFrame } from "../../utils/angleToFrame";
import { interpolatePosition } from "../../utils/interpolation";
import {
  AUDIO_KEYS,
  isAudioEnabled,
  readAudioSettings,
  writeAudioSettings,
} from "../audio";

/* ────────────────────────────────────────────
 *  Arena layout (mirrors server/src/utils/spawnPoints.ts)
 * ──────────────────────────────────────────── */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const WALLS: Rect[] = [
  // ── Border walls (16px thick) ──
  { x: 0, y: 0, w: 1600, h: 16 }, // top
  { x: 0, y: 1184, w: 1600, h: 16 }, // bottom
  { x: 0, y: 0, w: 16, h: 1200 }, // left
  { x: 1584, y: 0, w: 16, h: 1200 }, // right

  // ── Corner bastions ──
  { x: 16, y: 16, w: 200, h: 64 }, // top-left
  { x: 16, y: 1120, w: 200, h: 64 }, // bottom-left
  { x: 1384, y: 16, w: 200, h: 64 }, // top-right
  { x: 1384, y: 1120, w: 200, h: 64 }, // bottom-right

  // ── Mid-lane dividers ──
  { x: 400, y: 300, w: 16, h: 600 }, // left vertical
  { x: 1184, y: 300, w: 16, h: 600 }, // right vertical

  // ── Center cross ──
  { x: 700, y: 560, w: 200, h: 16 }, // horizontal bar
  { x: 792, y: 460, w: 16, h: 200 }, // vertical bar

  // ── Inner Pods ──
  { x: 600, y: 300, w: 80, h: 64 }, // top-left pod
  { x: 920, y: 300, w: 80, h: 64 }, // top-right pod
  { x: 600, y: 836, w: 80, h: 64 }, // bottom-left pod
  { x: 920, y: 836, w: 80, h: 64 }, // bottom-right pod
];

const CRATE_POSITIONS = [
  { id: "c0", x: 800, y: 300 }, // Top
  { id: "c1", x: 800, y: 900 }, // Bottom
  { id: "c2", x: 500, y: 600 }, // Left
  { id: "c3", x: 1100, y: 600 }, // Right
];

const WALL_Z = 64; // visual extrusion height

/* ────────────────────────────────────────────
 *  Helper: derive visual kart state
 * ──────────────────────────────────────────── */

interface PlayerLike {
  isAlive: boolean;
  weaponType: string;
  isDamaged: boolean;
  isBoosting: boolean;
}

function getKartState(player: PlayerLike, isFiring: boolean): KartState {
  if (!player.isAlive) return "dead";

  if (isFiring) {
    if (player.weaponType === "rocket") return "firing_rocket";
    if (player.weaponType === "bullet") return "firing_bullet";
    if (player.weaponType === "bomb") return "firing_bomb";
  }

  if (player.isDamaged) return "damaged";

  if (player.weaponType === "rocket") return "holding_rocket";
  if (player.weaponType === "bomb") return "holding_bomb";
  if (player.weaponType === "bullet") return "holding_bullet";

  if (player.isBoosting) return "boost";

  return "idle";
}

/* ────────────────────────────────────────────
 *  Tracked entity wrappers
 * ──────────────────────────────────────────── */

interface KartEntity {
  sprite: Phaser.GameObjects.Sprite;
  exhaust: Phaser.GameObjects.Particles.ParticleEmitter | null;
  firingUntil: number; // timestamp
  targetX: number;
  targetY: number;
}

interface ProjectileEntity {
  sprite: Phaser.GameObjects.Sprite;
}

interface BombEntity {
  sprite: Phaser.GameObjects.Sprite;
}

interface CrateEntity {
  base: Phaser.GameObjects.Sprite;
  icon: Phaser.GameObjects.Sprite;
  glow: Phaser.GameObjects.Sprite;
  bobTween?: Phaser.Tweens.Tween;
}

interface GameStartedSpawn {
  playerId: string;
  x: number;
  y: number;
  angle: number;
}

interface GameStartedMessage {
  startsAt: number;
  endsAt: number;
  spawns: GameStartedSpawn[];
}

/* ════════════════════════════════════════════
 *  GAME SCENE
 * ════════════════════════════════════════════ */

export class Game extends Phaser.Scene {
  // ── Room ──
  private room!: Room;
  private localSessionId = "";

  // ── Input ──
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private lastInputTime = 0;

  // ── Entity maps ──
  private karts = new Map<string, KartEntity>();
  private projectiles = new Map<string, ProjectileEntity>();
  private bombs = new Map<string, BombEntity>();
  private crates = new Map<string, CrateEntity>();

  // ── Layers ──
  private layerPickups!: Phaser.GameObjects.Layer;
  private layerEntities!: Phaser.GameObjects.Layer;
  private layerVFX!: Phaser.GameObjects.Layer;
  private layerParticles!: Phaser.GameObjects.Layer;
  private miniCam?: Phaser.Cameras.Scene2D.Camera;
  private miniFrame?: Phaser.GameObjects.Graphics;
  private audioSettings = readAudioSettings();
  private matchMusic?: Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound;

  constructor() {
    super("Game");
  }

  /* ──────────────── CREATE ──────────────── */

  create(): void {
    // Retrieve room from registry (set by PhaserGame component)
    this.room = this.registry.get("room") as Room;
    this.localSessionId = this.room.sessionId;

    // Void border behind tilemap
    this.add
      .rectangle(
        DISPLAY.WORLD_W / 2,
        DISPLAY.WORLD_H / 2,
        DISPLAY.WORLD_W + 640,
        DISPLAY.WORLD_H + 400,
        0x060608,
      )
      .setDepth(-1);

    // Layers
    this.layerPickups = this.add.layer().setDepth(1);
    this.layerEntities = this.add.layer().setDepth(2);
    this.layerVFX = this.add.layer().setDepth(3);
    this.layerParticles = this.add.layer().setDepth(4);

    // Build arena
    this.buildTilemap();

    // Mini-map camera (bottom-left overlay)
    const miniSize = DISPLAY.MINIMAP_SIZE;
    const miniMargin = DISPLAY.MINIMAP_MARGIN;
    this.miniCam = this.cameras.add(
      miniMargin,
      DISPLAY.HEIGHT - miniSize - miniMargin,
      miniSize,
      miniSize,
    );
    this.miniCam.setZoom(DISPLAY.MINIMAP_ZOOM);
    this.miniCam.setBackgroundColor(0x05060b);
    this.miniCam.roundPixels = true;

    // Frame overlay (UI space, not rendered by mini camera)
    this.miniFrame = this.add.graphics();
    this.miniFrame.setScrollFactor(0);
    this.miniFrame.lineStyle(2, 0x00e0ff, 0.8);
    this.miniFrame.fillStyle(0x0b0e16, 0.6);
    this.miniFrame.fillRoundedRect(
      miniMargin - 4,
      DISPLAY.HEIGHT - miniSize - miniMargin - 4,
      miniSize + 8,
      miniSize + 8,
      10,
    );
    this.miniFrame.strokeRoundedRect(
      miniMargin - 4,
      DISPLAY.HEIGHT - miniSize - miniMargin - 4,
      miniSize + 8,
      miniSize + 8,
      10,
    );
    // Don't draw the frame into the mini camera itself
    this.miniCam.ignore(this.miniFrame);

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as any;

    // Mouse/touch attack
    this.input.on("pointerdown", this.handlePointerDown, this);
    this.input.on("pointerup", this.handlePointerUp, this);

    // Camera
    this.cameras.main.setZoom(DISPLAY.CAMERA_ZOOM);
    this.cameras.main.setBounds(0, 0, DISPLAY.WORLD_W, DISPLAY.WORLD_H);
    this.cameras.main.roundPixels = false;

    this.setupAudio();

    // ── Bind schema listeners ──
    this.bindStateListeners();
    this.bindMessageListeners();

    EventBus.emit("scene-ready", "Game");
  }

  /* ──────────────── TILEMAP ──────────────── */

  private buildTilemap(): void {
    const map = this.make.tilemap({
      tileWidth: DISPLAY.TILE_SIZE,
      tileHeight: DISPLAY.TILE_SIZE,
      width: DISPLAY.TILES_W,
      height: DISPLAY.TILES_H,
    });

    const tileset = map.addTilesetImage(TEX_TILESET, TEX_TILESET, 16, 16);
    const floor = map.createBlankLayer("floor", tileset!)!;

    // ── 1. High-contrast arena plate + elemental quadrants ──
    const bg = this.add.graphics();
    bg.setDepth(-1);

    // Base void
    bg.fillStyle(0x05060b, 1);
    bg.fillRect(0, 0, 1600, 1200);

    // Main arena slab
    const arenaMargin = 80;
    const arenaX = arenaMargin;
    const arenaY = arenaMargin;
    const arenaW = DISPLAY.WORLD_W - arenaMargin * 2;
    const arenaH = DISPLAY.WORLD_H - arenaMargin * 2;

    bg.fillStyle(0x111320, 1);
    bg.fillRoundedRect(arenaX, arenaY, arenaW, arenaH, 32);

    // Inner racing lane ring
    const laneInset = 160;
    const laneX = arenaX + laneInset;
    const laneY = arenaY + laneInset;
    const laneW = arenaW - laneInset * 2;
    const laneH = arenaH - laneInset * 2;

    bg.lineStyle(32, 0x252b45, 1);
    bg.strokeRoundedRect(laneX, laneY, laneW, laneH, 24);

    // Elemental corners (purely visual, no gameplay changes)
    const cornerSize = 140; // Smaller size for smaller map
    const cornerRadius = 16;  // Tighter radius

    // Fire (top-left)
    bg.fillGradientStyle(0x3b1510, 0x7b1c10, 0xff7a2a, 0xffc857, 1);
    bg.fillRoundedRect(
      arenaX + 12,
      arenaY + 12,
      cornerSize,
      cornerSize,
      cornerRadius,
    );

    // Water (top-right)
    bg.fillGradientStyle(0x061827, 0x0f3b64, 0x19b5ff, 0x9ef9ff, 1);
    bg.fillRoundedRect(
      arenaX + arenaW - cornerSize - 12,
      arenaY + 12,
      cornerSize,
      cornerSize,
      cornerRadius,
    );

    // Nature (bottom-left)
    bg.fillGradientStyle(0x071b17, 0x194734, 0x1fbf70, 0xb8ffda, 1);
    bg.fillRoundedRect(
      arenaX + 12,
      arenaY + arenaH - cornerSize - 12,
      cornerSize,
      cornerSize,
      cornerRadius,
    );

    // Electric (bottom-right)
    bg.fillGradientStyle(0x111420, 0x262f55, 0x3b6dff, 0x9ad2ff, 1);
    bg.fillRoundedRect(
      arenaX + arenaW - cornerSize - 12,
      arenaY + arenaH - cornerSize - 12,
      cornerSize,
      cornerSize,
      cornerRadius,
    );

    // Center hazard pad
    const centerW = 200; // Scaled down from 360
    const centerH = 160; // Scaled down from 260
    const centerX = 1600 / 2 - centerW / 2;
    const centerY = 1200 / 2 - centerH / 2;

    bg.fillStyle(0x1a1015, 1);
    bg.fillRoundedRect(centerX, centerY, centerW, centerH, 18);
    bg.lineStyle(4, 0xff4b6b, 0.9);
    bg.strokeRoundedRect(centerX + 12, centerY + 12, centerW - 24, centerH - 24, 14);

    // Diagonal hazard stripes inside the pad
    bg.lineStyle(6, 0xffb800, 0.5);
    for (let i = -40; i <= centerW + centerH; i += 40) {
      bg.beginPath();
      bg.moveTo(centerX + i, centerY);
      bg.lineTo(centerX, centerY + i);
      bg.strokePath();
    }

    // ── 2. Texture pass using tiles ──
    const cx = DISPLAY.WORLD_W / 2;
    const cy = DISPLAY.WORLD_H / 2;
    const lavaRadius = Math.min(centerW, centerH) * 0.55;

    for (let ty = 0; ty < DISPLAY.TILES_H; ty++) {
      for (let tx = 0; tx < DISPLAY.TILES_W; tx++) {
        const wx = tx * DISPLAY.TILE_SIZE + DISPLAY.TILE_SIZE / 2;
        const wy = ty * DISPLAY.TILE_SIZE + DISPLAY.TILE_SIZE / 2;

        const distCenter = Phaser.Math.Distance.Between(wx, wy, cx, cy);

        // Lava / scorched tiles in the central hazard pad
        if (distCenter < lavaRadius) {
          const hash = (tx * 91 + ty * 37) % 100;
          floor.putTileAt(hash < 65 ? 2 : 1, tx, ty);
          continue;
        }

        // Clean racing lane, with light cracks at the edges
        const inLaneX =
          wx > laneX + DISPLAY.TILE_SIZE &&
          wx < laneX + laneW - DISPLAY.TILE_SIZE;
        const inLaneY =
          wy > laneY + DISPLAY.TILE_SIZE &&
          wy < laneY + laneH - DISPLAY.TILE_SIZE;

        if (inLaneX && inLaneY) {
          const edgePadding = 64;
          const nearEdge =
            wx - laneX < edgePadding ||
            laneX + laneW - wx < edgePadding ||
            wy - laneY < edgePadding ||
            laneY + laneH - wy < edgePadding;

          if (nearEdge && (tx * 73 + ty * 137) % 100 > 80) {
            floor.putTileAt(1, tx, ty); // subtle cracks near lane barrier
          } else if ((tx * 19 + ty * 97) % 120 === 0) {
            floor.putTileAt(0, tx, ty); // occasional flat variation
          }
          continue;
        }

        // Outer arena gets more cracked / scorched wear
        const hashOuter = (tx * 73 + ty * 137) % 100;
        if (hashOuter > 88) {
          floor.putTileAt(1, tx, ty);
        } else if (hashOuter < 6) {
          floor.putTileAt(2, tx, ty);
        }
      }
    }

    // ── 3. Wall drop shadows (static on floor) ──
    const graphics = this.add.graphics();
    graphics.setDepth(-0.5);

    for (const wall of WALLS) {
      // Dark drop shadow, pushed slightly downward to fake overhead light
      graphics.fillStyle(0x000000, 0.4);
      graphics.fillRect(wall.x + 12, wall.y + 22, wall.w, wall.h);
    }

    // ── 4. Extruded walls (2.5D) ──
    for (const wall of WALLS) {
      const wallGraphic = this.add.graphics({ x: wall.x, y: wall.y });
      wallGraphic.setDepth(wall.y + wall.h); // Y-sort with entities

      // Top face
      wallGraphic.fillStyle(0x1e243b, 1);
      wallGraphic.fillRect(0, -WALL_Z, wall.w, wall.h);
      wallGraphic.lineStyle(2, 0x3a4d6b, 0.9);
      wallGraphic.strokeRect(0, -WALL_Z, wall.w, wall.h);

      // Front face
      wallGraphic.fillStyle(0x111424, 1);
      wallGraphic.fillRect(0, wall.h - WALL_Z, wall.w, WALL_Z);

      this.layerEntities.add(wallGraphic);
    }

    // ── 5. Crate Pads ──
    for (const crate of CRATE_POSITIONS) {
      const tx = Math.floor(crate.x / 16);
      const ty = Math.floor(crate.y / 16);
      floor.putTileAt(6, tx, ty);
      floor.putTileAt(6, tx + 1, ty);
      floor.putTileAt(6, tx, ty + 1);
      floor.putTileAt(6, tx + 1, ty + 1);

      // Add a tech outline to the crate pads
      graphics.lineStyle(1, 0x00ffcc, 0.3);
      graphics.strokeRect(crate.x - 2, crate.y - 2, 36, 36);
    }

    floor.setDepth(0);
  }

  /* ──────────────── STATE LISTENERS ──────────────── */

  private bindStateListeners(): void {
    const state = this.room.state as any;
    const $ = getStateCallbacks<any>(this.room as any);

    if (!$) {
      console.error("[Game] Schema callbacks are unavailable for room state");
      return;
    }

    // ── Players ──
    $(state).players.onAdd((player: any, sessionId: string) => {
      this.createKart(sessionId, player);

      $(player).onChange(() => {
        this.updateKart(sessionId, player);
      });
    });

    $(state).players.onRemove((_player: any, sessionId: string) => {
      this.destroyKart(sessionId);
    });

    // ── Projectiles ──
    $(state).projectiles.onAdd((proj: any, id: string) => {
      this.createProjectile(id, proj);

      $(proj).onChange(() => {
        this.updateProjectile(id, proj);
      });
    });

    $(state).projectiles.onRemove((_proj: any, id: string) => {
      this.destroyProjectile(id);
    });

    // ── Bombs ──
    $(state).bombs.onAdd((bomb: any, id: string) => {
      this.createBomb(id, bomb);

      $(bomb).onChange(() => {
        this.updateBomb(id, bomb);
      });
    });

    $(state).bombs.onRemove((_bomb: any, id: string) => {
      this.destroyBomb(id);
    });

    // ── Crates ──
    $(state).crates.onAdd((crate: any, id: string) => {
      this.createCrate(id, crate);

      $(crate).onChange(() => {
        this.updateCrate(id, crate);
      });
    });

    $(state).crates.onRemove((_crate: any, id: string) => {
      this.destroyCrate(id);
    });

    // ── Phase ──
    $(state).listen("phase", (newPhase: string) => {
      EventBus.emit("phase-changed", newPhase);
      if (newPhase === "finished") {
        this.time.delayedCall(3000, () => {
          this.scene.start("GameOver");
        });
      }
    });
  }

  /* ──────────────── MESSAGE LISTENERS (VFX) ──────────────── */

  private bindMessageListeners(): void {
    // Kill event → death animation
    this.room.onMessage(
      "kill_event",
      (data: { victimId: string; killerId: string; x: number; y: number }) => {
        const kart = this.karts.get(data.victimId);
        if (kart) {
          const state = this.room.state as any;
          const player = state.players.get(data.victimId);
          const colorIdx = player?.colorIndex ?? 0;
          const color = COLORS[colorIdx] as KartColor;

          // Play death spin anim
          const deathSprite = this.add.sprite(
            data.x,
            data.y,
            `death_spin_${color}`,
          );
          this.layerVFX.add(deathSprite);
          deathSprite.play(animDeath(color));
          deathSprite.once("animationcomplete", () => deathSprite.destroy());
        }

        // Screen shake if victim is local player
        if (data.victimId === this.localSessionId) {
          this.cameras.main.shake(300, 0.01);
        }

        if (
          data.killerId === this.localSessionId ||
          data.victimId === this.localSessionId
        ) {
          this.playSfx(AUDIO_KEYS.SFX_KILL, 0.95);
        }

        EventBus.emit("kill-feed", data);
      },
    );

    // Explosion event → explosion anim + smoke
    this.room.onMessage(
      "explosion_event",
      (data: { x: number; y: number; type: string; radius: number }) => {
        const animKey =
          data.type === "bomb" ? ANIM_EXPLOSION_BOMB : ANIM_EXPLOSION_ROCKET;
        const texKey =
          data.type === "bomb" ? "explosion_bomb" : "explosion_rocket";

        const expl = this.add.sprite(data.x, data.y, texKey);
        this.layerVFX.add(expl);
        expl.play(animKey);
        expl.once("animationcomplete", () => expl.destroy());

        // Smoke particles
        this.spawnExplosionSmoke(data.x, data.y);

        // Screen shake based on distance to local player
        const localKart = this.karts.get(this.localSessionId);
        if (localKart) {
          const dist = Phaser.Math.Distance.Between(
            localKart.sprite.x,
            localKart.sprite.y,
            data.x,
            data.y,
          );
          if (dist < 300) {
            const intensity = Math.max(0.003, 0.012 * (1 - dist / 300));
            this.cameras.main.shake(200, intensity);
          }
        }

        this.playSfx(
          AUDIO_KEYS.SFX_EXPLOSION,
          this.distanceVolume(data.x, data.y, 900, 0.2),
        );
      },
    );

    // Hit event → impact anim + sparks
    this.room.onMessage(
      "hit_event",
      (data: {
        victimId: string;
        x: number;
        y: number;
        weaponType: string;
        damage: number;
      }) => {
        // Impact animation
        const isGround = data.weaponType === "bomb";
        const animKey = isGround ? ANIM_IMPACT_GROUND : ANIM_IMPACT_BULLET;
        const texKey = isGround ? "impact_ground" : "impact_bullet";

        const impact = this.add.sprite(data.x, data.y, texKey);
        this.layerVFX.add(impact);
        impact.play(animKey);
        impact.once("animationcomplete", () => impact.destroy());

        // Spark particles
        this.spawnSparkBurst(data.x, data.y);

        // Damage flash if victim is local player
        if (data.victimId === this.localSessionId) {
          this.showDamageFlash();
          this.cameras.main.shake(100, 0.003);
          this.playSfx(AUDIO_KEYS.SFX_HIT, 1);
        } else {
          this.playSfx(
            AUDIO_KEYS.SFX_HIT,
            this.distanceVolume(data.x, data.y, 700, 0.1),
          );
        }

        // Mark the kart as "firing" briefly for the attacker
        // (attacker's sprite will show firing_X for FIRING_DISPLAY_MS)
      },
    );

    // Respawn event → respawn anim
    this.room.onMessage(
      "respawn_event",
      (data: { playerId: string; x: number; y: number }) => {
        const state = this.room.state as any;
        const player = state.players.get(data.playerId);
        const colorIdx = player?.colorIndex ?? 0;
        const color = COLORS[colorIdx] as KartColor;

        const respSprite = this.add.sprite(
          data.x,
          data.y,
          `respawn_appear_${color}`,
        );
        this.layerVFX.add(respSprite);
        respSprite.play(animRespawn(color));
        respSprite.once("animationcomplete", () => respSprite.destroy());

        if (data.playerId === this.localSessionId) {
          this.playSfx(AUDIO_KEYS.SFX_RESPAWN, 0.8);
        }
      },
    );

    // Crate pickup
    this.room.onMessage(
      "crate_pickup",
      (data: { crateId: string; playerId: string; weaponType: string }) => {
        if (data.playerId === this.localSessionId) {
          this.playSfx(AUDIO_KEYS.SFX_PICKUP, 0.8);
        }
        EventBus.emit("weapon-pickup", data);
      },
    );

    // Attack event — mark kart as "firing" for visual state
    this.room.onMessage(
      "attack_event",
      (data: { attackerId: string; weaponType: string }) => {
        if (data.attackerId === this.localSessionId) {
          this.playSfx(AUDIO_KEYS.SFX_ATTACK, 0.7);
        }

        const kart = this.karts.get(data.attackerId);
        if (kart) {
          kart.firingUntil = this.time.now + DISPLAY.FIRING_DISPLAY_MS;
        }
      },
    );

    // Match start includes authoritative spawn teleports.
    // Snap sprites immediately instead of interpolating from old lobby positions.
    this.room.onMessage("game_started", (data: GameStartedMessage) => {
      for (const spawn of data.spawns ?? []) {
        const entity = this.karts.get(spawn.playerId);
        if (!entity) continue;

        entity.targetX = spawn.x;
        entity.targetY = spawn.y;
        entity.sprite.setPosition(spawn.x, spawn.y);
        entity.sprite.setFrame(angleToFrame(spawn.angle));

        if (spawn.playerId === this.localSessionId) {
          this.cameras.main.centerOn(spawn.x, spawn.y);
        }
      }
    });

    // Game finished
    this.room.onMessage("game_finished", (data: any) => {
      EventBus.emit("game-finished", data);
    });

    // Countdown
    this.room.onMessage("countdown_start", (data: any) => {
      this.playSfx(AUDIO_KEYS.SFX_COUNTDOWN, 0.9);
      EventBus.emit("countdown-start", data);
    });
  }

  private setupAudio(): void {
    if (!isAudioEnabled()) return;

    this.audioSettings = readAudioSettings();
    this.applyAudioSettings();

    EventBus.on("audio-mute-changed", this.handleAudioMuteChanged, this);

    if (!this.cache.audio.exists(AUDIO_KEYS.MUSIC_MATCH)) return;

    const existing = this.sound.get(AUDIO_KEYS.MUSIC_MATCH) as
      | Phaser.Sound.WebAudioSound
      | Phaser.Sound.HTML5AudioSound
      | null;

    this.matchMusic =
      existing ||
      (this.sound.add(AUDIO_KEYS.MUSIC_MATCH, {
        loop: true,
      }) as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound);

    if (this.sound.locked) {
      this.sound.once(Phaser.Sound.Events.UNLOCKED, () => {
        this.startMatchMusic();
      });
    } else {
      this.startMatchMusic();
    }
  }

  private startMatchMusic(): void {
    if (!this.matchMusic) return;

    this.matchMusic.setVolume(this.audioSettings.musicVolume);
    this.matchMusic.setMute(this.audioSettings.muted);

    if (!this.matchMusic.isPlaying) {
      this.matchMusic.play();
    }
  }

  private applyAudioSettings(): void {
    this.sound.setMute(this.audioSettings.muted);
    this.sound.setVolume(this.audioSettings.masterVolume);
    if (this.matchMusic) {
      this.matchMusic.setVolume(this.audioSettings.musicVolume);
    }
  }

  private handleAudioMuteChanged(muted: boolean): void {
    this.audioSettings = writeAudioSettings({ muted });
    this.applyAudioSettings();
  }

  private playSfx(key: string, volume = 1): void {
    if (!isAudioEnabled()) return;
    if (this.audioSettings.muted) return;
    if (!this.cache.audio.exists(key)) return;

    const outputVolume = Phaser.Math.Clamp(
      volume * this.audioSettings.sfxVolume,
      0,
      1,
    );

    this.sound.play(key, { volume: outputVolume });
  }

  private distanceVolume(
    x: number,
    y: number,
    maxDistance: number,
    floorVolume = 0.05,
  ): number {
    const localKart = this.karts.get(this.localSessionId);
    if (!localKart) return floorVolume;

    const distance = Phaser.Math.Distance.Between(
      localKart.sprite.x,
      localKart.sprite.y,
      x,
      y,
    );

    const normalized = Phaser.Math.Clamp(1 - distance / maxDistance, 0, 1);
    return Phaser.Math.Linear(floorVolume, 1, normalized);
  }

  /* ──────────────── KART MANAGEMENT ──────────────── */

  private createKart(sessionId: string, player: any): void {
    const color = COLORS[player.colorIndex] as KartColor;
    const texKey = kartKey(color, "idle");
    const sprite = this.add.sprite(player.x, player.y, texKey, 0);
    sprite.setDepth(sprite.y);
    this.layerEntities.add(sprite);

    // Exhaust emitter
    let exhaust: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
    if (this.textures.exists(TEX_PARTICLE_EXHAUST)) {
      exhaust = this.add.particles(0, 0, TEX_PARTICLE_EXHAUST, {
        follow: sprite,
        followOffset: { x: -20, y: 0 },
        lifespan: 300,
        speed: { min: 10, max: 30 },
        scale: { start: 1, end: 0.5 },
        alpha: { start: 0.8, end: 0 },
        frequency: 80,
      });
      this.layerParticles.add(exhaust);
    }

    this.karts.set(sessionId, {
      sprite,
      exhaust,
      firingUntil: 0,
      targetX: player.x,
      targetY: player.y,
    });

    // Camera follow for local player
    if (sessionId === this.localSessionId) {
      this.cameras.main.startFollow(
        sprite,
        true,
        DISPLAY.CAMERA_LERP,
        DISPLAY.CAMERA_LERP,
      );
      this.cameras.main.setDeadzone(
        DISPLAY.CAMERA_DEADZONE_W,
        DISPLAY.CAMERA_DEADZONE_H,
      );
      // Mini-map follows local kart too
      this.miniCam?.startFollow(sprite, true, 0.2, 0.2);
    }
  }

  private updateKart(sessionId: string, player: any): void {
    const entity = this.karts.get(sessionId);
    if (!entity) return;

    // Save authoritative target. Interpolation runs each render frame in update().
    entity.targetX = player.x;
    entity.targetY = player.y;

    // Snap when the correction is large (spawn teleport / reconciliation)
    // to avoid long catch-up drift and camera mismatch.
    const isLocal = sessionId === this.localSessionId;
    const dx = player.x - entity.sprite.x;
    const dy = player.y - entity.sprite.y;
    const distSq = dx * dx + dy * dy;
    const snapThresholdSq = isLocal ? 260 * 260 : 320 * 320;

    if (distSq > snapThresholdSq) {
      entity.sprite.setPosition(player.x, player.y);
    }

    entity.sprite.setDepth(entity.sprite.y);

    // Determine visual state
    const isFiring = entity.firingUntil > this.time.now;
    const state = getKartState(player, isFiring);
    const color = COLORS[player.colorIndex] as KartColor;
    const texKey = kartKey(color, state);
    const frame = angleToFrame(player.angle);

    entity.sprite.setTexture(texKey, frame);

    // Hide sprite when dead (death anim handles the visual)
    entity.sprite.setVisible(player.isAlive);
    if (entity.exhaust) {
      entity.exhaust.setVisible(player.isAlive);
    }
  }

  private destroyKart(sessionId: string): void {
    const entity = this.karts.get(sessionId);
    if (!entity) return;
    entity.sprite.destroy();
    entity.exhaust?.destroy();
    this.karts.delete(sessionId);
  }

  /* ──────────────── PROJECTILE MANAGEMENT ──────────────── */

  private createProjectile(id: string, proj: any): void {
    const texKey = proj.type === "rocket" ? TEX_PROJ_ROCKET : TEX_PROJ_BULLET;
    const frame = angleToFrame(proj.angle);
    const sprite = this.add.sprite(proj.x, proj.y, texKey, frame);
    sprite.setDepth(sprite.y);
    this.layerEntities.add(sprite);
    this.projectiles.set(id, { sprite });
  }

  private updateProjectile(id: string, proj: any): void {
    const entity = this.projectiles.get(id);
    if (!entity) return;
    interpolatePosition(entity.sprite, proj.x, proj.y, false);
    entity.sprite.setFrame(angleToFrame(proj.angle));
    entity.sprite.setDepth(entity.sprite.y);
  }

  private destroyProjectile(id: string): void {
    const entity = this.projectiles.get(id);
    if (!entity) return;
    entity.sprite.destroy();
    this.projectiles.delete(id);
  }

  /* ──────────────── BOMB MANAGEMENT ──────────────── */

  private createBomb(id: string, bomb: any): void {
    const sprite = this.add.sprite(bomb.x, bomb.y, TEX_PROJ_BOMB, 0);
    sprite.setDepth(sprite.y);
    this.layerEntities.add(sprite);
    if (this.anims.exists(ANIM_BOMB_SPIN)) {
      sprite.play(ANIM_BOMB_SPIN);
    }
    this.bombs.set(id, { sprite });
  }

  private updateBomb(id: string, bomb: any): void {
    const entity = this.bombs.get(id);
    if (!entity) return;
    entity.sprite.setDepth(entity.sprite.y);
    // Bombs don't move, but handle detonation visual
    if (bomb.isDetonated) {
      entity.sprite.setVisible(false);
    }
  }

  private destroyBomb(id: string): void {
    const entity = this.bombs.get(id);
    if (!entity) return;
    entity.sprite.destroy();
    this.bombs.delete(id);
  }

  /* ──────────────── CRATE MANAGEMENT ──────────────── */

  private createCrate(id: string, crate: any): void {
    // Glow pulse underneath
    const glow = this.add.sprite(crate.x, crate.y, TEX_PICKUP_GLOW, 0);
    if (this.anims.exists(ANIM_PICKUP_GLOW)) {
      glow.play(ANIM_PICKUP_GLOW);
    }
    glow.setScale(1.2);
    glow.setAlpha(0.6);
    glow.setBlendMode(Phaser.BlendModes.ADD);
    this.layerPickups.add(glow);

    // Crate base
    const base = this.add.sprite(crate.x, crate.y + 2, TEX_PICKUP_CRATE);
    this.layerPickups.add(base);

    // Weapon icon (pick a default, will be unknown until revealed)
    const icon = this.add.sprite(crate.x, crate.y - 6, TEX_PICKUP_ROCKET);
    icon.setScale(0.35);
    icon.setAlpha(0.95);
    this.layerPickups.add(icon);

    const depth = crate.y;
    glow.setDepth(depth - 1);
    base.setDepth(depth);
    icon.setDepth(depth + 1);

    const bobTween = this.tweens.add({
      targets: icon,
      y: icon.y - 4,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });

    const visible = crate.isAvailable;
    glow.setVisible(visible);
    icon.setVisible(visible);
    base.setVisible(visible);

    this.crates.set(id, { icon, glow, base, bobTween });
  }

  private updateCrate(id: string, crate: any): void {
    const entity = this.crates.get(id);
    if (!entity) return;

    const depth = crate.y;
    entity.glow.setDepth(depth - 1);
    entity.base.setDepth(depth);
    entity.icon.setDepth(depth + 1);

    entity.icon.setVisible(crate.isAvailable);
    entity.glow.setVisible(crate.isAvailable);
    entity.base.setVisible(crate.isAvailable);

    // Update icon based on revealed weapon type (if any)
    if (crate.weaponType === "rocket") {
      entity.icon.setTexture(TEX_PICKUP_ROCKET);
      entity.icon.setTint(0xff8a7a);
    } else if (crate.weaponType === "bomb") {
      entity.icon.setTexture(TEX_PICKUP_BOMB);
      entity.icon.setTint(0xf5d76e);
    } else if (crate.weaponType === "bullet") {
      entity.icon.setTexture(TEX_PICKUP_BULLET);
      entity.icon.setTint(0x7dd3fc);
    } else {
      entity.icon.setTint(0xf4e9d8);
    }
  }

  private destroyCrate(id: string): void {
    const entity = this.crates.get(id);
    if (!entity) return;
    entity.bobTween?.stop();
    entity.icon.destroy();
    entity.glow.destroy();
    entity.base.destroy();
    this.crates.delete(id);
  }

  /* ──────────────── SCREEN EFFECTS ──────────────── */

  private showDamageFlash(): void {
    if (!this.textures.exists(TEX_DAMAGE_FLASH)) return;

    const flash = this.add
      .image(DISPLAY.WIDTH / 2, DISPLAY.HEIGHT / 2, TEX_DAMAGE_FLASH)
      .setScrollFactor(0)
      .setDepth(100)
      .setAlpha(0.6);
    flash.setDisplaySize(DISPLAY.WIDTH, DISPLAY.HEIGHT);

    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 400,
      onComplete: () => flash.destroy(),
    });
  }

  /* ──────────────── PARTICLE HELPERS ──────────────── */

  private spawnExplosionSmoke(x: number, y: number): void {
    if (!this.textures.exists(TEX_PARTICLE_SMOKE)) return;

    const emitter = this.add.particles(x, y, TEX_PARTICLE_SMOKE, {
      lifespan: 800,
      speed: { min: 20, max: 60 },
      scale: { start: 1.5, end: 0.3 },
      alpha: { start: 0.7, end: 0 },
      quantity: 8,
      frequency: -1,
    });
    this.layerParticles.add(emitter);
    emitter.explode(8);
    this.time.delayedCall(1000, () => emitter.destroy());
  }

  private spawnSparkBurst(x: number, y: number): void {
    if (!this.textures.exists(TEX_PARTICLE_SPARK)) return;

    const emitter = this.add.particles(x, y, TEX_PARTICLE_SPARK, {
      lifespan: 400,
      speed: { min: 40, max: 100 },
      scale: { start: 1, end: 0.2 },
      alpha: { start: 1, end: 0 },
      quantity: 5,
      frequency: -1,
    });
    this.layerParticles.add(emitter);
    emitter.explode(5);
    this.time.delayedCall(500, () => emitter.destroy());
  }

  /* ──────────────── INPUT ──────────────── */

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const localKart = this.karts.get(this.localSessionId);
    if (!localKart) return;

    const angle = Phaser.Math.Angle.Between(
      localKart.sprite.x,
      localKart.sprite.y,
      worldPoint.x,
      worldPoint.y,
    );

    this.room.send("attack", { angle });
  }

  private handlePointerUp(_pointer: Phaser.Input.Pointer): void {
    this.room.send("stop_attack");
  }

  private interpolateKartsPerFrame(): void {
    this.karts.forEach((entity, sessionId) => {
      const isLocal = sessionId === this.localSessionId;
      interpolatePosition(entity.sprite, entity.targetX, entity.targetY, isLocal);
      entity.sprite.setDepth(entity.sprite.y);
    });
  }

  /* ──────────────── UPDATE ──────────────── */

  update(time: number, _delta: number): void {
    this.interpolateKartsPerFrame();

    // Throttled input
    if (time - this.lastInputTime >= DISPLAY.INPUT_THROTTLE_MS) {
      this.lastInputTime = time;
      this.sendInput();
    }

    // Dynamic zoom based on kart velocity (only for the local player)
    const localPlayer = this.room.state.players.get(this.localSessionId);
    if (localPlayer) {
      // Player speed magnitude using vx and vy
      const speed = Math.sqrt(
        localPlayer.vx * localPlayer.vx + localPlayer.vy * localPlayer.vy,
      );
      // Base zoom is 1.0, scales out to 0.7 at higher speed for a wider arena view
      const targetZoom = Phaser.Math.Clamp(1.0 - speed / 1800, 0.7, 1.0);

      // Smoothly interpolate current zoom to target zoom
      this.cameras.main.setZoom(
        Phaser.Math.Linear(this.cameras.main.zoom, targetZoom, 0.05),
      );
    }

    // Auto-pickup crates for local player
    this.checkCratePickup();

    // Emit HUD data
    this.emitHUDData();
  }

  private sendInput(): void {
    const forward = this.wasd.W.isDown || this.cursors.up.isDown;
    const backward = this.wasd.S.isDown || this.cursors.down.isDown;
    const left = this.wasd.A.isDown || this.cursors.left.isDown;
    const right = this.wasd.D.isDown || this.cursors.right.isDown;

    // Always send input state so the server can stop movement when keys are released
    this.room.send("input", { forward, backward, left, right });
  }

  private checkCratePickup(): void {
    const state = this.room.state as any;
    const localPlayer = state.players.get(this.localSessionId);
    if (!localPlayer || !localPlayer.isAlive) return;
    if (localPlayer.weaponType !== "none") return;

    state.crates.forEach((crate: any, crateId: string) => {
      if (!crate.isAvailable) return;

      const dist = Phaser.Math.Distance.Between(
        localPlayer.x,
        localPlayer.y,
        crate.x,
        crate.y,
      );
      if (dist <= DISPLAY.PICKUP_RANGE) {
        this.room.send("pickup_crate", { crateId });
      }
    });
  }

  private emitHUDData(): void {
    const state = this.room.state as any;
    const localPlayer = state.players.get(this.localSessionId);
    if (!localPlayer) return;

    EventBus.emit("hud-update", {
      hp: localPlayer.hp,
      kills: localPlayer.kills,
      deaths: localPlayer.deaths,
      weaponType: localPlayer.weaponType,
      weaponExpiresAt: localPlayer.weaponExpiresAt,
      remainingSeconds: state.remainingSeconds,
      isAlive: localPlayer.isAlive,
    });
  }

  /* ──────────────── CLEANUP ──────────────── */

  shutdown(): void {
    this.input.off("pointerdown", this.handlePointerDown, this);
    this.input.off("pointerup", this.handlePointerUp, this);
    EventBus.off("audio-mute-changed", this.handleAudioMuteChanged, this);

    if (this.matchMusic?.isPlaying) {
      this.matchMusic.stop();
    }

    // Destroy all tracked entities
    this.karts.forEach((e) => {
      e.sprite.destroy();
      e.exhaust?.destroy();
    });
    this.karts.clear();

    this.projectiles.forEach((e) => e.sprite.destroy());
    this.projectiles.clear();

    this.bombs.forEach((e) => e.sprite.destroy());
    this.bombs.clear();

    this.crates.forEach((e) => {
      e.icon.destroy();
      e.glow.destroy();
    });
    this.crates.clear();

    if (this.miniCam) {
      this.cameras.remove(this.miniCam, true);
      this.miniCam = undefined;
    }
    this.miniFrame?.destroy();
    this.miniFrame = undefined;
  }
}
