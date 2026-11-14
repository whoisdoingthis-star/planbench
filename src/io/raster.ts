// Opens pictures and PDF pages as a flat "underlay" you can measure and (later) trace over.
import type { Drawing, Underlay } from '../model/types';

const MM_PER_POINT = 25.4 / 72;
/** Longest side, in pixels, that a PDF page is drawn at. Big enough to zoom in on small text. */
const PDF_LONG_SIDE = 5000;

function underlayDrawing(name: string, underlay: Underlay, unitNote: string): Drawing {
  return {
    name,
    layers: [],
    prims: [],
    bbox: { minX: underlay.x, minY: underlay.y, maxX: underlay.x + underlay.w, maxY: underlay.y + underlay.h },
    unitNote,
    underlay,
    scaled: false,
  };
}

export async function openImage(file: Blob, name: string): Promise<Drawing> {
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error('This picture could not be opened. It may be damaged or a kind of picture the browser cannot show.');
  }
  // A picture has no real size until the scale is set; start at 1 pixel = 1 mm.
  return underlayDrawing(name, { image, x: 0, y: 0, w: image.width, h: image.height }, 'Pictures have no scale until you set one.');
}

export interface PdfFile {
  pageCount: number;
  page(n: number, name: string): Promise<Drawing>;
}

export async function openPdf(data: ArrayBuffer): Promise<PdfFile> {
  // Loaded only when a PDF is opened, to keep the app quick to start.
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const base = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href;
  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  try {
    doc = await pdfjs.getDocument({ data, wasmUrl: `${base}wasm/`, standardFontDataUrl: `${base}standard_fonts/` }).promise;
  } catch (err) {
    const password = err instanceof Error && err.name === 'PasswordException';
    throw new Error(
      password
        ? 'This PDF is locked with a password, so it cannot be opened here.'
        : 'This PDF could not be opened. It may be damaged.',
    );
  }
  return {
    pageCount: doc.numPages,
    async page(n: number, name: string): Promise<Drawing> {
      const page = await doc.getPage(n);
      const size = page.getViewport({ scale: 1 }); // in points, 72 to the inch
      const scale = PDF_LONG_SIDE / Math.max(size.width, size.height);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const w = size.width * MM_PER_POINT;
      const h = size.height * MM_PER_POINT;
      // Starts at the size of the printed sheet; setting the scale turns that into real sizes.
      return underlayDrawing(name, { image: canvas, x: 0, y: 0, w, h, paperW: w }, 'PDF plans need their scale setting before measuring.');
    },
  };
}

/** How much to enlarge the drawing so the line between two picked points has the stated real length. */
export function factorFromKnownLength(currentLength: number, realLength: number): number {
  if (!(currentLength > 0) || !(realLength > 0)) throw new Error('Both lengths must be more than zero.');
  return realLength / currentLength;
}

/** How much to enlarge a PDF so that it is at a printed scale such as 1:100. */
export function factorFromPrintedScale(u: Underlay, oneTo: number): number {
  if (!u.paperW) throw new Error('Only PDF pages have a printed scale.');
  return (oneTo * u.paperW) / u.w;
}
