// Combining two people's changes to the same project.
// `base` is the last copy both sides agreed on, `local` is this device's copy,
// `remote` is the copy that someone else has just saved.

type Json = unknown;

function isObj(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A list of things that each carry an id (sections, items, options, versions, photos). */
function isIdList(v: Json): v is { id: string }[] {
  return Array.isArray(v) && v.every((x) => isObj(x) && typeof x.id === 'string');
}

export function same(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
  }
  return false;
}

/**
 * Keeps both people's changes wherever they touched different things.
 * If both changed the very same field, this device's change wins.
 */
export function merge3<T>(base: Json, local: T, remote: T): T {
  if (same(local, remote)) return local;
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;

  if (isIdList(local) && isIdList(remote)) {
    const b = new Map((isIdList(base) ? base : []).map((x) => [x.id, x]));
    const l = new Map(local.map((x) => [x.id, x]));
    const r = new Set(remote.map((x) => x.id));
    const out: { id: string }[] = [];
    for (const x of remote) {
      const mine = l.get(x.id);
      if (mine) out.push(merge3(b.get(x.id), mine, x));
      else if (!b.has(x.id)) out.push(x); // added by the other person
      // otherwise: deleted on this device, so it stays deleted
    }
    local.forEach((x, i) => {
      if (r.has(x.id) || b.has(x.id)) return; // already handled, or deleted by the other person
      // Added on this device: put it after the thing it followed here, if that is still around.
      const prev = local[i - 1];
      const at = prev ? out.findIndex((y) => y.id === prev.id) : -1;
      if (at >= 0) out.splice(at + 1, 0, x);
      else if (i === 0) out.unshift(x);
      else out.push(x);
    });
    return out as T;
  }

  if (isObj(local) && isObj(remote)) {
    const b = isObj(base) ? base : {};
    const out: Record<string, Json> = {};
    for (const k of new Set([...Object.keys(remote), ...Object.keys(local)])) {
      const v = merge3(b[k], local[k], remote[k]);
      if (v !== undefined) out[k] = v;
    }
    return out as T;
  }
  return local;
}
