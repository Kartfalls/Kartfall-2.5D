/**
 * Arena layout data: walls, spawn points, crate positions.
 */

export interface WallRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const WALLS: WallRect[] = [
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

/** Player spawns — one per color slot (P1–P4). */
export const PLAYER_SPAWNS = [
  { x: 120, y: 120, angle: Math.PI / 4 }, // P1 (yellow) — top-left
  { x: 1480, y: 120, angle: (3 * Math.PI) / 4 }, // P2 (red) — top-right
  { x: 120, y: 1080, angle: -Math.PI / 4 }, // P3 (purple) — bottom-left
  { x: 1480, y: 1080, angle: (-3 * Math.PI) / 4 }, // P4 (black) — bottom-right
];

/** Respawn points — randomized from pool, avoids other players. */
export const RESPAWN_POINTS = [
  { x: 800, y: 160 },   // Top Mid
  { x: 800, y: 1040 },  // Bottom Mid
  { x: 200, y: 600 },   // Left Mid
  { x: 1400, y: 600 },  // Right Mid
  { x: 500, y: 200 },   // Inner TL
  { x: 1100, y: 200 },  // Inner TR
  { x: 500, y: 1000 },  // Inner BL
  { x: 1100, y: 1000 }, // Inner BR
];

/** 4 fixed crate positions with IDs. */
export const CRATE_POSITIONS = [
  { id: "c0", x: 800, y: 300 }, // Top
  { id: "c1", x: 800, y: 900 }, // Bottom
  { id: "c2", x: 500, y: 600 }, // Left
  { id: "c3", x: 1100, y: 600 }, // Right
];

/** Generate a 6-char alphanumeric room code. */
export function generateRoomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
