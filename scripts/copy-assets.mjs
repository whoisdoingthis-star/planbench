// Copies the helper files the PDF reader needs (image decoders and standard fonts)
// into public/pdfjs so they are served alongside the app. Run automatically before dev and build.
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const from = new URL('../node_modules/pdfjs-dist/', import.meta.url);
const to = new URL('../public/pdfjs/', import.meta.url);
rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
for (const dir of ['wasm', 'standard_fonts']) cpSync(new URL(dir, from), new URL(dir, to), { recursive: true });
