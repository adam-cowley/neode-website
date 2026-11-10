/**
 * Shared graph-edge geometry: box-border trimming and quadratic curves.
 * Used at build time (Hero, OntologyDemo SVGs) and at runtime
 * (the playground choreography) so arrows point the same way everywhere.
 */

export interface Pt {
  x: number
  y: number
}

export interface Box {
  w: number
  h: number
}

/**
 * The point where the ray from a centered box towards `to` crosses the
 * box border (plus an outward gap), so edges start and end on node
 * borders instead of disappearing under the node rectangles.
 */
export function borderPoint(cx: number, cy: number, box: Box, to: Pt, gap = 0): Pt {
  const dx = to.x - cx
  const dy = to.y - cy
  const hw = box.w / 2 + gap
  const hh = box.h / 2 + gap
  const tx = Math.abs(dx) < 1e-6 ? Infinity : hw / Math.abs(dx)
  const ty = Math.abs(dy) < 1e-6 ? Infinity : hh / Math.abs(dy)
  const t = Math.min(tx, ty)
  return { x: cx + dx * t, y: cy + dy * t }
}

/**
 * A quadratic edge from box a to box b, trimmed to both borders, with the
 * label sitting above the curve's apex (clear of both nodes).
 */
export function quadEdge(
  a: Pt,
  aBox: Box,
  b: Pt,
  bBox: Box,
  lift = 26,
): { path: string; label: Pt; start: Pt; end: Pt } {
  const start = borderPoint(a.x, a.y, aBox, b)
  // end 4px short of the border so the arrowhead's tip touches the node
  const end = borderPoint(b.x, b.y, bBox, a, -4)
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2 - lift
  return {
    path: `M ${start.x} ${start.y} Q ${mx} ${my} ${end.x} ${end.y}`,
    label: { x: mx, y: my - 8 },
    start,
    end,
  }
}
