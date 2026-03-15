/**
 * All texture and animation key constants used by Phaser.
 * Centralised to avoid magic strings and enable autocomplete.
 */

export const COLORS = ["yellow", "red", "purple", "black"] as const;

export const KART_STATES = [
  "idle",
  "boost",
  "damaged",
  "dead",
  "holding_rocket",
  "holding_bomb",
  "holding_bullet",
  "firing_rocket",
  "firing_bullet",
  "firing_bomb",
] as const;

export type KartColor = (typeof COLORS)[number];
export type KartState = (typeof KART_STATES)[number];

/** Build a kart spritesheet key like "kart_yellow_idle" */
export function kartKey(color: KartColor, state: KartState): string {
  return `kart_${color}_${state}`;
}

/* ── Projectile texture keys ── */
export const TEX_PROJ_ROCKET = "projectile_rocket";
export const TEX_PROJ_BOMB = "projectile_bomb";
export const TEX_PROJ_BULLET = "projectile_bullet";

/* ── VFX texture keys ── */
export const TEX_EXPLOSION_ROCKET = "explosion_rocket";
export const TEX_EXPLOSION_BOMB = "explosion_bomb";
export const TEX_IMPACT_BULLET = "impact_bullet";
export const TEX_IMPACT_GROUND = "impact_ground";
export const TEX_DAMAGE_FLASH = "damage_flash";

/* ── Pickup texture keys ── */
export const TEX_PICKUP_ROCKET = "pickup_rocket";
export const TEX_PICKUP_BOMB = "pickup_bomb";
export const TEX_PICKUP_BULLET = "pickup_bullet";
export const TEX_PICKUP_GLOW = "pickup_glow";
export const TEX_PICKUP_CRATE = "pickup_crate";

/* ── Particle texture keys ── */
export const TEX_PARTICLE_SMOKE = "particle_smoke";
export const TEX_PARTICLE_SPARK = "particle_spark";
export const TEX_PARTICLE_DUST = "particle_dust";
export const TEX_PARTICLE_EXHAUST = "particle_exhaust";

/* ── Tileset ── */
export const TEX_TILESET = "tileset_arena";

/* ── HUD ── */
export const TEX_HUD_HEALTH = "hud_health_bar";
export const TEX_HUD_WEAPON_SLOT = "hud_weapon_slot";
export const TEX_HUD_KILL_ICON = "hud_kill_icon";
export const TEX_HUD_DEATH_ICON = "hud_death_icon";
export const TEX_HUD_MINIMAP_KART = "hud_minimap_kart";
export const TEX_HUD_COUNTDOWN = "hud_countdown";
export const TEX_HUD_BET_BADGE = "hud_bet_badge";
export const TEX_HUD_MARKET_ICON = "hud_market_icon";

/* ── Title / Background ── */
export const TEX_TITLE_LOGO = "title_logo";
export const TEX_BG_FAR = "bg_far";
export const TEX_BG_MID = "bg_mid";

/* ── Animation keys ── */
export const ANIM_EXPLOSION_ROCKET = "anim_explosion_rocket";
export const ANIM_EXPLOSION_BOMB = "anim_explosion_bomb";
export const ANIM_IMPACT_BULLET = "anim_impact_bullet";
export const ANIM_IMPACT_GROUND = "anim_impact_ground";
export const ANIM_PICKUP_GLOW = "anim_pickup_glow";
export const ANIM_BOMB_SPIN = "anim_bomb_spin";
export const ANIM_SMOKE = "anim_smoke";
export const ANIM_SPARK = "anim_spark";
export const ANIM_DUST = "anim_dust";
export const ANIM_EXHAUST = "anim_exhaust";
export const ANIM_COUNTDOWN = "anim_countdown";

export function animDeath(color: KartColor): string {
  return `anim_death_${color}`;
}

export function animRespawn(color: KartColor): string {
  return `anim_respawn_${color}`;
}
