import { useEffect, useRef, useState } from 'preact/hooks';
import { photoUrl } from './store';

/** Shows a stored photo. */
export function PhotoImg({ id, alt, class: cls }: { id: string; alt: string; class?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void photoUrl(id).then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [id]);
  return url ? <img src={url} alt={alt} class={cls} /> : <div class={`${cls ?? ''} photo-missing`} aria-label={alt} />;
}

/** A button that opens the camera roll (or camera on a phone) and hands back the chosen pictures. */
export function PhotoButton({ label, multiple, onFiles, class: cls }: { label: string; multiple?: boolean; onFiles: (f: File[]) => void; class?: string }) {
  return (
    <label class={`btn ${cls ?? ''}`}>
      {label}
      <input
        type="file"
        accept="image/*"
        multiple={multiple}
        hidden
        onChange={(e) => {
          const input = e.currentTarget;
          const files = [...(input.files ?? [])];
          input.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </label>
  );
}

/** A number box that accepts "12", "12.5" or "12,5" and ignores anything else until it makes sense. */
export function NumberBox({ value, onValue, label, prefix, class: cls }: { value: number; onValue: (n: number) => void; label: string; prefix?: string; class?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  // If the number changes from elsewhere (the other person edits it), show the new value,
  // but never overwrite what is being typed right now.
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el) el.value = value ? String(value) : '';
  }, [value]);
  return (
    <span class={`numbox ${cls ?? ''}`}>
      {prefix && <span class="prefix">{prefix}</span>}
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        aria-label={label}
        defaultValue={value ? String(value) : ''}
        placeholder="0"
        onInput={(e) => {
          const raw = e.currentTarget.value.trim().replace(',', '.');
          const n = raw === '' ? 0 : Number(raw);
          if (Number.isFinite(n) && n >= 0) onValue(n);
        }}
      />
    </span>
  );
}
