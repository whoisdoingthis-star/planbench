// Two pretend devices sharing one project through a pretend server.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Cloud } from '../src/budget/cloud';
import { type Project, kitchenTemplate, newOption } from '../src/budget/model';

/* eslint-disable @typescript-eslint/no-explicit-any */
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

class Server {
  row: { id: string; rev: number; data: Project; name: string } | null = null;
  members: string[] = [];
  listeners: ((rev: number) => void)[] = [];
  uploads: string[] = [];
  down = false;
}

function fakeClient(server: Server, email: string) {
  let authCb: (e: string, s: any) => void = () => {};
  const fail = () => ({ data: null, error: new Error('network') });
  const client: any = {
    auth: {
      onAuthStateChange: (cb: any) => { authCb = cb; },
      signOut: async () => authCb('SIGNED_OUT', null),
    },
    signIn: () => authCb('SIGNED_IN', { user: { email } }),
    rpc: async (_: string, args: any) => {
      if (server.down) return fail();
      server.row = { id: 'p1', rev: 1, data: clone(args.p_data), name: args.p_name };
      server.members = [email];
      return { data: 'p1', error: null };
    },
    from: (table: string) => {
      if (table === 'project_members') {
        return {
          select: () => ({ eq: () => ({ order: async () => ({ data: server.members.map((e) => ({ email: e })), error: null }) }) }),
          insert: async (m: any) => { server.members.push(m.email); return { error: null }; },
        };
      }
      const mine = () => server.members.includes(email) && server.row;
      return {
        select: () => ({
          order: () => ({ limit: async () => (server.down ? fail() : { data: mine() ? [clone(server.row)] : [], error: null }) }),
          eq: () => ({ maybeSingle: async () => (server.down ? fail() : { data: mine() ? clone(server.row) : null, error: null }) }),
        }),
        update: (patch: any) => ({
          eq: () => ({
            eq: (_col: string, rev: number) => ({
              select: async () => {
                if (server.down) return fail();
                if (!server.row || server.row.rev !== rev) return { data: [], error: null };
                server.row = { ...server.row, ...clone(patch) };
                const now = server.row!.rev;
                setTimeout(() => server.listeners.forEach((l) => l(now)), 0);
                return { data: [{ rev: now }], error: null };
              },
            }),
          }),
        }),
      };
    },
    channel: () => {
      const ch: any = {
        on: (_e: string, _f: any, cb: any) => { server.listeners.push((rev) => cb({ new: { rev } })); return ch; },
        subscribe: () => ch,
        unsubscribe: async () => {},
      };
      return ch;
    },
    storage: { from: () => ({ upload: async (path: string) => { server.uploads.push(path); return { error: null }; }, download: async () => ({ data: null }), remove: async () => ({}) }) },
  };
  return client;
}

function device(server: Server, email: string, project: Project) {
  const store = new Map<string, string>();
  const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  const client = fakeClient(server, email);
  // Each device has its own browser storage; swap it in whenever that device is "active".
  const use = () => vi.stubGlobal('localStorage', ls);
  use();
  const cloud = new Cloud(project, () => {}, { get: async () => new Blob(['x']) }, client);
  return { cloud, project, client, use, edit(fn: (p: Project) => void) { use(); fn(project); cloud.localChanged(); } };
}

const settle = async () => { for (let i = 0; i < 12; i++) await vi.advanceTimersByTimeAsync(1000); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { addEventListener: () => {}, setTimeout, clearTimeout });
  vi.stubGlobal('document', { addEventListener: () => {}, hidden: false });
  vi.stubGlobal('navigator', { onLine: true });
});

describe('sharing a project between two devices', () => {
  it('shares the first device\'s project, then keeps both in step', async () => {
    const server = new Server();
    const mine = kitchenTemplate();
    mine.name = 'Our kitchen';
    mine.photos.push({ id: 'ph1', group: 'now', caption: '', addedAt: '' });
    const a = device(server, 'a@example.com', mine);
    a.client.signIn();
    await settle();
    expect(a.cloud.status.state).toBe('saved');
    expect(server.row?.data.name).toBe('Our kitchen');
    expect(server.uploads).toEqual(['p1/ph1.jpg']);

    // The second person is invited, signs in on a device that had its own scratch project.
    a.use();
    expect(await a.cloud.invite('B@Example.com')).toBeNull();
    const b = device(server, 'b@example.com', kitchenTemplate());
    b.client.signIn();
    await settle();
    expect(b.project.id).toBe(mine.id);
    expect(b.cloud.status.members).toEqual(['a@example.com', 'b@example.com']);

    // Both change different things at the same moment.
    a.edit((p) => { p.sections[2].items[0].qty = 24; });
    b.edit((p) => { const i = p.sections[2].items[0]; const o = newOption('Brass'); o.price = 18.5; i.options.push(o); i.chosen = o.id; });
    await settle();
    for (const d of [a, b]) {
      const item = d.project.sections[2].items[0];
      expect([item.qty, item.options.map((o) => o.name), item.chosen !== null]).toEqual([24, ['Brass'], true]);
    }
    expect(a.project).toEqual(b.project);
    expect(server.row?.data).toEqual(a.project);
    expect(a.cloud.status.state).toBe('saved');
    expect(b.cloud.status.state).toBe('saved');
  });

  it('keeps changes made while the connection is down and sends them later', async () => {
    const server = new Server();
    const a = device(server, 'a@example.com', kitchenTemplate());
    a.client.signIn();
    await settle();
    server.down = true;
    a.edit((p) => { p.contingencyPct = 15; });
    await settle();
    expect(['problem', 'offline']).toContain(a.cloud.status.state);
    expect(server.row?.data.contingencyPct).toBe(10);
    server.down = false;
    await vi.advanceTimersByTimeAsync(20000);
    await settle();
    expect(server.row?.data.contingencyPct).toBe(15);
    expect(a.cloud.status.state).toBe('saved');
  });
});
