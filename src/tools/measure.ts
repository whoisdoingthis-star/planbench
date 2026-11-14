import type { Pt } from '../model/types';
import { angleAt, dist, perimeter, polygonArea } from '../model/geom';
import { fmtAngle, fmtArea, fmtLength } from '../model/format';

export type MeasureKind = 'length' | 'area' | 'angle';

export interface Measurement {
  kind: MeasureKind;
  pts: Pt[];
}

/** How many points finish the measurement by themselves (area carries on until you say Done). */
export function pointsNeeded(kind: MeasureKind): number {
  return kind === 'length' ? 2 : kind === 'angle' ? 3 : Infinity;
}

export function isComplete(m: Measurement): boolean {
  return m.kind === 'area' ? m.pts.length >= 3 : m.pts.length >= pointsNeeded(m.kind);
}

/** The headline result as words, e.g. "3.250 m". */
export function resultText(m: Measurement, pro = false): string {
  if (m.kind === 'length') return fmtLength(dist(m.pts[0], m.pts[1]), pro);
  if (m.kind === 'angle') return fmtAngle(angleAt(m.pts[0], m.pts[1], m.pts[2]));
  return fmtArea(polygonArea(m.pts));
}

/** A fuller sentence for the hint bar. */
export function resultSentence(m: Measurement, pro = false): string {
  if (m.kind === 'length') {
    const dx = Math.abs(m.pts[1][0] - m.pts[0][0]);
    const dy = Math.abs(m.pts[1][1] - m.pts[0][1]);
    return `Length: ${resultText(m, pro)}  (across ${fmtLength(dx, pro)}, up ${fmtLength(dy, pro)})`;
  }
  if (m.kind === 'angle') return `Angle: ${resultText(m)}`;
  return `Area: ${resultText(m)}  (distance around the edge ${fmtLength(perimeter(m.pts, true), pro)})`;
}
