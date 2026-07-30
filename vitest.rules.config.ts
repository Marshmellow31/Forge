import { defineConfig } from 'vitest/config';

/**
 * Rules tests run against the Firestore emulator, so they are slow, serial, and
 * excluded from `npm run test`. Run them with `npm run test:rules`, which starts
 * the emulator around them.
 *
 * **Requires JDK 21+**, which the Firestore emulator will not start without.
 * If `java -version` reports 8, you may already have a modern JDK bundled with
 * Android Studio. On Windows:
 *
 *   $env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
 *   $env:PATH="$env:JAVA_HOME\bin;$env:PATH"
 *   npm run test:rules
 *
 * Expect a wall of `PERMISSION_DENIED` lines on stderr while it runs — those
 * are the `assertFails` cases doing their job, not failures.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // A shared emulator instance cannot serve parallel suites deterministically.
    fileParallelism: false,
  },
});
