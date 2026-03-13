/**
 * Convert facing angle (radians) to a 36-direction sprite frame index.
 * Frame 0 = 0°, frame 1 = 10°, ..., frame 35 = 350°.
 */
export function angleToFrame(angleRad: number): number {
  let deg = ((angleRad * 180) / Math.PI) % 360;
  if (deg < 0) deg += 360;
  return Math.round(deg / 10) % 36;
}
