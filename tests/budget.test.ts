import { describe, expect, it } from 'vitest';
import { type Project, applyVersion, itemCost, kitchenTemplate, newItem, newOption, optionCost, saveVersion, toCsv, totals } from '../src/budget/model';

function small(): Project {
  const p = kitchenTemplate();
  p.sections = [{ id: 's1', name: 'Handles', items: [] }, { id: 's2', name: 'Electrical', items: [] }];
  const handles = newItem('Cupboard handles');
  handles.qty = 24;
  const brass = { ...newOption('Brass'), price: 18.5, extra: 12 };
  const black = { ...newOption('Black'), price: 6.95 };
  handles.options = [brass, black];
  handles.chosen = brass.id;
  const sparky = newItem('Electrician', 'hours');
  sparky.qty = 6.5;
  const quote = { ...newOption('Quote'), labour: 95, extra: 120 };
  sparky.options = [quote];
  sparky.chosen = quote.id;
  p.sections[0].items = [handles];
  p.sections[1].items = [sparky];
  return p;
}

describe('budget sums', () => {
  it('costs an option as quantity x (price + fitting) + one-off extra', () => {
    expect(optionCost({ ...newOption(), price: 18.5, labour: 0, extra: 12 }, 24)).toBe(456);
    expect(optionCost({ ...newOption(), price: 0.1, labour: 0.2 }, 3)).toBe(0.9); // no floating-point pennies
  });

  it('adds up sections, allowance and the GST inside the total', () => {
    const t = totals(small());
    expect(t.sections.map((s) => s.total)).toEqual([456, 737.5]);
    expect(t.subtotal).toBe(1193.5);
    expect(t.contingency).toBe(119.35);
    expect(t.total).toBe(1312.85);
    expect(t.gst).toBe(171.24); // 15% GST inside 1312.85
    expect(t.undecided).toBe(0);
    expect(t.low).toBe(166.8 + 737.5);
    expect(t.high).toBe(1193.5);
  });

  it('leaves out excluded items and counts undecided ones', () => {
    const p = small();
    p.sections[0].items[0].chosen = null;
    p.sections[1].items[0].included = false;
    const t = totals(p);
    expect(t.subtotal).toBe(0);
    expect(t.undecided).toBe(1);
    expect(itemCost(p.sections[1].items[0])).toBe(0);
  });

  it('saves versions, compares them and puts them back', () => {
    const p = small();
    const dream = saveVersion(p, 'Dream');
    const handles = p.sections[0].items[0];
    handles.chosen = handles.options[1].id;
    handles.qty = 20;
    expect(totals(p).subtotal).toBe(139 + 737.5);
    expect(totals(p, dream.picks).subtotal).toBe(1193.5); // the saved version is unchanged
    // Deleting an option that a version used makes that item undecided in the version, not an error.
    const budget = saveVersion(p, 'Budget');
    handles.options.pop();
    expect(totals(p, budget.picks).undecided).toBe(1);
    applyVersion(p, dream);
    expect(handles.qty).toBe(24);
    expect(totals(p).subtotal).toBe(1193.5);
    // An item added later is not counted in older versions.
    p.sections[0].items.push({ ...newItem('Knobs'), options: [{ ...newOption('x'), price: 5 }] });
    expect(totals(p, dream.picks).subtotal).toBe(1193.5);
  });

  it('starts with a kitchen list and exports a spreadsheet', () => {
    const p = kitchenTemplate();
    expect(p.sections.length).toBeGreaterThan(8);
    expect(totals(p).total).toBe(0);
    const csv = toCsv(small());
    expect(csv).toContain('Handles,Cupboard handles,24,each,Brass,,18.5,0,12,456.00');
    expect(csv).toContain('Total,1312.85');
  });
});
