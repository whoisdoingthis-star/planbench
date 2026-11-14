// Turning millimetres into words people read.

export function fmtLength(mm: number, pro = false): string {
  if (pro) return `${mm.toFixed(1)} mm`;
  if (Math.abs(mm) < 1000) return `${Math.round(mm)} mm`;
  return `${(mm / 1000).toFixed(3)} m`;
}

export function fmtArea(mm2: number): string {
  const m2 = mm2 / 1e6;
  if (m2 < 0.01) return `${Math.round(mm2)} mm²`;
  return `${m2.toFixed(2)} m²`;
}

export function fmtAngle(deg: number): string {
  return `${deg.toFixed(1)}°`;
}
