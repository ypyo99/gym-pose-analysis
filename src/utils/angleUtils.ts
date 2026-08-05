export interface Point {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

/**
 * Calculates the angle between three points.
 * @param a First point (e.g., Hip)
 * @param b Vertex point (e.g., Knee)
 * @param c Second point (e.g., Ankle)
 * @returns The angle in degrees (0 to 180)
 */
export const calculateAngle = (a: Point, b: Point, c: Point): number => {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  
  if (angle > 180.0) {
    angle = 360 - angle;
  }
  
  return angle;
};
