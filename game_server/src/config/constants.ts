export const GAME = {
  TICK_RATE: 20, // Hz

  // Movement
  MOVE_SPEED: 420, // px/s max
  MOVE_ACCEL: 2100, // px/s²
  MOVE_FRICTION: 1800, // px/s²
  PLAYER_HITBOX_R: 18, // circle collider for movement
  PLAYER_HIT_R: 56, // combat hit detection radius

  // World
  WORLD_W: 1600,
  WORLD_H: 1200,

  // Health & Respawn
  MAX_HP: 100,
  RESPAWN_DELAY_MS: 7000,
  RESPAWN_INVULN_MS: 2000,
  RESPAWN_MIN_DIST: 200, // min px from living players when picking spawn

  // Items
  CRATE_RESPAWN_MS: 60_000,
  WEAPON_EXPIRY_MS: 40_000,
  PICKUP_RANGE: 80, // px from crate center

  // Match
  COUNTDOWN_SEC: 5,
  RESULT_DISPLAY_SEC: 30,
  MAX_PLAYERS: 4,
  MAX_SPECTATORS: 4,
  MIN_PLAYERS_TO_START: 1,
  MATCH_DURATION_SEC: 180,

  // Finance
  STAKE_RAKE_BPS: 400, // 4%
  BET_RAKE_BPS: 250, // 2.5%
  BET_PLAYER_CUT_BPS: 100, // 1%
  MIN_BET_WEI: 100_000n, // 0.1 USDC
  MAX_BET_WEI: 10_000_000n, // 10 USDC

  // Hazard zone (center red-stripe area)
  HAZARD_ZONE: { x: 680, y: 520, w: 240, h: 160 } as { x: number; y: number; w: number; h: number },
  HAZARD_INTERVAL_MS: 500, // apply damage every 500ms
  HAZARD_DMG: 8,           // 8 HP per interval = ~16 HP/sec

  // Boost pads
  BOOST_PAD_POSITIONS: [
    { x: 400, y: 400 },
    { x: 1200, y: 400 },
    { x: 400, y: 800 },
    { x: 1200, y: 800 },
  ] as { x: number; y: number }[],
  BOOST_PAD_R: 60,           // px radius to activate pad
  BOOST_DURATION_MS: 1500,   // how long boost lasts
  BOOST_SPEED_MULT: 1.5,     // speed multiplier while boosted

  // Anti-cheat
  INPUT_THROTTLE_MS: 45,
  READY_DEBOUNCE_MS: 500,

  // Yellow Network
  YELLOW_APP_ID: "APP-067D-2932",
} as const;

/** Error codes sent to clients */
export enum ErrorCode {
  UNAUTHORIZED = 1001,
  ROOM_FULL = 1002,
  SPECTATORS_FULL = 1003,
  INSUFFICIENT_BALANCE = 2001,
  STAKE_TRANSFER_FAIL = 2002,
  BET_TRANSFER_FAIL = 2003,
  BET_INVALID = 2004,
  INVALID_INPUT = 3001,
  ALREADY_READY = 3002,
  NOT_YOUR_TURN = 3003,
  WEAPON_NONE = 3004,
  CRATE_UNAVAILABLE = 3005,
  PAYOUT_FAILED = 4001,
}
