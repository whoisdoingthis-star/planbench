import { useState } from 'preact/hooks';
import {
  type Item, type Option, type Project, type Section, type Version,
  UNITS, applyVersion, chosenOption, itemCost, money, newId, newItem, newOption, optionCost, replaceProject, saveVersion, toCsv, totals,
} from './model';
import { exportBackup, importBackup } from './backup';
import { deletePhoto, storePhoto } from './store';
import { NumberBox, PhotoButton, PhotoImg } from './ui';

interface Props {
  project: Project;
  /** Call after changing the project, to save it and refresh the screen. */
  changed: () => void;
}

export function BudgetView({ project: p, changed }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const t = totals(p);
  const $ = (n: number) => money(n, p.currency);

  const download = () => {
    const blob = new Blob(['﻿' + toCsv(p)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${p.name || 'budget'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const save = (blob: Blob, name: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const backup = async () => save(await exportBackup(p), `${p.name || 'project'}.planbench.json`);
  const restore = async (file: File) => {
    try {
      const next = await importBackup(await file.text());
      if (!confirm(`Replace everything here with “${next.name}” from the file? If you are sharing this project, it is replaced for everyone.`)) return;
      replaceProject(p, next);
      setOpen(null);
      changed();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'That file could not be opened.');
    }
  };

  return (
    <div class="budget">
      <section class="card summary">
        <input class="project-name" aria-label="Project name" value={p.name} onInput={(e) => { p.name = e.currentTarget.value; changed(); }} />
        <div class="total-row">
          <div>
            <div class="total-label">Total with current choices</div>
            <div class="total" data-testid="total">{$(t.total)}</div>
            <div class="muted">includes {$(t.gst)} GST</div>
          </div>
          <dl class="breakdown">
            <dt>Items</dt><dd>{$(t.subtotal)}</dd>
            <dt>
              Allowance for surprises{' '}
              <NumberBox class="tiny" label="Allowance percent" value={p.contingencyPct} onValue={(n) => { p.contingencyPct = n; changed(); }} />%
            </dt>
            <dd>{$(t.contingency)}</dd>
          </dl>
        </div>
        {t.undecided > 0 && (
          <p class="notice">
            {t.undecided} {t.undecided === 1 ? 'item has' : 'items have'} no option chosen yet, so {t.undecided === 1 ? 'it is' : 'they are'} not in the total.
          </p>
        )}
        {t.high > t.low && (
          <p class="muted">
            Depending on which options you pick, the items could come to anywhere from <strong>{$(t.low)}</strong> to <strong>{$(t.high)}</strong>.
          </p>
        )}
        <details class="settings">
          <summary>Money settings</summary>
          <div class="fields">
            <label>Currency
              <select value={p.currency} onChange={(e) => { p.currency = e.currentTarget.value; changed(); }}>
                {['NZD', 'AUD', 'USD', 'GBP', 'EUR', 'CAD'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>GST / VAT inside the prices you type (%)
              <NumberBox label="GST percent" value={p.gstPct} onValue={(n) => { p.gstPct = n; changed(); }} />
            </label>
          </div>
          <p class="muted">Type every price as the amount you would actually pay, tax included.</p>
        </details>
      </section>

      <Versions p={p} changed={changed} comparing={comparing} setComparing={setComparing} />

      {p.sections.map((s) => (
        <SectionCard key={s.id} p={p} s={s} total={t.sections.find((x) => x.id === s.id)?.total ?? 0} open={open} setOpen={setOpen} changed={changed} />
      ))}

      <div class="row-actions">
        <button type="button" class="btn" onClick={() => { p.sections.push({ id: newId(), name: 'New section', items: [] }); changed(); }}>Add a section</button>
        <button type="button" class="btn" onClick={download}>Download as a spreadsheet</button>
        <span class="spacer" />
        <button type="button" class="btn" onClick={() => void backup()}>Save a project file</button>
        <label class="btn">
          Open a project file
          <input type="file" accept=".json,application/json" hidden data-testid="open-project" onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) void restore(f); }} />
        </label>
      </div>
    </div>
  );
}

function Versions({ p, changed, comparing, setComparing }: { p: Project; changed: () => void; comparing: boolean; setComparing: (b: boolean) => void }) {
  const [name, setName] = useState('');
  const $ = (n: number) => money(n, p.currency);
  const now = totals(p);
  const cols: { id: string; name: string; t: ReturnType<typeof totals>; v?: Version }[] = [
    { id: 'now', name: 'Current choices', t: now },
    ...p.versions.map((v) => ({ id: v.id, name: v.name, t: totals(p, v.picks), v })),
  ];
  return (
    <section class="card versions">
      <h2>Versions</h2>
      <p class="muted">Save the choices you have now as a version (for example “Budget” or “Dream”), then change things and compare.</p>
      <form class="save-version" onSubmit={(e) => { e.preventDefault(); saveVersion(p, name); setName(''); changed(); }}>
        <input aria-label="Name for this version" placeholder="Name, e.g. Dream kitchen" value={name} onInput={(e) => setName(e.currentTarget.value)} />
        <button type="submit" class="btn primary">Save current choices</button>
      </form>
      {p.versions.length > 0 && (
        <ul class="version-list">
          {p.versions.map((v) => {
            const vt = totals(p, v.picks);
            const diff = vt.total - now.total;
            return (
              <li key={v.id}>
                <span class="v-name">{v.name}</span>
                <span class="v-total">{$(vt.total)}</span>
                <span class={`diff ${diff > 0 ? 'more' : diff < 0 ? 'less' : ''}`}>
                  {diff === 0 ? 'same as now' : `${$(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than now`}
                </span>
                <button type="button" class="btn small" onClick={() => { if (confirm(`Switch your current choices to “${v.name}”? Save the current ones as a version first if you want to keep them.`)) { applyVersion(p, v); changed(); } }}>Use these choices</button>
                <button type="button" class="btn small danger" onClick={() => { if (confirm(`Delete the version “${v.name}”?`)) { p.versions = p.versions.filter((x) => x.id !== v.id); changed(); } }}>Delete</button>
              </li>
            );
          })}
        </ul>
      )}
      {p.versions.length > 0 && (
        <button type="button" class="btn" onClick={() => setComparing(!comparing)}>{comparing ? 'Hide the comparison' : 'Compare side by side'}</button>
      )}
      {comparing && p.versions.length > 0 && (
        <div class="table-scroll">
          <table class="compare">
            <thead>
              <tr><th></th>{cols.map((c) => <th key={c.id}>{c.name}</th>)}</tr>
            </thead>
            <tbody>
              {p.sections.map((s, i) => (
                <tr key={s.id}>
                  <th>{s.name}</th>
                  {cols.map((c) => {
                    const v = c.t.sections[i].total;
                    const d = v - now.sections[i].total;
                    return <td key={c.id} class={d > 0 ? 'more' : d < 0 ? 'less' : ''}>{$(v)}</td>;
                  })}
                </tr>
              ))}
              <tr class="sub"><th>Allowance for surprises</th>{cols.map((c) => <td key={c.id}>{$(c.t.contingency)}</td>)}</tr>
              <tr class="grand"><th>Total</th>{cols.map((c) => <td key={c.id}>{$(c.t.total)}</td>)}</tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SectionCard({ p, s, total, open, setOpen, changed }: { p: Project; s: Section; total: number; open: string | null; setOpen: (id: string | null) => void; changed: () => void }) {
  const $ = (n: number) => money(n, p.currency);
  return (
    <section class="card section">
      <header>
        <input class="section-name" aria-label="Section name" value={s.name} onInput={(e) => { s.name = e.currentTarget.value; changed(); }} />
        <span class="section-total">{$(total)}</span>
      </header>
      <ul class="items">
        {s.items.map((item) => {
          const opt = chosenOption(item);
          const isOpen = open === item.id;
          return (
            <li key={item.id} class={`item ${isOpen ? 'open' : ''} ${item.included ? '' : 'left-out'}`}>
              <button type="button" class="item-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : item.id)}>
                {opt?.photoId ? <PhotoImg id={opt.photoId} alt="" class="thumb" /> : <span class="thumb empty" />}
                <span class="item-main">
                  <span class="item-name">{item.name || 'Unnamed item'}</span>
                  <span class="item-sub">
                    {item.qty} {item.unit} · {!item.included ? 'Left out' : opt ? opt.name || 'Unnamed option' : item.options.length ? 'Not decided yet' : 'No prices yet'}
                  </span>
                </span>
                <span class="item-total">{item.included && opt ? $(itemCost(item)) : '—'}</span>
                <span class="chev" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && <ItemEditor p={p} s={s} item={item} changed={changed} close={() => setOpen(null)} />}
            </li>
          );
        })}
      </ul>
      <div class="row-actions">
        <button type="button" class="btn small" onClick={() => { const i = newItem('New item'); s.items.push(i); setOpen(i.id); changed(); }}>Add an item</button>
        {s.items.length === 0 && (
          <button type="button" class="btn small danger" onClick={() => { p.sections = p.sections.filter((x) => x.id !== s.id); changed(); }}>Delete this section</button>
        )}
      </div>
    </section>
  );
}

function ItemEditor({ p, s, item, changed, close }: { p: Project; s: Section; item: Item; changed: () => void; close: () => void }) {
  const $ = (n: number) => money(n, p.currency);
  const current = item.included ? itemCost(item) : 0;
  const removeOption = (o: Option) => {
    if (!confirm(`Delete the option “${o.name || 'Unnamed option'}”?`)) return;
    if (o.photoId) void deletePhoto(o.photoId);
    item.options = item.options.filter((x) => x.id !== o.id);
    if (item.chosen === o.id) item.chosen = null;
    changed();
  };
  const removeItem = () => {
    if (!confirm(`Delete “${item.name || 'this item'}” and all its options?`)) return;
    for (const o of item.options) if (o.photoId) void deletePhoto(o.photoId);
    s.items = s.items.filter((x) => x.id !== item.id);
    close();
    changed();
  };
  return (
    <div class="item-body">
      <div class="fields">
        <label class="grow">What is it?
          <input value={item.name} onInput={(e) => { item.name = e.currentTarget.value; changed(); }} />
        </label>
        <label>How many / how much?
          <NumberBox label="Quantity" value={item.qty} onValue={(n) => { item.qty = n; changed(); }} />
        </label>
        <label>Measured in
          <select value={item.unit} onChange={(e) => { item.unit = e.currentTarget.value; changed(); }}>
            {[...new Set([...UNITS, item.unit])].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
      </div>
      <label class="check">
        <input type="checkbox" checked={!item.included} onChange={(e) => { item.included = !e.currentTarget.checked; changed(); }} />
        Leave this out of the kitchen for now
      </label>

      <h3>Options to choose between</h3>
      {item.options.length === 0 && <p class="muted">Add each product or quote you are considering, then pick one.</p>}
      <ul class="options">
        {item.options.map((o) => {
          const cost = optionCost(o, item.qty);
          const picked = item.chosen === o.id;
          const diff = cost - current;
          return (
            <li key={o.id} class={`option ${picked ? 'picked' : ''}`}>
              <div class="option-photo">
                {o.photoId ? <PhotoImg id={o.photoId} alt={o.name} class="option-img" /> : <div class="option-img photo-missing" />}
                <PhotoButton class="small" label={o.photoId ? 'Change photo' : 'Add a photo'} onFiles={async ([f]) => {
                  const id = o.photoId ?? newId();
                  try { await storePhoto(id, f); o.photoId = id; changed(); } catch { alert('That photo could not be added.'); }
                }} />
              </div>
              <div class="option-fields">
                <div class="fields">
                  <label class="grow">Name
                    <input value={o.name} placeholder="e.g. Brushed brass 128 mm" onInput={(e) => { o.name = e.currentTarget.value; changed(); }} />
                  </label>
                  <label class="grow">Shop or tradesperson
                    <input value={o.supplier} onInput={(e) => { o.supplier = e.currentTarget.value; changed(); }} />
                  </label>
                </div>
                <div class="fields">
                  <label>Price per {unitWord(item.unit)}
                    <NumberBox prefix="$" label="Price per unit" value={o.price} onValue={(n) => { o.price = n; changed(); }} />
                  </label>
                  <label>Fitting per {unitWord(item.unit)}
                    <NumberBox prefix="$" label="Fitting or labour per unit" value={o.labour} onValue={(n) => { o.labour = n; changed(); }} />
                  </label>
                  <label>One-off extra
                    <NumberBox prefix="$" label="One-off extra such as delivery" value={o.extra} onValue={(n) => { o.extra = n; changed(); }} />
                  </label>
                </div>
                <div class="fields">
                  <label class="grow">Web link
                    <input type="url" value={o.link} placeholder="https://" onInput={(e) => { o.link = e.currentTarget.value; changed(); }} />
                  </label>
                  <label class="grow">Notes
                    <input value={o.notes} onInput={(e) => { o.notes = e.currentTarget.value; changed(); }} />
                  </label>
                </div>
                <div class="option-foot">
                  <span class="option-total">{$(cost)}</span>
                  {!picked && item.included && current > 0 && diff !== 0 && (
                    <span class={`diff ${diff > 0 ? 'more' : 'less'}`}>{$(Math.abs(diff))} {diff > 0 ? 'more' : 'less'} than your current choice</span>
                  )}
                  <span class="spacer" />
                  {/^https?:\/\//.test(o.link) && <a class="btn small" href={o.link} target="_blank" rel="noopener noreferrer">Open link</a>}
                  <button type="button" class="btn small danger" onClick={() => removeOption(o)}>Delete</button>
                  <button type="button" class={`btn small ${picked ? 'primary' : ''}`} aria-pressed={picked} onClick={() => { item.chosen = picked ? null : o.id; changed(); }}>
                    {picked ? '✓ Chosen' : 'Choose this'}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div class="row-actions">
        <button type="button" class="btn" onClick={() => { const o = newOption(); item.options.push(o); if (item.options.length === 1) item.chosen = o.id; changed(); }}>Add an option</button>
        <span class="spacer" />
        <button type="button" class="btn small danger" onClick={removeItem}>Delete this item</button>
      </div>
    </div>
  );
}

function unitWord(unit: string): string {
  return unit === 'each' ? 'item' : unit === 'hours' ? 'hour' : unit;
}
