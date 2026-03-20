import Phaser from "phaser";
import {
  COLORS,
  KART_STATES,
  kartKey,
  TEX_PROJ_ROCKET,
  TEX_PROJ_BOMB,
  TEX_PROJ_BULLET,
  TEX_EXPLOSION_ROCKET,
  TEX_EXPLOSION_BOMB,
  TEX_IMPACT_BULLET,
  TEX_IMPACT_GROUND,
  TEX_DAMAGE_FLASH,
  TEX_PICKUP_ROCKET,
  TEX_PICKUP_BOMB,
  TEX_PICKUP_BULLET,
  TEX_PICKUP_GLOW,
  TEX_PICKUP_CRATE,
  TEX_PICKUP_SNIPER,
  TEX_PICKUP_MINE,
  TEX_PICKUP_SHOCKWAVE,
  TEX_SHOCKWAVE_RING,
  TEX_PARTICLE_SMOKE,
  TEX_PARTICLE_SPARK,
  TEX_PARTICLE_DUST,
  TEX_PARTICLE_EXHAUST,
  TEX_TILESET,
  TEX_HUD_HEALTH,
  TEX_HUD_WEAPON_SLOT,
  TEX_HUD_KILL_ICON,
  TEX_HUD_DEATH_ICON,
  TEX_HUD_MINIMAP_KART,
  TEX_HUD_COUNTDOWN,
  TEX_HUD_BET_BADGE,
  TEX_HUD_MARKET_ICON,
  TEX_TITLE_LOGO,
  TEX_BG_FAR,
  TEX_BG_MID,
  ANIM_EXPLOSION_ROCKET,
  ANIM_EXPLOSION_BOMB,
  ANIM_IMPACT_BULLET,
  ANIM_IMPACT_GROUND,
  ANIM_PICKUP_GLOW,
  ANIM_BOMB_SPIN,
  ANIM_SMOKE,
  ANIM_SPARK,
  ANIM_DUST,
  ANIM_EXHAUST,
  ANIM_COUNTDOWN,
  animDeath,
  animRespawn,
} from "../spriteKeys";
import { AUDIO_ASSETS, isAudioEnabled } from "../audio";

/**
 * Preloader scene — loads all sprite assets, creates animations,
 * then transitions to MainMenu.
 */
export class Preloader extends Phaser.Scene {
  constructor() {
    super("Preloader");
  }

  preload(): void {
    // ── Progress bar ──
    const barBg = this.add.rectangle(400, 225, 600, 20, 0x1e1e2a);
    const bar = this.add.rectangle(400 - 300, 225, 0, 16, 0xe5ff00);
    bar.setOrigin(0, 0.5);

    this.load.on("progress", (p: number) => {
      bar.width = 596 * p;
    });

    // ── Kart sheets (36-dir rotation, 96×96 cell, 9×4 grid = 864×384 px) ──
    for (const color of COLORS) {
      for (const state of KART_STATES) {
        const key = kartKey(color, state);
        this.load.spritesheet(key, `sprites/karts/${key}.png`, {
          frameWidth: 96,
          frameHeight: 96,
        });
      }
    }

    // ── Projectiles ──
    this.load.spritesheet(
      TEX_PROJ_ROCKET,
      "sprites/projectiles/projectile_rocket.png",
      {
        frameWidth: 32,
        frameHeight: 32,
      },
    );
    this.load.spritesheet(
      TEX_PROJ_BOMB,
      "sprites/projectiles/projectile_bomb.png",
      {
        frameWidth: 22,
        frameHeight: 22,
      },
    );
    this.load.spritesheet(
      TEX_PROJ_BULLET,
      "sprites/projectiles/projectile_bullet.png",
      {
        frameWidth: 16,
        frameHeight: 16,
      },
    );

    // ── VFX ──
    this.load.spritesheet(
      TEX_EXPLOSION_ROCKET,
      "sprites/vfx/explosion_rocket.png",
      {
        frameWidth: 64,
        frameHeight: 64,
      },
    );
    this.load.spritesheet(
      TEX_EXPLOSION_BOMB,
      "sprites/vfx/explosion_bomb.png",
      {
        frameWidth: 80,
        frameHeight: 80,
      },
    );
    this.load.spritesheet(TEX_IMPACT_BULLET, "sprites/vfx/impact_bullet.png", {
      frameWidth: 16,
      frameHeight: 16,
    });
    this.load.spritesheet(TEX_IMPACT_GROUND, "sprites/vfx/impact_ground.png", {
      frameWidth: 24,
      frameHeight: 24,
    });
    this.load.image(TEX_DAMAGE_FLASH, "sprites/vfx/damage_flash.png");

    // ── Death / Respawn ──
    for (const color of COLORS) {
      this.load.spritesheet(
        `death_spin_${color}`,
        `sprites/death_respawn/death_spin_${color}.png`,
        {
          frameWidth: 96,
          frameHeight: 96,
        },
      );
      this.load.spritesheet(
        `respawn_appear_${color}`,
        `sprites/death_respawn/respawn_appear_${color}.png`,
        {
          frameWidth: 96,
          frameHeight: 96,
        },
      );
    }

    // ── Pickups ──
    this.load.image(TEX_PICKUP_ROCKET, "sprites/pickups/pickup_rocket.png");
    this.load.image(TEX_PICKUP_BOMB, "sprites/pickups/pickup_bomb.png");
    this.load.image(TEX_PICKUP_BULLET, "sprites/pickups/pickup_bullet.png");
    this.load.spritesheet(
      TEX_PICKUP_GLOW,
      "sprites/pickups/pickup_glow_pulse.png",
      {
        frameWidth: 32,
        frameHeight: 32,
      },
    );

    // ── Particles ──
    this.load.spritesheet(
      TEX_PARTICLE_SMOKE,
      "sprites/particles/particle_smoke.png",
      {
        frameWidth: 8,
        frameHeight: 8,
      },
    );
    this.load.spritesheet(
      TEX_PARTICLE_SPARK,
      "sprites/particles/particle_spark.png",
      {
        frameWidth: 8,
        frameHeight: 8,
      },
    );
    this.load.spritesheet(
      TEX_PARTICLE_DUST,
      "sprites/particles/particle_dust.png",
      {
        frameWidth: 8,
        frameHeight: 8,
      },
    );
    this.load.spritesheet(
      TEX_PARTICLE_EXHAUST,
      "sprites/particles/particle_exhaust.png",
      {
        frameWidth: 8,
        frameHeight: 8,
      },
    );

    // ── Tileset ──
    this.load.spritesheet(TEX_TILESET, "sprites/tileset/tileset_arena.png", {
      frameWidth: 16,
      frameHeight: 16,
    });

    // ── HUD ──
    this.load.image(TEX_HUD_HEALTH, "sprites/hud/hud_health_bar.png");
    this.load.image(TEX_HUD_WEAPON_SLOT, "sprites/hud/hud_weapon_slot.png");
    this.load.image(TEX_HUD_KILL_ICON, "sprites/hud/hud_kill_icon.png");
    this.load.image(TEX_HUD_DEATH_ICON, "sprites/hud/hud_death_icon.png");
    this.load.spritesheet(
      TEX_HUD_MINIMAP_KART,
      "sprites/hud/hud_minimap_kart.png",
      {
        frameWidth: 6,
        frameHeight: 6,
      },
    );
    this.load.spritesheet(
      TEX_HUD_COUNTDOWN,
      "sprites/hud/hud_countdown_numbers.png",
      {
        frameWidth: 32,
        frameHeight: 48,
      },
    );
    this.load.image(TEX_HUD_BET_BADGE, "sprites/hud/hud_bet_badge.png");
    this.load.image(TEX_HUD_MARKET_ICON, "sprites/hud/hud_market_icon.png");

    // ── Title / Background ──
    this.load.image(TEX_TITLE_LOGO, "sprites/ui/title_logo.png");
    this.load.image(TEX_BG_FAR, "sprites/ui/background_arena_far.png");
    this.load.image(TEX_BG_MID, "sprites/ui/background_arena_mid.png");

    // ── Audio (optional; gated by VITE_ENABLE_AUDIO) ──
    if (isAudioEnabled()) {
      for (const asset of AUDIO_ASSETS) {
        this.load.audio(asset.key, asset.sources);
      }
    }
  }

  create(): void {
    this.createAnimations();
    this.createPickupCrateTexture();
    this.createSniperPickupTexture();
    this.createMinePickupTexture();
    this.createShockwavePickupTexture();
    this.createShockwaveRingTexture();
    this.scene.start("MainMenu");
  }

  /* ── Create all shared animations ── */
  private createAnimations(): void {
    // VFX
    this.anims.create({
      key: ANIM_EXPLOSION_ROCKET,
      frames: this.anims.generateFrameNumbers(TEX_EXPLOSION_ROCKET, {
        start: 0,
        end: 7,
      }),
      frameRate: 16,
      repeat: 0,
    });

    this.anims.create({
      key: ANIM_EXPLOSION_BOMB,
      frames: this.anims.generateFrameNumbers(TEX_EXPLOSION_BOMB, {
        start: 0,
        end: 9,
      }),
      frameRate: 14,
      repeat: 0,
    });

    this.anims.create({
      key: ANIM_IMPACT_BULLET,
      frames: this.anims.generateFrameNumbers(TEX_IMPACT_BULLET, {
        start: 0,
        end: 3,
      }),
      frameRate: 20,
      repeat: 0,
    });

    this.anims.create({
      key: ANIM_IMPACT_GROUND,
      frames: this.anims.generateFrameNumbers(TEX_IMPACT_GROUND, {
        start: 0,
        end: 3,
      }),
      frameRate: 12,
      repeat: 0,
    });

    // Pickups
    this.anims.create({
      key: ANIM_PICKUP_GLOW,
      frames: this.anims.generateFrameNumbers(TEX_PICKUP_GLOW, {
        start: 0,
        end: 3,
      }),
      frameRate: 4,
      repeat: -1,
      yoyo: true,
    });

    // Bomb projectile spin
    this.anims.create({
      key: ANIM_BOMB_SPIN,
      frames: this.anims.generateFrameNumbers(TEX_PROJ_BOMB, {
        start: 0,
        end: 3,
      }),
      frameRate: 8,
      repeat: -1,
    });

    // Particles
    this.anims.create({
      key: ANIM_SMOKE,
      frames: this.anims.generateFrameNumbers(TEX_PARTICLE_SMOKE, {
        start: 0,
        end: 5,
      }),
      frameRate: 10,
      repeat: 0,
    });

    this.anims.create({
      key: ANIM_SPARK,
      frames: this.anims.generateFrameNumbers(TEX_PARTICLE_SPARK, {
        start: 0,
        end: 3,
      }),
      frameRate: 14,
      repeat: 0,
    });

    this.anims.create({
      key: ANIM_DUST,
      frames: this.anims.generateFrameNumbers(TEX_PARTICLE_DUST, {
        start: 0,
        end: 3,
      }),
      frameRate: 8,
      repeat: 0,
    });

    this.anims.create({
      key: ANIM_EXHAUST,
      frames: this.anims.generateFrameNumbers(TEX_PARTICLE_EXHAUST, {
        start: 0,
        end: 2,
      }),
      frameRate: 12,
      repeat: -1,
    });

    // Countdown
    this.anims.create({
      key: ANIM_COUNTDOWN,
      frames: this.anims.generateFrameNumbers(TEX_HUD_COUNTDOWN, {
        start: 0,
        end: 3,
      }),
      frameRate: 1,
      repeat: 0,
    });

    // Death / Respawn per color
    for (const color of COLORS) {
      this.anims.create({
        key: animDeath(color),
        frames: this.anims.generateFrameNumbers(`death_spin_${color}`, {
          start: 0,
          end: 11,
        }),
        frameRate: 16,
        repeat: 0,
      });

      this.anims.create({
        key: animRespawn(color),
        frames: this.anims.generateFrameNumbers(`respawn_appear_${color}`, {
          start: 0,
          end: 7,
        }),
        frameRate: 10,
        repeat: 0,
      });
    }
  }

  private createPickupCrateTexture(): void {
    if (this.textures.exists(TEX_PICKUP_CRATE)) return;

    const size = 32;
    const g = this.make.graphics({ x: 0, y: 0 });

    // Base wood
    g.fillStyle(0x5d3b23, 1);
    g.fillRect(0, 0, size, size);
    g.fillStyle(0x7b4f2f, 1);
    g.fillRect(2, 2, size - 4, size - 4);

    // Inner panel
    g.fillStyle(0x8d5f3a, 1);
    g.fillRect(4, 6, size - 8, size - 12);

    // Metal straps
    g.fillStyle(0x4a525e, 1);
    g.fillRect(0, 14, size, 4);
    g.fillRect(14, 0, 4, size);
    g.lineStyle(1, 0x2c3138, 1);
    g.strokeRect(0.5, 14.5, size - 1, 3);
    g.strokeRect(14.5, 0.5, 3, size - 1);

    // Warning stripe
    g.fillStyle(0xd1a346, 1);
    g.fillRect(4, 4, size - 8, 4);
    g.fillStyle(0x2b2418, 1);
    for (let x = 4; x < size - 8; x += 4) {
      g.fillRect(x, 4, 2, 4);
    }

    // Bolts
    g.fillStyle(0xdedede, 1);
    const bolts = [
      [4, 4],
      [size - 6, 4],
      [4, size - 6],
      [size - 6, size - 6],
      [4, 18],
      [size - 6, 18],
    ];
    for (const [x, y] of bolts) {
      g.fillRect(x, y, 2, 2);
    }

    // Outer outline
    g.lineStyle(2, 0x2a1a10, 1);
    g.strokeRect(1, 1, size - 2, size - 2);

    g.generateTexture(TEX_PICKUP_CRATE, size, size);
    g.destroy();
  }

  private createSniperPickupTexture(): void {
    if (this.textures.exists(TEX_PICKUP_SNIPER)) return;
    const w = 32, h = 32;
    const g = this.make.graphics({ x: 0, y: 0 });

    // Rifle body — thin horizontal bar
    g.fillStyle(0xe8e8e8, 1);
    g.fillRect(2, 13, 28, 6);

    // Stock (left end, thicker)
    g.fillStyle(0xb8a080, 1);
    g.fillRect(2, 12, 8, 8);

    // Barrel (right end, thinner)
    g.fillStyle(0xcccccc, 1);
    g.fillRect(22, 14, 8, 4);

    // Scope circle (centre)
    g.lineStyle(2, 0x66ccff, 1);
    g.strokeCircle(15, 16, 5);

    // Scope crosshairs
    g.lineStyle(1, 0x66ccff, 0.8);
    g.lineBetween(15, 11, 15, 21);
    g.lineBetween(10, 16, 20, 16);

    // Trigger guard
    g.lineStyle(1, 0x999999, 1);
    g.strokeRect(10, 19, 5, 4);

    g.generateTexture(TEX_PICKUP_SNIPER, w, h);
    g.destroy();
  }

  private createMinePickupTexture(): void {
    if (this.textures.exists(TEX_PICKUP_MINE)) return;
    const size = 24;
    const g = this.make.graphics({ x: 0, y: 0 });
    const cx = 12, cy = 12, r = 8;

    // Body
    g.fillStyle(0xcc2222, 1);
    g.fillCircle(cx, cy, r);
    g.fillStyle(0xff4444, 1);
    g.fillCircle(cx - 2, cy - 2, 3); // highlight

    // Spikes (6 directions)
    g.lineStyle(2, 0xff6666, 1);
    const spikeLen = 4;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const sx = cx + Math.cos(a) * r;
      const sy = cy + Math.sin(a) * r;
      g.lineBetween(sx, sy, cx + Math.cos(a) * (r + spikeLen), cy + Math.sin(a) * (r + spikeLen));
    }

    // Outline
    g.lineStyle(1.5, 0x880000, 1);
    g.strokeCircle(cx, cy, r);

    g.generateTexture(TEX_PICKUP_MINE, size, size);
    g.destroy();
  }

  private createShockwavePickupTexture(): void {
    if (this.textures.exists(TEX_PICKUP_SHOCKWAVE)) return;
    const size = 28;
    const g = this.make.graphics({ x: 0, y: 0 });
    const cx = 14, cy = 14;

    // 3 concentric arcs (top half only, like a wifi / pulse symbol)
    const arcs = [
      { r: 4, alpha: 1.0 },
      { r: 8, alpha: 0.75 },
      { r: 12, alpha: 0.5 },
    ];
    for (const arc of arcs) {
      g.lineStyle(2, 0x44aaff, arc.alpha);
      // Draw arc from -135° to -45° (top arc, facing upward)
      g.beginPath();
      g.arc(cx, cy + 2, arc.r, Phaser.Math.DegToRad(-150), Phaser.Math.DegToRad(-30), false);
      g.strokePath();
    }

    // Center dot
    g.fillStyle(0x88ddff, 1);
    g.fillCircle(cx, cy + 2, 2);

    g.generateTexture(TEX_PICKUP_SHOCKWAVE, size, size);
    g.destroy();
  }

  private createShockwaveRingTexture(): void {
    if (this.textures.exists(TEX_SHOCKWAVE_RING)) return;
    const size = 256;
    const g = this.make.graphics({ x: 0, y: 0 });

    // Outer ring glow (wider, dimmer)
    g.lineStyle(6, 0x00eeff, 0.3);
    g.strokeCircle(128, 128, 120);

    // Main ring
    g.lineStyle(3, 0x00eeff, 1.0);
    g.strokeCircle(128, 128, 118);

    // Inner ring
    g.lineStyle(1.5, 0x88ffff, 0.6);
    g.strokeCircle(128, 128, 112);

    g.generateTexture(TEX_SHOCKWAVE_RING, size, size);
    g.destroy();
  }
}
