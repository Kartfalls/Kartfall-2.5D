/**
 * Client-side display constants.
 * These mirror the server constants where relevant but are purely visual.
 */
export const DISPLAY = {
  /** Phaser viewport width */
  WIDTH: 800,
  /** Phaser viewport height */
  HEIGHT: 450,

  /** Camera zoom (pulled back to show more of the arena) */
  CAMERA_ZOOM: 1.0,
  /** Camera interpolation factor for smooth follow */
  CAMERA_LERP: 0.08,
  /** Camera deadzone width */
  CAMERA_DEADZONE_W: 100,
  /** Camera deadzone height */
  CAMERA_DEADZONE_H: 80,

  /** World dimensions (must match server) */
  WORLD_W: 1600,
  WORLD_H: 1200,

  /** Tile size (px) */
  TILE_SIZE: 16,
  /** World tiles wide */
  TILES_W: 100, // 1600/16
  /** World tiles high */
  TILES_H: 75, // 1200/16

  /** Input throttle to match server 20 Hz */
  INPUT_THROTTLE_MS: 50,

  /** Position interpolation speed for remote players */
  LERP_REMOTE: 0.1,
  /** Position interpolation speed for local player */
  LERP_LOCAL: 0.2,

  /** Pickup proximity range (visual check) */
  PICKUP_RANGE: 80,

  /** Duration to show firing sprite after attack_event */
  FIRING_DISPLAY_MS: 200,

  /** Minimap configuration */
  MINIMAP_SIZE: 150,
  MINIMAP_MARGIN: 16,
  MINIMAP_ZOOM: 0.1, // Zoomed far out to see the arena

  /** Player color names indexed by colorIndex */
  COLORS: ["yellow", "red", "purple", "black"] as const,
} as const;
