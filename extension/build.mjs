import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

await build({
  entryPoints: {
    content: 'src/content.ts',
    background: 'src/background.ts',
    options: 'src/options.ts',
  },
  bundle: true,
  outdir: 'dist',
  target: 'chrome110',
  format: 'iife',
  sourcemap: false,
  logLevel: 'info',
});

await cp('static', 'dist', { recursive: true });
