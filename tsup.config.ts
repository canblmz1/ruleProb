import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { 'cli/index': 'src/cli/index.ts' },
    format: ['esm'],
    target: 'node18',
    clean: true,
    dts: true,
    outDir: 'dist',
    banner: { js: '#!/usr/bin/env node' },
    esbuildOptions(options) {
      options.jsx = 'automatic';
    }
  },
  {
    entry: { 'index': 'src/index.ts' },
    format: ['esm'],
    target: 'node18',
    dts: true,
    outDir: 'dist',
    esbuildOptions(options) {
      options.jsx = 'automatic';
    }
  },
  {
    entry: {
      'integrations/express': 'src/integrations/express.ts',
      'integrations/next': 'src/integrations/next.ts',
      'integrations/index': 'src/integrations/index.ts',
    },
    format: ['esm'],
    target: 'node18',
    dts: true,
    outDir: 'dist',
    esbuildOptions(options) {
      options.jsx = 'automatic';
    }
  }
]);
