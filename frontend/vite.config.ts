import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// publicDir points at ../data so data/jobs.json (written daily by the scraper)
// is served at <base>jobs.json in dev and copied into dist on build.
// /api is proxied to the local Warmline server so the app uses same-origin URLs.
export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: '../data',
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
});
