import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDxf } from '../src/io/dxf';
import { angleAt, bulgePoints, polygonArea, segIntersect } from '../src/model/geom';
import { fmtArea, fmtLength } from '../src/model/format';
import { findSnap, type SnapKind } from '../src/tools/snap';
import { resultText } from '../src/tools/measure';
import { Viewport } from '../src/view/viewport';

const sample = () => parseDxf(readFileSync(new URL('../public/samples/flat.dxf', import.meta.url), 'utf8'), 'sample');
const ALL = new Set<SnapKind>(['end', 'mid', 'cen', 'int', 'near']);

describe('geometry', () => {
  it('measures area, angle and crossings', () => {
    expect(polygonArea([[0, 0], [4000, 0], [4000, 3000], [0, 3000]])).toBe(12e6);
    expect(angleAt([1, 0], [0, 0], [0, 1])).toBeCloseTo(90);
    expect(segIntersect([0, 0], [2, 2], [0, 2], [2, 0])).toEqual([1, 1]);
    expect(segIntersect([0, 0], [1, 0], [0, 1], [1, 1])).toBeNull();
  });

  it('turns a DXF bulge into an arc on the correct side', () => {
    const out: number[] = [];
    bulgePoints([0, 0], [2, 0], 1, out); // anticlockwise half circle, dips below the line
    const ys = out.filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeCloseTo(-1, 3);
    expect(Math.max(...ys)).toBeLessThanOrEqual(1e-9);
    expect(out.slice(-2)).toEqual([2, 0]);
  });

  it('writes sizes in plain words', () => {
    expect(fmtLength(850)).toBe('850 mm');
    expect(fmtLength(3250)).toBe('3.250 m');
    expect(fmtArea(12e6)).toBe('12.00 m²');
  });
});

describe('opening a DXF', () => {
  it('reads layers, shapes and overall size of the sample plan', () => {
    const d = sample();
    expect(d.layers.map((l) => l.name)).toEqual(expect.arrayContaining(['WALLS', 'DOORS', 'FURNITURE', 'TEXT']));
    expect(d.bbox.minX).toBeCloseTo(0);
    expect(d.bbox.minY).toBeCloseTo(-700);
    expect(d.bbox.maxX).toBeCloseTo(9000);
    expect(d.bbox.maxY).toBeCloseTo(7000);
    expect(d.prims.some((p) => p.k === 'arc')).toBe(true);
    expect(d.prims.some((p) => p.k === 'circle')).toBe(true);
    expect(d.prims.filter((p) => p.k === 'text').length).toBe(3);
  });

  it('places blocks, and gives layer-0 block contents the layer of the placement', () => {
    const d = sample();
    const furniture = d.layers.findIndex((l) => l.name === 'FURNITURE');
    // The bed is placed at (7100, 4600) and is 1500 x 2000.
    const bed = d.prims.find((p) => p.k === 'path' && p.bbox.minX === 7100 && p.bbox.maxX === 8600 && p.bbox.maxY === 6600);
    expect(bed?.layer).toBe(furniture);
    // The sofa (2200 x 900) is turned 90 degrees at (1300, 3200), so it reaches left and up.
    const sofa = d.prims.find((p) => p.k === 'path' && Math.abs(p.bbox.minX - 400) < 1e-6 && Math.abs(p.bbox.maxY - 5400) < 1e-6);
    expect(sofa).toBeTruthy();
  });

  it('converts other units to millimetres', () => {
    const dxf = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '6', '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '8', '0', '10', '0', '20', '0', '11', '2.5', '21', '0', '0', 'ENDSEC', '0', 'EOF'].join('\n');
    expect(parseDxf(dxf, 'm').bbox.maxX).toBeCloseTo(2500);
  });

  it('explains itself when the file is not a drawing', () => {
    expect(() => parseDxf('', 'x')).toThrow(/DXF/);
  });
});

describe('snapping', () => {
  it('locks onto corners, middles, centres and crossings', () => {
    const d = sample();
    expect(findSnap(d, 30, -20, 100, ALL)).toMatchObject({ x: 0, y: 0, kind: 'end' });
    expect(findSnap(d, 4480, 30, 100, ALL)).toMatchObject({ x: 4500, y: 0, kind: 'mid' });
    expect(findSnap(d, 2610, 4290, 100, ALL)).toMatchObject({ x: 2600, y: 4300, kind: 'cen' });
    // The window line at y=100 does not cross anything, but the inner wall meets the inside face at (5000, 200).
    expect(findSnap(d, 5010, 190, 60, new Set<SnapKind>(['int']))).toMatchObject({ x: 5000, y: 200, kind: 'int' });
    expect(findSnap(d, 2000, 3000, 50, ALL)).toBeNull();
  });

  it('ignores hidden layers', () => {
    const d = sample();
    d.layers.find((l) => l.name === 'FURNITURE')!.visible = false;
    expect(findSnap(d, 2610, 4290, 100, ALL)).toBeNull();
  });
});

describe('measuring and the view', () => {
  it('reports results', () => {
    expect(resultText({ kind: 'length', pts: [[0, 0], [9000, 0]] })).toBe('9.000 m');
    expect(resultText({ kind: 'area', pts: [[200, 200], [5000, 200], [5000, 6800], [200, 6800]] })).toBe('31.68 m²');
    expect(resultText({ kind: 'angle', pts: [[1, 0], [0, 0], [1, 1]] })).toBe('45.0°');
  });

  it('keeps the point under the pointer still while zooming', () => {
    const v = new Viewport();
    v.w = 800; v.h = 600;
    v.fit({ minX: 0, minY: 0, maxX: 9000, maxY: 7000 });
    const before = v.toWorld(123, 456);
    v.zoomAt(123, 456, 3);
    const after = v.toWorld(123, 456);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
    const s = v.toScreen(before[0], before[1]);
    expect(s[0]).toBeCloseTo(123);
    expect(s[1]).toBeCloseTo(456);
  });
});
