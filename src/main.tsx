import { render } from 'preact';
import { useState } from 'preact/hooks';
import { App } from './ui/app';
import { BudgetView } from './budget/BudgetView';
import { PhotosView } from './budget/PhotosView';
import { loadProject, saveProject } from './budget/store';
import './budget/budget.css';

type Tab = 'budget' | 'photos' | 'plans';
const TABS: { id: Tab; label: string }[] = [
  { id: 'budget', label: 'Costs' },
  { id: 'photos', label: 'Photos' },
  { id: 'plans', label: 'Plans' },
];

const plans = new App();
const project = loadProject();
const shell = document.getElementById('shell')!;

function Root() {
  const [tab, setTabState] = useState<Tab>('budget');
  const [, tick] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);

  const setTab = (t: Tab) => {
    shell.dataset.tab = t;
    setTabState(t);
  };
  const changed = () => {
    setSaveFailed(!saveProject(project));
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
          <p class="device-note">
            {saveFailed
              ? 'Your last change could not be saved. The browser storage may be full or switched off.'
              : 'Everything here is saved in this browser on this device only. Sharing between your devices is the next thing being built.'}
          </p>
          {tab === 'budget' && <BudgetView project={project} changed={changed} />}
          {tab === 'photos' && <PhotosView project={project} changed={changed} measure={measure} />}
        </main>
      )}
    </>
  );
}

render(<Root />, document.getElementById('root')!);
