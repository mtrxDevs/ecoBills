/**
 * Scale raw values to bar heights in [0, maxH]. Pure and total — the one piece
 * of hero logic worth a unit test. Negatives clamp to 0 (a chart never draws
 * below its floor); empty input yields no bars; uniform input fills the scale.
 */
export function scaleBars(values: number[], maxH: number): number[] {
  if (!values.length || !(maxH > 0)) return []
  const peak = Math.max(...values, 0)
  if (peak <= 0) return values.map(() => 0)
  return values.map((v) => (Math.max(0, v) / peak) * maxH)
}
