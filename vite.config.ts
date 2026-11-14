import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // Shown at the bottom of the app, so it is easy to tell which version a device is running.
  define: { __BUILD__: JSON.stringify(new Date().toISOString()) },
});
