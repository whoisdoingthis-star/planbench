import { useEffect, useRef, useState } from 'preact/hooks';
import type { Project } from './model';
import { chosenOption } from './model';
import type { HeightOption, Layout } from './layout';
import type { CameraState, Finish, Mounted } from './scene3d';
import { photoUrl } from './store';

/** Reads the look of the kitchen from what has been chosen on the Costs screen. */
export function finishFrom(p: Project): Finish & { words: string[] } {
  const find = (re: RegExp) => {
    for (const s of p.sections) for (const i of s.items) if (re.test(i.name) && i.included) return chosenOption(i);
    return null;
  };
  const handleOpt = find(/handle/i);
  const colourOpt = find(/door colour/i);
  const benchOpt = find(/^benchtop/i);
  const handles = handleOpt?.name ?? '';
  const colour = colourOpt?.name ?? '';
  const benchName = benchOpt?.name ?? '';
  const brass = /brass|gold/i.test(handles);
  const black = /black/i.test(handles);
  const grey = /grey|gray|seal|baikal|spinifex/i.test(colour);
  return {
    // A colour set on the chosen option wins; otherwise guess from its name.
    door: colourOpt?.swatch ?? (grey ? '#8f969b' : '#f6f6f3'),
    handle: handleOpt?.swatch ?? (brass ? '#b8935a' : black ? '#26282b' : '#b9bdc2'),
    bench: benchOpt?.swatch ?? (/black|dark/i.test(benchName) ? '#3a3d41' : '#ece8de'),
    words: [colour && `Doors: ${colour}`, handles && `Handles: ${handles}`, benchName && `Benchtop: ${benchName}`].filter(Boolean) as string[],
  };
}

export function Kitchen3D({ project, layout, option }: { project: Project; layout: Layout; option: HeightOption }) {
  const box = useRef<HTMLDivElement>(null);
  const mounted = useRef<Mounted | null>(null);
  const cam = useRef<CameraState | undefined>(undefined);
  const [problem, setProblem] = useState('');
  const finish = finishFrom(project);
  // Rebuild the model whenever anything it is drawn from changes.
  const signature = JSON.stringify([layout, option, finish.door, finish.handle, finish.bench]);

  useEffect(() => {
    let cancelled = false;
    const el = box.current;
    if (!el) return;
    // Wait a moment before rebuilding, so that typing a number or dragging does not rebuild on every step.
    const timer = window.setTimeout(() => void (async () => {
      try {
        const [{ mountKitchen }, splash, floor, bench] = await Promise.all([
          import('./scene3d'),
          layout.splashPhoto ? photoUrl(layout.splashPhoto) : Promise.resolve(null),
          layout.floorPhoto ? photoUrl(layout.floorPhoto) : Promise.resolve(null),
          layout.benchPhoto ? photoUrl(layout.benchPhoto) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (mounted.current) cam.current = mounted.current.camera();
        const next = await mountKitchen(el, layout, option, finish, { splash, floor, bench }, cam.current);
        if (cancelled) { next.dispose(); return; }
        mounted.current?.dispose();
        mounted.current = next;
        setProblem('');
      } catch {
        if (!cancelled) setProblem('The 3D view could not be shown on this device.');
      }
    })(), mounted.current ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [signature]);
  // Tidy up when leaving the screen.
  useEffect(() => () => { mounted.current?.dispose(); mounted.current = null; }, []);

  return (
    <div>
      <div class="view3d" ref={box} data-testid="view3d" />
      {problem && <p class="notice">{problem}</p>}
      {layout.zones.length > 0 && (
        <div class="row-actions">
          <span class="muted" style="margin:0">Look at:</span>
          <button type="button" class="btn small" onClick={() => mounted.current?.view('room')}>The whole room</button>
          <button type="button" class="btn small" onClick={() => mounted.current?.view('kitchen')}>The kitchen</button>
        </div>
      )}
      <p class="muted">Drag to look around, pinch or scroll to zoom. {finish.words.join(' · ')}</p>
    </div>
  );
}
