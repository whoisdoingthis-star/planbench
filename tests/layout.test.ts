import { describe, expect, it } from 'vitest';
import { type Layout, benchTop, defaultLayout, normaliseLayout, optionFacts, seg, wallWidth } from '../src/budget/layout';
import { normaliseProject } from '../src/budget/backup';

const kitchen = (): Layout => ({ ...defaultLayout(), ceiling: 2394, tallH: 2086, tileW: 750, tileH: 750 });
const opt = (splash: number, upperH: number) => ({ id: 'x', name: 'x', splash, upperH });

describe('wall height options', () => {
  it('works out where the wall cabinets end up', () => {
    const l = kitchen();
    expect(benchTop(l)).toBe(900);
    const drawn = optionFacts(l, opt(602, 584));
    expect([drawn.underside, drawn.top, drawn.toCeiling, drawn.vsTall]).toEqual([1502, 2086, 308, 0]);
    const lifted = optionFacts(l, opt(750, 720));
    expect([lifted.underside, lifted.top, lifted.toCeiling, lifted.vsTall]).toEqual([1650, 2370, 24, 284]);
    const short = optionFacts(l, opt(750, 584));
    expect([short.top, short.toCeiling, short.vsTall]).toEqual([2234, 160, 148]);
  });

  it('says whether tiles need cutting', () => {
    const l = kitchen();
    expect(optionFacts(l, opt(750, 720))).toMatchObject({ fullRows: 1, cutRow: 0 });
    expect(optionFacts(l, opt(602, 584))).toMatchObject({ fullRows: 0, cutRow: 602 });
    l.tileH = 300;
    expect(optionFacts(l, opt(750, 720))).toMatchObject({ fullRows: 2, cutRow: 150 });
    expect(optionFacts(l, opt(600, 720))).toMatchObject({ fullRows: 2, cutRow: 0 });
    // 150 mm tiles: five rows make 750, and four rows fit the 602 mm gap as drawn with 2 mm to spare.
    l.tileH = 150;
    expect(optionFacts(l, opt(750, 720))).toMatchObject({ fullRows: 5, cutRow: 0 });
    expect(optionFacts(l, opt(602, 584))).toMatchObject({ fullRows: 4, cutRow: 0 });
    expect(optionFacts(l, opt(602, 584)).notes[0].text).toMatch(/2 mm to spare/);
    expect(optionFacts(l, opt(466, 720))).toMatchObject({ fullRows: 3, cutRow: 16 });
    expect(optionFacts(l, opt(598, 584)).notes[0].text).toMatch(/2 mm tight/);
    expect(optionFacts(l, opt(590, 584))).toMatchObject({ fullRows: 3, cutRow: 140 });
  });

  it('warns in plain words', () => {
    const l = kitchen();
    const text = (s: number, h: number) => optionFacts(l, opt(s, h)).notes.map((x) => x.text).join(' | ');
    expect(text(750, 720)).toMatch(/24 mm strip under the ceiling/);
    expect(text(750, 720)).toMatch(/284 mm above the top of the pantry/);
    expect(text(602, 584)).toMatch(/line up with the pantry/);
    expect(text(900, 720)).toMatch(/Does not fit/);
  });

  it('measures a wall and survives a round trip through a project file', () => {
    const l = kitchen();
    l.walls[0].base = [seg('cabinet', 1092), seg('cabinet', 150), seg('oven', 600), seg('cabinet', 150), seg('cabinet', 880)];
    l.walls[0].upper = [seg('gap', 42), seg('cabinet', 350)];
    expect(wallWidth(l.walls[0])).toBe(2872);
    const p = normaliseProject({ name: 'K', sections: [], layout: JSON.parse(JSON.stringify(l)) });
    expect(p.layout).toEqual(l);
    expect(normaliseLayout('junk')).toBeUndefined();
    expect(normaliseProject({ sections: [] }).layout).toBeUndefined();
  });
});
