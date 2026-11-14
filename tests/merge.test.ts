import { describe, expect, it } from 'vitest';
import { merge3, same } from '../src/budget/merge';

const item = (id: string, extra: object = {}) => ({ id, name: id, qty: 1, options: [] as { id: string; price: number }[], ...extra });

describe('merging two people\'s changes', () => {
  it('keeps changes to different fields of the same item', () => {
    const base = { items: [item('handles')] };
    const local = { items: [item('handles', { qty: 24 })] };
    const remote = { items: [item('handles', { name: 'Cupboard handles' })] };
    expect(merge3(base, local, remote)).toEqual({ items: [item('handles', { qty: 24, name: 'Cupboard handles' })] });
  });

  it('keeps things each person added, in a sensible order', () => {
    const base = { items: [item('a'), item('b')] };
    const local = { items: [item('a'), item('mine'), item('b')] };
    const remote = { items: [item('a'), item('b'), item('theirs')] };
    expect(merge3(base, local, remote).items.map((i) => i.id)).toEqual(['a', 'mine', 'b', 'theirs']);
  });

  it('respects deletions from either side', () => {
    const base = { items: [item('a'), item('b'), item('c')] };
    const local = { items: [item('a'), item('c')] };
    const remote = { items: [item('a'), item('b', { qty: 5 })] };
    expect(merge3(base, local, remote).items.map((i) => i.id)).toEqual(['a']);
  });

  it('merges options nested inside items, and lets this device win a direct clash', () => {
    const base = { items: [item('a', { options: [{ id: 'o1', price: 10 }] })] };
    const local = { items: [item('a', { options: [{ id: 'o1', price: 12 }, { id: 'o2', price: 5 }] })] };
    const remote = { items: [item('a', { options: [{ id: 'o1', price: 11 }, { id: 'o3', price: 7 }] })] };
    expect(merge3(base, local, remote).items[0].options).toEqual([{ id: 'o1', price: 12 }, { id: 'o2', price: 5 }, { id: 'o3', price: 7 }]);
  });

  it('merges saved choices keyed by item, and handles a missing base', () => {
    const base = { picks: { a: { chosen: null } } };
    const local: { picks: Record<string, { chosen: string | null }> } = { picks: { a: { chosen: 'o1' } } };
    const remote = { picks: { a: { chosen: null }, b: { chosen: 'o9' } } };
    expect(merge3(base, local, remote)).toEqual({ picks: { a: { chosen: 'o1' }, b: { chosen: 'o9' } } });
    expect(merge3(undefined, { items: [item('x')] }, { items: [item('y')] }).items.map((i) => i.id)).toEqual(['x', 'y']);
  });

  it('compares deeply', () => {
    expect(same({ a: [1, { b: 2 }], c: undefined }, { a: [1, { b: 2 }] })).toBe(true);
    expect(same({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });
});
