// Opening a project from a private link. The project sits on the site in locked (encrypted)
// form; the key to unlock it is the part of the link after the #, which never leaves the browser.
import { importBackup } from './backup';
import type { Project } from './model';

const LINK = /^#open=([a-f0-9]{8,32})\.([A-Za-z0-9_-]{43})$/;

export function sharedLinkId(hash: string): string | null {
  return LINK.exec(hash)?.[1] ?? null;
}

export async function unlock(data: ArrayBuffer, keyText: string): Promise<string> {
  const raw = Uint8Array.from(atob(keyText.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, key, data.slice(12));
  return new TextDecoder().decode(plain);
}

/** Fetches and unlocks the project a private link points at. */
export async function openSharedLink(hash: string, baseUrl: string): Promise<Project> {
  const m = LINK.exec(hash);
  if (!m) throw new Error('This link is not complete. Please copy the whole link and try again.');
  let data: ArrayBuffer;
  try {
    const res = await fetch(`${baseUrl}shared/${m[1]}.bin`);
    if (!res.ok) throw new Error(String(res.status));
    data = await res.arrayBuffer();
  } catch {
    throw new Error('The shared project could not be downloaded. Please check your connection and try the link again.');
  }
  let text: string;
  try {
    text = await unlock(data, m[2]);
  } catch {
    throw new Error('This link could not unlock the project. Please copy the whole link and try again.');
  }
  return importBackup(text);
}
