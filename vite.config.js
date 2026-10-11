import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Base matches the GitHub Pages project URL:
// https://astellato.github.io/WebGL-AudioViz/
//
// HTTPS (with a self-signed cert from @vitejs/plugin-basic-ssl) is required
// for getUserMedia: mic capture only works in a secure context, and a phone
// reaching this dev/preview server over a plain-HTTP LAN IP is not one.
// `host: true` binds to all interfaces so the LAN can reach it.
export default defineConfig({
  base: '/WebGL-AudioViz/',
  plugins: [basicSsl()],
  server: { host: true },
  preview: { host: true },
  // butterchurn (and its presets) ship as UMD/CJS bundles; prebundle them so
  // the dynamic import resolves to a proper ESM default export in dev as well
  // as in the production build.
  optimizeDeps: {
    include: ['butterchurn', 'butterchurn-presets'],
  },
});
