import { render } from 'preact';
import { useState } from 'preact/hooks';
import { App } from './ui/app';
import { BudgetView } from './budget/BudgetView';
import { PhotosView } from './budget/PhotosView';
import { LayoutView } from './budget/LayoutView';
import { loadProject, photoBlob, photoCloud, saveProject } from './budget/store';
import { Cloud } from './budget/cloud';
import { Sharing } from './budget/Sharing';
import { openSharedLink, sharedLinkId } from './budget/sharedLink';
import { replaceProject } from './budget/model';
import './budget/budget.css';

declare const __BUILD__: string;
const BUILD = new Date(__BUILD__).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

type Tab = 'budget' | 'layout' | 'photos' | 'plans';
const TABS: { id: Tab; label: string }[] = [
  { id: 'budget', label: 'Costs' },
  { id: 'layout', label: 'Layout' },
  { id: 'photos', label: 'Photos' },
  { id: 'plans', label: 'Plans' },
];

const plans = new App();
const project = loadProject();
const shell = document.getElementById('shell')!;

// Set by the screen once it is showing, so that changes arriving from another device redraw it.
let refresh: () => void = () => {};
const cloud = new Cloud(
  project,
  (replaced) => {
    if (replaced) saveProject(project);
    refresh();
  },
  { get: photoBlob },
);
photoCloud.queue = (ids) => cloud.queuePhotos(ids);
photoCloud.download = (id) => cloud.downloadPhoto(id);
photoCloud.remove = (id) => cloud.deletePhoto(id);

// A private link (…#open=…) loads the project it points at, once per device.
let linkMessage = '';
async function followPrivateLink(): Promise<void> {
  const hash = window.location.hash;
  const id = sharedLinkId(hash);
  if (!hash.startsWith('#open=')) return;
  const seenKey = `planbench.opened.${id}`;
  const clear = () => window.history.replaceState(null, '', window.location.pathname + window.location.search);
  try {
    let seen = false;
    try { seen = !!id && localStorage.getItem(seenKey) === '1'; } catch { /* private window */ }
    if (seen) { clear(); return; } // already loaded here before: keep any changes made since
    linkMessage = 'Opening your project…';
    refresh();
    const next = await openSharedLink(hash, import.meta.env.BASE_URL);
    const hasWork = project.sections.some((s) => s.items.some((i) => i.options.length > 0));
    if (!hasWork || confirm(`Replace what is on this device with “${next.name}” from the link?`)) {
      replaceProject(project, next);
      saveProject(project);
      cloud.localChanged();
      // Only remember the link once it has actually been loaded, so saying "no" can be changed later.
      try { localStorage.setItem(seenKey, '1'); } catch { /* ignore */ }
      linkMessage = `Loaded “${next.name}” from the link.`;
      window.setTimeout(() => { if (linkMessage.startsWith('Loaded')) { linkMessage = ''; refresh(); } }, 6000);
    } else {
      linkMessage = 'Nothing was changed. Open the link again if you do want to load it.';
    }
    clear();
  } catch (err) {
    linkMessage = err instanceof Error ? err.message : 'The link could not be opened.';
  }
  refresh();
}

function Root() {
  const [tab, setTabState] = useState<Tab>('budget');
  const [, tick] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  refresh = () => tick((n) => n + 1);

  const setTab = (t: Tab) => {
    shell.dataset.tab = t;
    setTabState(t);
  };
  const changed = () => {
    setSaveFailed(!saveProject(project));
    cloud.localChanged();
    tick((n) => n + 1);
  };
  const measure = (blob: Blob, name: string) => {
    setTab('plans');
    // Give the Plans screen a moment to appear before the photo is fitted to it.
    setTimeout(() => void plans.openPicture(blob, name), 60);
  };

  return (
    <>
      <nav id="nav" aria-label="Sections of Planbench">
        <span class="brand">Planbench</span>
        <div class="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </nav>
      {tab !== 'plans' && (
        <main class="page">
          {linkMessage && <div class="share-bar warn" role="status" data-testid="link-message">{linkMessage}</div>}
          <Sharing cloud={cloud} status={cloud.status} saveFailed={saveFailed} />
          {tab === 'budget' && <BudgetView project={project} changed={changed} />}
          {tab === 'layout' && <LayoutView project={project} changed={changed} />}
          {tab === 'photos' && <PhotosView project={project} changed={changed} measure={measure} />}
          <p class="build" data-testid="build">Planbench version: {BUILD}</p>
        </main>
      )}
    </>
  );
}

render(<Root />, document.getElementById('root')!);
(window as unknown as { planbenchStarted: boolean }).planbenchStarted = true;
void followPrivateLink();
// A link clicked while the app is already open only changes the part after the #, which does not
// reload the page, so watch for that as well.
window.addEventListener('hashchange', () => void followPrivateLink());
