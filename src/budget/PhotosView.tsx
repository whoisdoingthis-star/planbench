import { useState } from 'preact/hooks';
import { type Photo, type Project, newId } from './model';
import { deletePhoto, photoBlob, storePhoto } from './store';
import { PhotoButton, PhotoImg } from './ui';

interface Props {
  project: Project;
  changed: () => void;
  /** Opens a photo in the Plans screen, where its scale can be set and it can be measured. */
  measure: (blob: Blob, name: string) => void;
}

const GROUPS: { id: Photo['group']; title: string; help: string }[] = [
  { id: 'now', title: 'Our kitchen now', help: 'Photos of the kitchen as it is today, so you can look back and compare.' },
  { id: 'ideas', title: 'Ideas we like', help: 'Pictures of kitchens, colours and details you would like to aim for.' },
];

export function PhotosView({ project: p, changed, measure }: Props) {
  const [big, setBig] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async (group: Photo['group'], files: File[]) => {
    setBusy(true);
    let failed = 0;
    for (const f of files) {
      const id = newId();
      try {
        await storePhoto(id, f);
        p.photos.push({ id, group, caption: '', addedAt: new Date().toISOString() });
      } catch { failed++; }
    }
    setBusy(false);
    changed();
    if (failed) alert(`${failed} ${failed === 1 ? 'photo' : 'photos'} could not be added.`);
  };
  const remove = (ph: Photo) => {
    if (!confirm('Delete this photo?')) return;
    void deletePhoto(ph.id);
    p.photos = p.photos.filter((x) => x.id !== ph.id);
    setBig(null);
    changed();
  };

  return (
    <div class="budget photos">
      {GROUPS.map((g) => {
        const list = p.photos.filter((x) => x.group === g.id);
        return (
          <section class="card" key={g.id}>
            <h2>{g.title}</h2>
            <p class="muted">{g.help}</p>
            <div class="grid">
              {list.map((ph) => (
                <figure key={ph.id}>
                  <button type="button" class="photo-open" onClick={() => setBig(ph)} aria-label="Show this photo larger">
                    <PhotoImg id={ph.id} alt={ph.caption || g.title} class="grid-img" />
                  </button>
                  <input aria-label="Caption" placeholder="Add a note" value={ph.caption} onInput={(e) => { ph.caption = e.currentTarget.value; changed(); }} />
                </figure>
              ))}
            </div>
            <PhotoButton class="primary" label={busy ? 'Adding…' : 'Add photos'} multiple onFiles={(f) => void add(g.id, f)} />
          </section>
        );
      })}

      {big && (
        <div class="lightbox" role="dialog" aria-label="Photo" onClick={() => setBig(null)}>
          <div class="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <PhotoImg id={big.id} alt={big.caption} class="lightbox-img" />
            <div class="row-actions">
              <button type="button" class="btn danger" onClick={() => remove(big)}>Delete</button>
              <span class="spacer" />
              <button type="button" class="btn" onClick={async () => { const b = await photoBlob(big.id); if (b) { measure(b, big.caption || 'Photo'); setBig(null); } }}>Measure on this photo</button>
              <button type="button" class="btn primary" onClick={() => setBig(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
