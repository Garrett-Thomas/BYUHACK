import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// publicDir points at ../data so data/jobs.json (written daily by the scraper)
// is served at <base>jobs.json in dev and copied into dist on build.
export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: '../data',
});
