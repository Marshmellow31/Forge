import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Kept separate from `vite.config.ts` so the app build never loads the test
 * plugins, and so `tsc -b` typechecks the app without pulling in test globals.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'src/app'),
      '@modules': path.resolve(__dirname, 'src/modules'),
      '@core': path.resolve(__dirname, 'src/core'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@mock': path.resolve(__dirname, 'src/mock'),
      '@config': path.resolve(__dirname, 'src/config'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    //  holds the serverless handlers. Their tests live beside them and
    // were outside this glob until ADR-028 — the ID-token verification in
    // front of the upload endpoints had never been executed by anything.
    include: [
      'src/**/*.test.ts', 'src/**/*.test.tsx',
      'api/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    // Rules tests need the emulator and a long fuse; they opt in by name.
    exclude: ['node_modules/**', 'dist/**', 'tests/rules/**'],
  },
});
