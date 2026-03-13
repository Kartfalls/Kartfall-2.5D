import { clamp } from "./math.js";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Circle–AABB overlap test.
 * Returns { overlap, nx, ny } if colliding, null otherwise.
 */
export function circleRectOverlap(
  cx: number,
  cy: number,
  r: number,
  rect: Rect,
): { overlap: number; nx: number; ny: number } | null {
  const closestX = clamp(cx, rect.x, rect.x + rect.w);
  const closestY = clamp(cy, rect.y, rect.y + rect.h);

  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq >= r * r || distSq === 0) return null;

  const dist = Math.sqrt(distSq);
  const overlap = r - dist;
  const nx = dx / dist;
  const ny = dy / dist;

  return { overlap, nx, ny };
}

/**
 * Line segment – AABB intersection test.
 * Returns true if the segment (x1,y1)→(x2,y2) intersects the rect.
 * Uses parametric clipping (Cohen-Sutherland-like slab test).
 */
export function lineIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: Rect,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;

  let tMin = 0;
  let tMax = 1;

  // X slab
  if (Math.abs(dx) < 1e-8) {
    // Parallel to Y axis
    if (x1 < rect.x || x1 > rect.x + rect.w) return false;
  } else {
    let t1 = (rect.x - x1) / dx;
    let t2 = (rect.x + rect.w - x1) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  // Y slab
  if (Math.abs(dy) < 1e-8) {
    if (y1 < rect.y || y1 > rect.y + rect.h) return false;
  } else {
    let t1 = (rect.y - y1) / dy;
    let t2 = (rect.y + rect.h - y1) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  return true;
}

/**
 * Check if a line segment hits ANY wall in the walls array.
 */
export function lineIntersectsAnyWall(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  walls: Rect[],
): boolean {
  for (const wall of walls) {
    if (lineIntersectsRect(x1, y1, x2, y2, wall)) return true;
  }
  return false;
}
