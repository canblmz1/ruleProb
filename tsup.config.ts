import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { 'cli/index': 'src/cli/index.ts' },
    format: ['esm'],
    target: 'node18',
    clean: true,
    dts: true,
    outDir: 'dist',
    banner: { js: '#!/usr/bin/env node' }
  },
  {
    entry: { 'index': 'src/index.ts' },
    format: ['esm'],
    target: 'node18',
    dts: true,
    outDir: 'dist'
  }
]);
