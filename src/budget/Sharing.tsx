import { useState } from 'preact/hooks';
import type { Cloud, CloudStatus } from './cloud';

const WORDS: Record<CloudStatus['state'], string> = {
  'signed-out': '',
  starting: 'Opening the shared project…',
  saved: 'All changes saved and shared',
  saving: 'Saving…',
  offline: 'No connection',
  problem: 'Not saved to the shared project',
};

/** The strip under the top bar: sign in, see whether changes are saved, and choose who shares the project. */
export function Sharing({ cloud, status, saveFailed }: { cloud: Cloud; status: CloudStatus; saveFailed: boolean }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [working, setWorking] = useState(false);

  if (saveFailed) {
    return <div class="share-bar warn">Your last change could not be saved on this device. The browser storage may be full or switched off.</div>;
  }

  if (!status.email) {
    const send = async (e: Event) => {
      e.preventDefault();
      setWorking(true);
      const problem = await cloud.sendLink(email);
      setWorking(false);
      setNote(problem ?? '');
      setSent(!problem);
    };
    return (
      <div class="share-bar">
        {sent ? (
          <span>We have emailed a sign-in link to <strong>{email}</strong>. Open it on this device to finish signing in. <button type="button" class="link" onClick={() => setSent(false)}>Use a different address</button></span>
        ) : (
          <form onSubmit={send}>
            <label for="signin-email">Saved on this device only. To share between devices, sign in with your email:</label>
            <input id="signin-email" type="email" required autocomplete="email" placeholder="you@example.com" value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
            <button type="submit" class="btn small primary" disabled={working}>{working ? 'Sending…' : 'Email me a sign-in link'}</button>
          </form>
        )}
        {note && <div class="share-error" role="alert">{note}</div>}
      </div>
    );
  }

  const add = async (e: Event) => {
    e.preventDefault();
    setWorking(true);
    const problem = await cloud.invite(email);
    setWorking(false);
    setNote(problem ?? `Added. They can now sign in here with ${email.trim().toLowerCase()}.`);
    if (!problem) setEmail('');
  };
  const bad = status.state === 'offline' || status.state === 'problem';
  return (
    <div class={`share-bar ${bad ? 'warn' : ''}`}>
      <div class="share-line">
        <span class={`dot ${status.state}`} aria-hidden="true" />
        <span>{status.message || WORDS[status.state]}</span>
        <span class="spacer" />
        <button type="button" class="link" aria-expanded={open} onClick={() => { setOpen(!open); setNote(''); }}>Sharing ({status.members.length || 1})</button>
      </div>
      {open && (
        <div class="share-panel">
          <p>Signed in as <strong>{status.email}</strong>. <button type="button" class="link" onClick={() => void cloud.signOut()}>Sign out</button></p>
          <p>People who can see and change this project:</p>
          <ul>
            {status.members.map((m) => (
              <li key={m}>
                {m}{m === status.email ? ' (you)' : ''}
                {m !== status.email && <button type="button" class="link danger" onClick={() => { if (confirm(`Stop sharing with ${m}?`)) void cloud.remove(m); }}>Remove</button>}
              </li>
            ))}
          </ul>
          <form onSubmit={add}>
            <label for="invite-email">Share with someone else:</label>
            <input id="invite-email" type="email" required placeholder="their email address" value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
            <button type="submit" class="btn small primary" disabled={working}>Add</button>
          </form>
          {note && <div class="share-note" role="status">{note}</div>}
        </div>
      )}
    </div>
  );
}
