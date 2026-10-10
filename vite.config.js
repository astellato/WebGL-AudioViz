import { defineConfig } from 'vite';

// Base matches the GitHub Pages project URL:
// https://astellato.github.io/WebGL-AudioViz/
export default defineConfig({
  base: '/WebGL-AudioViz/',
  // butterchurn (and its presets) ship as UMD/CJS bundles; prebundle them so
  // the dynamic import resolves to a proper ESM default export in dev as well
  // as in the production build.
  optimizeDeps: {
    include: ['butterchurn', 'butterchurn-presets'],
  },
});
