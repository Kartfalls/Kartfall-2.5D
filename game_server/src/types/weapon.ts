export type WeaponType = "none" | "rocket" | "bomb" | "bullet" | "sniper" | "mine" | "shockwave";

export const WEAPONS = {
  rocket: {
    damage: 100,
    speed: 980,
    range: 1800,
    ammo: 1,
    cooldown: 0,
    projectileRadius: 14,
    explosionRadius: 72,
    splashDamage: 60,
    lifetime: 1837, // range / speed * 1000
  },
  bomb: {
    damage: 100,
    splashDamage: 70,
    blastRadius: 200,
    fuseTime: 5000,
    ammo: 1,
    placementRange: 0,
  },
  bullet: {
    damage: 20,
    speed: 920,
    range: 920,
    ammo: 46,
    fireInterval: 130,
    projectileRadius: 8,
    lifetime: 1000, // range / speed * 1000
    spread: 0.05,
  },
  sniper: {
    damage: 180,
    speed: 2400,
    range: 2232,
    ammo: 1,
    cooldown: 0,
    projectileRadius: 6,
    explosionRadius: 0,
    splashDamage: 0,
    lifetime: 930, // range / speed * 1000
  },
  mine: {
    damage: 100,
    splashDamage: 80,
    blastRadius: 240,
    fuseTime: 12000,
    armDelay: 800,
    triggerRadius: 70,
    ammo: 2,
    placementRange: 0,
  },
  shockwave: {
    damage: 65,
    splashDamage: 40,
    blastRadius: 300,
    chargeTime: 800,
    ammo: 1,
  },
} as const;

/** Random weapon roll based on weighted probabilities */
export function rollWeapon(): WeaponType {
  const roll = Math.random() * 100;
  if (roll < 10) return "sniper";       // 10%
  if (roll < 25) return "mine";          // 15%
  if (roll < 40) return "shockwave";     // 15%
  if (roll < 60) return "rocket";        // 20%
  if (roll < 85) return "bomb";          // 25%
  return "bullet";                       // 15%
}
