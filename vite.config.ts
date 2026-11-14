import { defineConfig, type Plugin } from 'vite';

/**
 * Puts the stylesheet inside the page itself instead of in a separate file.
 * A browser that catches the site in the middle of an update can otherwise end up
 * with the page but not its styling, which looks broken.
 */
function inlineCss(): Plugin {
  return {
    name: 'planbench-inline-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName === 'index.html');
      if (!html || html.type !== 'asset') return;
      let page = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type !== 'asset' || !name.endsWith('.css')) continue;
        const tag = new RegExp(`<link[^>]*href="[^"]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`);
        if (!tag.test(page)) continue;
        page = page.replace(tag, () => `<style>${String(file.source)}</style>`);
        delete bundle[name];
      }
      html.source = page;
    },
  };
}

export default defineConfig({
  base: './',
  // Shown at the bottom of the app, so it is easy to tell which version a device is running.
  define: { __BUILD__: JSON.stringify(new Date().toISOString()) },
  plugins: [inlineCss()],
});
