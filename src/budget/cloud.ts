// Signing in and keeping the project in step between devices.
import { type RealtimeChannel, type SupabaseClient, createClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from './config';
import { merge3, same } from './merge';
import type { Project } from './model';

export type SyncState = 'signed-out' | 'starting' | 'saved' | 'saving' | 'offline' | 'problem';

export interface CloudStatus {
  state: SyncState;
  email: string | null;
  members: string[];
  message: string;
}

const SYNC_KEY = 'planbench.sync.v1';
const BACKUP_KEY = 'planbench.project.before-sharing';
const PENDING_KEY = 'planbench.photos.pending';

interface Stored {
  projectId: string;
  rev: number;
  base: Project;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function readJson<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null; } catch { return null; }
}
function writeJson(key: string, v: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full or off */ }
}

export class Cloud {
  readonly client: SupabaseClient;
  status: CloudStatus = { state: 'signed-out', email: null, members: [], message: '' };
  projectId: string | null = null;

  private rev = 0;
  private base: Project | null = null;
  private channel: RealtimeChannel | null = null;
  private timer = 0;
  private busy = false;
  private again = false;

  /**
   * @param project the one project object the whole app works on (changed in place)
   * @param onChange called whenever the status or the project content changes
   * @param photos how to read a locally stored photo, for uploading
   */
  constructor(
    private project: Project,
    private onChange: (projectReplaced: boolean) => void,
    private photos: { get(id: string): Promise<Blob | undefined> },
    client?: SupabaseClient,
  ) {
    this.client = client ?? createClient(SUPABASE_URL, SUPABASE_KEY);
    this.client.auth.onAuthStateChange((_event, session) => {
      const email = session?.user.email?.toLowerCase() ?? null;
      if (email === this.status.email) return;
      // Supabase asks that we do not call it again from inside this callback.
      setTimeout(() => void (email ? this.start(email) : this.stop()), 0);
    });
    window.addEventListener('online', () => void this.pull());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void this.pull(); });
  }

  private set(patch: Partial<CloudStatus>, replaced = false): void {
    this.status = { ...this.status, ...patch };
    this.onChange(replaced);
  }

  // ---------------------------------------------------------------- signing in and out

  /** Emails a sign-in link. Returns a plain-words problem, or null if the email was sent. */
  async sendLink(email: string): Promise<string | null> {
    const emailRedirectTo = window.location.origin + window.location.pathname;
    const { error } = await this.client.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo } });
    if (!error) return null;
    if (/rate limit|security purposes/i.test(error.message)) return 'Too many sign-in emails have been sent just now. Please wait a while and try again.';
    if (/database error|not been invited|signups? not allowed/i.test(error.message)) return 'That email address has not been invited yet. Ask the person who started the project to add it under Sharing.';
    if (/invalid/i.test(error.message)) return 'That does not look like an email address.';
    return 'The sign-in email could not be sent. Please check your connection and try again.';
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  private stop(): void {
    void this.channel?.unsubscribe();
    this.channel = null;
    this.projectId = null;
    this.base = null;
    clearTimeout(this.timer);
    this.set({ state: 'signed-out', email: null, members: [], message: '' });
  }

  private async start(email: string): Promise<void> {
    this.set({ state: 'starting', email, message: '' });
    try {
      const { data: rows, error } = await this.client.from('projects').select('id, rev, data').order('updated_at', { ascending: false }).limit(1);
      if (error) throw error;
      const stored = readJson<Stored>(SYNC_KEY);
      let replaced = false;
      if (rows && rows.length) {
        const row = rows[0] as { id: string; rev: number; data: Project };
        if (stored && stored.projectId === row.id) {
          // This device has shared before: fold in anything changed here while offline.
          this.replace(merge3(stored.base, clone(this.project), row.data));
        } else {
          // First time on this device: use the shared project, keeping a copy of what was here.
          writeJson(BACKUP_KEY, this.project);
          this.replace(row.data);
        }
        replaced = true;
        this.adopt(row.id, row.rev, row.data);
      } else {
        // Nobody has shared a project with this address yet: share the one on this device.
        const data = clone(this.project);
        const { data: id, error: e2 } = await this.client.rpc('create_project', { p_name: data.name, p_data: data });
        if (e2 || typeof id !== 'string') throw e2 ?? new Error('no id');
        this.adopt(id, 1, data);
        this.queuePhotos(this.allPhotoIds());
      }
      this.listen();
      await this.loadMembers();
      this.set({ state: 'saved' }, replaced);
      void this.flushPhotos();
      if (!same(this.project, this.base)) this.localChanged();
    } catch {
      this.set({ state: navigator.onLine ? 'problem' : 'offline', message: 'Could not reach the shared project. Your changes are kept on this device.' });
    }
  }

  private adopt(id: string, rev: number, data: Project): void {
    this.projectId = id;
    this.rev = rev;
    this.base = clone(data);
    writeJson(SYNC_KEY, { projectId: id, rev, base: this.base } satisfies Stored);
  }

  /** Swaps the content of the app's project object without replacing the object itself. */
  private replace(next: Project): void {
    const target = this.project as unknown as Record<string, unknown>;
    for (const k of Object.keys(target)) delete target[k];
    Object.assign(target, clone(next));
    target.versions ??= [];
    target.photos ??= [];
  }

  private listen(): void {
    void this.channel?.unsubscribe();
    this.channel = this.client
      .channel(`project-${this.projectId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'projects', filter: `id=eq.${this.projectId}` }, (payload) => {
        const rev = (payload.new as { rev?: number }).rev ?? 0;
        if (rev > this.rev) void this.pull();
      })
      .subscribe();
  }

  // ---------------------------------------------------------------- saving and fetching

  /** Call after any change on this device. Saves shortly afterwards. */
  localChanged(): void {
    if (!this.projectId) return;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.push(), 900);
    if (this.status.state === 'saved') this.set({ state: 'saving' });
  }

  private async push(): Promise<void> {
    if (!this.projectId || !this.base) return;
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    try {
      const data = clone(this.project);
      if (same(data, this.base)) { this.set({ state: 'saved', message: '' }); return; }
      const { data: rows, error } = await this.client
        .from('projects')
        .update({ data, name: data.name, rev: this.rev + 1 })
        .eq('id', this.projectId)
        .eq('rev', this.rev)
        .select('rev');
      if (error) throw error;
      if (rows && rows.length) {
        this.adopt(this.projectId, this.rev + 1, data);
        this.set({ state: 'saved', message: '' });
      } else {
        // Someone else saved first: fetch theirs, combine, and save again.
        this.busy = false;
        await this.pull();
        this.again = true;
      }
    } catch {
      this.set({ state: navigator.onLine ? 'problem' : 'offline', message: 'Not saved to the shared project yet. It will try again; your changes are safe on this device.' });
      this.timer = window.setTimeout(() => void this.push(), 15000);
    } finally {
      this.busy = false;
      if (this.again) { this.again = false; this.localChanged(); }
    }
  }

  /** Fetches the latest shared copy and folds it into this device's copy. */
  async pull(): Promise<void> {
    if (!this.projectId || !this.base || this.busy) return;
    this.busy = true;
    try {
      const { data: row, error } = await this.client.from('projects').select('rev, data').eq('id', this.projectId).maybeSingle();
      if (error) throw error;
      if (!row) { this.set({ state: 'problem', message: 'You no longer have access to the shared project.' }); return; }
      const remote = row as { rev: number; data: Project };
      if (remote.rev > this.rev) {
        const merged = merge3(this.base, clone(this.project), remote.data);
        this.replace(merged);
        this.adopt(this.projectId, remote.rev, remote.data);
        this.set({ state: same(merged, remote.data) ? 'saved' : 'saving', message: '' }, true);
        if (!same(merged, remote.data)) this.again = true;
      } else if (this.status.state === 'offline' || this.status.state === 'problem') {
        this.again = true;
      }
      void this.loadMembers();
    } catch {
      /* still offline; the next change or reconnect will try again */
    } finally {
      this.busy = false;
      if (this.again) { this.again = false; this.localChanged(); }
    }
  }

  // ---------------------------------------------------------------- sharing

  private async loadMembers(): Promise<void> {
    if (!this.projectId) return;
    const { data } = await this.client.from('project_members').select('email').eq('project_id', this.projectId).order('added_at');
    if (data) this.set({ members: data.map((m) => (m as { email: string }).email) });
  }

  /** Lets another email address open this project. Returns a problem in plain words, or null. */
  async invite(email: string): Promise<string | null> {
    const clean = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return 'That does not look like an email address.';
    if (!this.projectId) return 'Sign in first.';
    if (this.status.members.includes(clean)) return 'That person already has access.';
    const { error } = await this.client.from('project_members').insert({ project_id: this.projectId, email: clean });
    if (error) return 'That person could not be added. Please try again.';
    await this.loadMembers();
    return null;
  }

  async remove(email: string): Promise<void> {
    if (!this.projectId) return;
    await this.client.from('project_members').delete().eq('project_id', this.projectId).eq('email', email);
    await this.loadMembers();
  }

  // ---------------------------------------------------------------- photos

  private allPhotoIds(): string[] {
    const ids = this.project.photos.map((p) => p.id);
    for (const s of this.project.sections) for (const i of s.items) for (const o of i.options) if (o.photoId) ids.push(o.photoId);
    return ids;
  }

  private path(id: string): string {
    return `${this.projectId}/${id}.jpg`;
  }

  /** Remembers that these photos still need sending to the shared project. */
  queuePhotos(ids: string[]): void {
    const pending = new Set(readJson<string[]>(PENDING_KEY) ?? []);
    for (const id of ids) pending.add(id);
    writeJson(PENDING_KEY, [...pending]);
    void this.flushPhotos();
  }

  private flushing = false;
  private async flushPhotos(): Promise<void> {
    if (!this.projectId || this.flushing) return;
    this.flushing = true;
    try {
      for (const id of readJson<string[]>(PENDING_KEY) ?? []) {
        const blob = await this.photos.get(id);
        let done = !blob; // nothing to send (the photo was deleted)
        if (blob) {
          const { error } = await this.client.storage.from('photos').upload(this.path(id), blob, { contentType: 'image/jpeg', upsert: true });
          done = !error;
        }
        if (done) writeJson(PENDING_KEY, (readJson<string[]>(PENDING_KEY) ?? []).filter((x) => x !== id));
      }
    } finally {
      this.flushing = false;
    }
  }

  /** Fetches a photo another device added. */
  async downloadPhoto(id: string): Promise<Blob | null> {
    if (!this.projectId) return null;
    const { data } = await this.client.storage.from('photos').download(this.path(id));
    return data ?? null;
  }

  async deletePhoto(id: string): Promise<void> {
    if (!this.projectId) return;
    await this.client.storage.from('photos').remove([this.path(id)]);
  }
}
