export type WeaponType = "none" | "rocket" | "bomb" | "bullet";

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
} as const;

/** Random weapon roll based on weighted probabilities */
export function rollWeapon(): WeaponType {
  const roll = Math.random() * 100;
  if (roll < 25) return "rocket";
  if (roll < 60) return "bomb";
  return "bullet";
}
