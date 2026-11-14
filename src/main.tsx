import { render } from 'preact';
import { useState } from 'preact/hooks';
import { App } from './ui/app';
import { BudgetView } from './budget/BudgetView';
import { PhotosView } from './budget/PhotosView';
import { LayoutView } from './budget/LayoutView';
import { loadProject, photoBlob, photoCloud, saveProject } from './budget/store';
import { Cloud } from './budget/cloud';
import { Sharing } from './budget/Sharing';
import './budget/budget.css';

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
          <Sharing cloud={cloud} status={cloud.status} saveFailed={saveFailed} />
          {tab === 'budget' && <BudgetView project={project} changed={changed} />}
          {tab === 'layout' && <LayoutView project={project} changed={changed} />}
          {tab === 'photos' && <PhotosView project={project} changed={changed} measure={measure} />}
        </main>
      )}
    </>
  );
}

render(<Root />, document.getElementById('root')!);
